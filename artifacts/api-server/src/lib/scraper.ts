import * as cheerio from "cheerio";
import { count, eq } from "drizzle-orm";
import { db, articleUrlsTable, articlesTable, scraperProgressTable } from "@workspace/db";
import { logger } from "./logger";

const BASE_URL = "https://support.sw.siemens.com/en-US/product/272221135/knowledge-base";
const TOTAL_PAGES = 108;
const ARTICLE_URL = (id: string) => `${BASE_URL}/${id}`;
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
    totalPages: TOTAL_PAGES,
    articlesScraped: 0,
    status: "idle",
    phase: "discover",
    ...values,
  });
}

function safeResponseHeaders(headers: Headers): Record<string, string> {
  const safe: Record<string, string> = {};
  headers.forEach((value, name) => {
    const normalized = name.toLowerCase();
    safe[name] = normalized.includes("cookie") || normalized.includes("authorization") || normalized.includes("proxy-auth")
      ? "[redacted]"
      : value;
  });
  return safe;
}

export async function debugScrape() {
  const headers = parseCurl(process.env.SIEMENS_CURL);
  try {
    const response = await fetch(BASE_URL, { headers });
    return { statusCode: response.status, responseHeaders: safeResponseHeaders(response.headers), bodyPreview: (await response.text()).slice(0, 500) };
  } catch (error) {
    return { statusCode: 502, responseHeaders: {}, bodyPreview: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) };
  }
}

function extractArticleIds(html: string): string[] {
  const ids = new Set<string>();
  for (const match of html.matchAll(/\b(?:PL\d+|KB\d+_EN_US)\b/gi)) ids.add(match[0].toUpperCase());
  return [...ids];
}

async function discoverPage(page: number, headers: Record<string, string>) {
  const response = await fetch(`${BASE_URL}?page=${page}`, { headers });
  if (!response.ok) throw new Error(`GTAC returned ${response.status} while discovering page ${page}`);
  const ids = extractArticleIds(await response.text());
  for (const id of ids) {
    await db.insert(articleUrlsTable).values({ url: ARTICLE_URL(id) }).onConflictDoNothing({ target: articleUrlsTable.url });
  }
  return ids.length;
}

