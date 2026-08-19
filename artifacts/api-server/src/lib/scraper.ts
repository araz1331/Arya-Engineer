import * as cheerio from "cheerio";
import { db, articlesTable, scraperProgressTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const BASE_URL = "https://support.sw.siemens.com/en-US/product/272221135/knowledge-base";
let activeRun = false;

function parseCurl(curl: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!curl) return headers;
  const matches = curl.matchAll(/(?:-H|--header)\s+["']([^"']+)["']/gi);
  for (const match of matches) {
    const [name, ...value] = match[1].split(":");
    if (name && value.length) headers[name.trim()] = value.join(":").trim();
  }
  const cookie = curl.match(/(?:-b|--cookie)\s+["']([^"']+)["']/i)?.[1];
  if (cookie) headers.Cookie = cookie;
  return headers;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function updateProgress(values: Partial<typeof scraperProgressTable.$inferInsert>) {
  const [current] = await db.select().from(scraperProgressTable).limit(1);
  if (current) {
    await db.update(scraperProgressTable).set(values).where(eq(scraperProgressTable.id, current.id));
    return;
  }
  await db.insert(scraperProgressTable).values({
    currentPage: 1,
    totalPages: 108,
    articlesScraped: 0,
    status: "idle",
    ...values,
  });
}

function safeResponseHeaders(headers: Headers): Record<string, string> {
  const safe: Record<string, string> = {};
  headers.forEach((value, name) => {
    const normalized = name.toLowerCase();
    if (normalized.includes("cookie") || normalized.includes("authorization") || normalized.includes("proxy-auth")) {
      safe[name] = "[redacted]";
      return;
    }
    safe[name] = value;
  });
  return safe;
}

export async function debugScrape() {
  const headers = parseCurl(process.env.SIEMENS_CURL);
  try {
    const response = await fetch(BASE_URL, { headers });
    const bodyPreview = (await response.text()).slice(0, 500);
    return {
      statusCode: response.status,
      responseHeaders: safeResponseHeaders(response.headers),
      bodyPreview,
    };
  } catch (error) {
    return {
      statusCode: 502,
      responseHeaders: {},
      bodyPreview: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    };
  }
}

function absoluteUrl(href: string): string {
  return href.startsWith("http") ? href : new URL(href, "https://support.sw.siemens.com").toString();
}

async function scrapePage(page: number, headers: Record<string, string>) {
  const response = await fetch(`${BASE_URL}?page=${page}`, { headers });
  if (!response.ok) throw new Error(`GTAC returned ${response.status} on page ${page}`);
  const html = await response.text();
  const $ = cheerio.load(html);
  const links = new Set<string>();
  $("a[href]").each((_, node) => {
    const href = $(node).attr("href");
    if (href && /knowledge-base|article|solution/i.test(href)) links.add(absoluteUrl(href));
  });
  const candidates = Array.from(links).slice(0, 10);
  const articles = [];
  for (const url of candidates) {
    const articleResponse = await fetch(url, { headers });
    if (!articleResponse.ok) continue;
    const articleHtml = await articleResponse.text();
    const article$ = cheerio.load(articleHtml);
    const title = article$("h1").first().text().trim() || article$("title").text().trim();
    const content = article$("main").text().replace(/\s+/g, " ").trim() || article$("body").text().replace(/\s+/g, " ").trim();
    if (!title || content.length < 80) continue;
    articles.push({ title, content: content.slice(0, 30000), category: "GTAC Knowledge Base", tags: [], url });
  }
  return articles;
}

export async function runScraper(): Promise<void> {
  if (activeRun) return;
  activeRun = true;
  const headers = parseCurl(process.env.SIEMENS_CURL);
  try {
    const [progress] = await db.select().from(scraperProgressTable).limit(1);
    const startPage = progress?.status === "error" ? Math.max(1, progress.currentPage) : progress?.status === "running" ? Math.max(1, progress.currentPage) : 1;
    const totalPages = progress?.totalPages ?? 108;
    await updateProgress({ status: "running", currentPage: startPage, totalPages, lastRun: new Date(), lastError: null });
    let count = progress?.articlesScraped ?? 0;
    for (let page = startPage; page <= totalPages; page += 1) {
      const articles = await scrapePage(page, headers);
      for (const article of articles) {
        await db.insert(articlesTable).values(article).onConflictDoNothing({ target: articlesTable.url });
        count += 1;
      }
      await updateProgress({ status: "running", currentPage: page + 1, articlesScraped: count, lastRun: new Date() });
      if (page < totalPages) await wait(2000);
    }
    await updateProgress({ status: "complete", currentPage: totalPages, articlesScraped: count, lastRun: new Date(), lastError: null });
  } catch (error) {
    logger.error({ error }, "Teamcenter scraper failed");
    const [progress] = await db.select().from(scraperProgressTable).limit(1);
    const lastError = error instanceof Error ? error.message : String(error);
    await updateProgress({ status: "error", currentPage: progress?.currentPage ?? 1, articlesScraped: progress?.articlesScraped ?? 0, lastRun: new Date(), lastError });
  } finally {
    activeRun = false;
  }
}

export async function getScraperStatus() {
  const [progress] = await db.select().from(scraperProgressTable).limit(1);
  return progress ?? { status: "idle", currentPage: 1, totalPages: 108, articlesScraped: 0, lastRun: null, lastError: null };
}