function parseSourceDate(article$: cheerio.CheerioAPI): Date | null {
  const value = article$("meta[property='article:modified_time'], meta[name='date'], time[datetime]").first().attr("content")
    ?? article$("time[datetime]").first().attr("datetime");
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractTags(article$: cheerio.CheerioAPI): string[] {
  const keywordTags = article$("meta[name='keywords']").attr("content")?.split(",").map((tag) => tag.trim()).filter(Boolean) ?? [];
  const visibleTags = article$("[rel='tag'], .tag, [class*='tag']").map((_, node) => article$(node).text().trim()).get().filter(Boolean);
  return [...new Set([...keywordTags, ...visibleTags])].slice(0, 50);
}

async function scrapePublicArticle(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GTAC returned ${response.status} for public article ${url.split("/").pop()}`);
  const article$ = cheerio.load(await response.text());
  const title = article$("h1").first().text().replace(/\s+/g, " ").trim() || article$("title").text().trim();
  const mainContent = article$("main").text().replace(/\s+/g, " ").trim()
    || article$("article").text().replace(/\s+/g, " ").trim();
  const hasVideo = article$("video, iframe[src*='youtube'], iframe[src*='vimeo'], [class*='video'], [data-content-type='video'], [data-type='video']").length > 0;
  const content = mainContent || article$("body").text().replace(/\s+/g, " ").trim();
  if (hasVideo && mainContent.length < 120) return null;
  if (!title || content.length < 40) throw new Error(`Public article ${url.split("/").pop()} did not contain usable title/content`);
  return { title, content: content.slice(0, 100000), tags: extractTags(article$), sourceUpdatedAt: parseSourceDate(article$) };
}

async function runDiscovery(startPage: number, headers: Record<string, string>) {
  for (let page = startPage; page <= TOTAL_PAGES; page += 1) {
    await discoverPage(page, headers);
    await updateProgress({ phase: "discover", status: "running", currentPage: page, totalPages: TOTAL_PAGES, lastRun: new Date() });
    if (page < TOTAL_PAGES) await wait(2000);
  }
}

async function runContentScrape(articleCount: number) {
  const pending = await db.select().from(articleUrlsTable).where(eq(articleUrlsTable.scraped, false));
  let scrapedCount = articleCount;
  for (const queued of pending) {
    try {
      const article = await scrapePublicArticle(queued.url);
      if (!article) {
        await db.update(articleUrlsTable).set({ scraped: true, scrapedAt: new Date(), lastError: "Skipped video-only entry" }).where(eq(articleUrlsTable.id, queued.id));
        continue;
      }
      await db.insert(articlesTable).values({
        ...article,
        category: "GTAC Knowledge Base",
        url: queued.url,
      }).onConflictDoNothing({ target: articlesTable.url });
      await db.update(articleUrlsTable).set({ scraped: true, scrapedAt: new Date(), lastError: null }).where(eq(articleUrlsTable.id, queued.id));
      scrapedCount += 1;
      await updateProgress({ phase: "content", status: "running", currentPage: TOTAL_PAGES, articlesScraped: scrapedCount, lastRun: new Date() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.update(articleUrlsTable).set({ lastError: message }).where(eq(articleUrlsTable.id, queued.id));
      throw new Error(message);
    }
    if (queued !== pending[pending.length - 1]) await wait(2000);
  }
  return scrapedCount;
}

export async function runScraper(): Promise<void> {
  if (activeRun) return;
  activeRun = true;
  const headers = parseCurl(process.env.SIEMENS_CURL);
  try {
    const [progress] = await db.select().from(scraperProgressTable).limit(1);
    const phase = progress?.status === "error" || progress?.status === "running" ? progress.phase : "discover";
    const startPage = phase === "discover" ? Math.max(1, progress?.currentPage ?? 1) : TOTAL_PAGES;
    let countScraped = progress?.articlesScraped ?? 0;
    await updateProgress({ phase, status: "running", currentPage: startPage, totalPages: TOTAL_PAGES, lastRun: new Date(), lastError: null });
    if (phase === "discover") {
      await runDiscovery(startPage, headers);
      const [queueCount] = await db.select({ total: count() }).from(articleUrlsTable);
      await updateProgress({ phase: "content", status: "running", currentPage: TOTAL_PAGES, totalPages: TOTAL_PAGES, articlesScraped: countScraped, lastRun: new Date() });
      countScraped = Math.max(countScraped, 0);
      if (!queueCount?.total) throw new Error("GTAC discovery found no PL###### article IDs");
    }
    countScraped = await runContentScrape(countScraped);
    await updateProgress({ phase: "content", status: "complete", currentPage: TOTAL_PAGES, totalPages: TOTAL_PAGES, articlesScraped: countScraped, lastRun: new Date(), lastError: null });
  } catch (error) {
    logger.error({ error }, "Teamcenter scraper failed");
    const [progress] = await db.select().from(scraperProgressTable).limit(1);
    const lastError = error instanceof Error ? error.message : String(error);
    await updateProgress({ status: "error", phase: progress?.phase ?? "discover", currentPage: progress?.currentPage ?? 1, articlesScraped: progress?.articlesScraped ?? 0, lastRun: new Date(), lastError });
  } finally {
    activeRun = false;
  }
}

export async function getScraperStatus() {
  const [progress] = await db.select().from(scraperProgressTable).limit(1);
  return progress ?? { status: "idle", phase: "discover", currentPage: 1, totalPages: TOTAL_PAGES, articlesScraped: 0, lastRun: null, lastError: null };
}