import * as cheerio from "cheerio";
import { asc, eq, sql } from "drizzle-orm";
import { db, articleUrlsTable, articlesTable, scraperProgressTable } from "@workspace/db";
import { logger } from "./logger";

const BASE_URL = "https://support.sw.siemens.com/en-US/product/272221135/knowledge-base";
const ARTICLE_URL = (id: string) => `${BASE_URL}/${id}`;
const PRIORITY_CATEGORIES = [
  "Installation & Upgrade",
  "Getting Started",
  "Administration - Tools and Utilities",
  "Administration - Workflow",
  "Core Functions - Client",
  "Active Workspace - Client Framework",
  "Active Workspace - Client Configuration",
  "Problem/Defect",
  "Programming and Customization",
] as const;
const SKIPPED_CATEGORIES = [
  "Engineering Process Management - Integration for CATIA",
  "Service Lifecycle Management",
  "Machine Builders",
] as const;
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
    currentPage: 0,
    totalPages: 0,
    articlesScraped: 0,
    status: "idle",
    phase: "content",
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

const SEEDED_ARTICLE_PATTERN = /\/knowledge-base\/(KB\d+_EN_US|PL\d+)/i;

function normalizeSeedUrl(value: string): string | null {
  const match = value.trim().match(SEEDED_ARTICLE_PATTERN);
  return match ? ARTICLE_URL(match[1].toUpperCase()) : null;
}

export async function seedArticleUrls(urls: string[]) {
  let added = 0;
  let skipped = 0;
  let invalid = 0;
  for (const value of urls) {
    const url = normalizeSeedUrl(value);
    if (!url) {
      invalid += 1;
      continue;
    }
    const [inserted] = await db.insert(articleUrlsTable).values({
      url,
      priority: 999,
      scraped: false,
      scrapedAt: null,
      lastError: null,
    }).onConflictDoNothing({ target: articleUrlsTable.url }).returning({ id: articleUrlsTable.id });
    if (inserted) added += 1;
    else skipped += 1;
  }
  return { added, skipped, invalid };
}

function extractArticleIds(html: string): string[] {
  const ids = new Set<string>();
  for (const match of html.matchAll(/\/knowledge-base\/(KB\d+_EN_US|PL\d+)/gi)) ids.add(match[1].toUpperCase());
  return [...ids];
}

function normalizeCategory(value: string): string {
  return value.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

function categoryDetails(value: string | undefined) {
  if (!value) return { category: null, priority: 999, skipped: false };
  const normalized = normalizeCategory(value);
  const category = [...PRIORITY_CATEGORIES, ...SKIPPED_CATEGORIES].find((candidate) =>
    normalized.includes(normalizeCategory(candidate)),
  ) ?? null;
  if (!category) return { category: null, priority: 999, skipped: false };
  const priorityIndex = PRIORITY_CATEGORIES.indexOf(category as (typeof PRIORITY_CATEGORIES)[number]);
  return {
    category,
    priority: priorityIndex === -1 ? 1000 : priorityIndex + 1,
    skipped: SKIPPED_CATEGORIES.includes(category as (typeof SKIPPED_CATEGORIES)[number]),
  };
}

function categoryFromMarkup(article$: cheerio.CheerioAPI, contextSelector: string): ReturnType<typeof categoryDetails> {
  const candidates = [
    article$("meta[name='category'], meta[property='article:section']").map((_, node) => article$(node).attr("content") ?? "").get(),
    article$("[data-category], [data-content-category], [class*='category'], [class*='breadcrumb']").map((_, node) => article$(node).text()).get(),
    article$(contextSelector).text(),
  ];
  for (const candidate of candidates.flat()) {
    const details = categoryDetails(candidate);
    if (details.category) return details;
  }
  return categoryDetails(undefined);
}

function extractArticleLinks(html: string) {
  const article$ = cheerio.load(html);
  const links = new Map<string, { id: string; category: string | null; priority: number; skipped: boolean }>();
  article$("a[href*='/knowledge-base/']").each((_, node) => {
    const href = article$(node).attr("href") ?? "";
    const match = href.match(/\/knowledge-base\/(KB\d+_EN_US|PL\d+)/i);
    if (!match) return;
    const id = match[1].toUpperCase();
    const context = article$(node).closest("article, li, [class*='card'], [class*='result'], [class*='item']").first().text()
      || article$(node).parent().text();
    const details = categoryDetails(context);
    links.set(id, { id, ...details });
  });
  for (const id of extractArticleIds(html)) {
    if (!links.has(id)) links.set(id, { id, ...categoryDetails(undefined) });
  }
  return [...links.values()];
}

async function discoverPage(page: number, headers: Record<string, string>) {
  const response = await fetch(`${BASE_URL}?page=${page}`, { headers });
  if (!response.ok) throw new Error(`GTAC returned ${response.status} while discovering page ${page}`);
  const links = extractArticleLinks(await response.text());
  for (const link of links) {
    await db.insert(articleUrlsTable).values({
      url: ARTICLE_URL(link.id),
      category: link.category,
      priority: link.priority,
      scraped: link.skipped,
      scrapedAt: link.skipped ? new Date() : null,
      lastError: link.skipped ? "Skipped excluded category" : null,
    }).onConflictDoNothing({ target: articleUrlsTable.url });
  }
  return links.length;
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
  const category = categoryFromMarkup(article$, "main, article, nav");
  return { title, content: content.slice(0, 100000), tags: extractTags(article$), sourceUpdatedAt: parseSourceDate(article$), ...category };
}

async function runDiscovery(startPage: number, headers: Record<string, string>) {
  for (let page = startPage; page <= TOTAL_PAGES; page += 1) {
    await discoverPage(page, headers);
    await updateProgress({ phase: "discover", status: "running", currentPage: page, totalPages: TOTAL_PAGES, lastRun: new Date() });
    if (page < TOTAL_PAGES) await wait(2000);
  }
}

async function runContentScrape(articleCount: number) {
  const pending = await db.select().from(articleUrlsTable)
    .where(eq(articleUrlsTable.scraped, false))
    .orderBy(sql`coalesce(${articleUrlsTable.priority}, 999)`, asc(articleUrlsTable.discoveredAt));
  let scrapedCount = articleCount;
  for (const queued of pending) {
    try {
      const article = await scrapePublicArticle(queued.url);
      if (!article) {
        await db.update(articleUrlsTable).set({ scraped: true, scrapedAt: new Date(), lastError: "Skipped video-only entry" }).where(eq(articleUrlsTable.id, queued.id));
        continue;
      }
      if (article.skipped) {
        await db.update(articleUrlsTable).set({ scraped: true, scrapedAt: new Date(), category: article.category, priority: article.priority, lastError: "Skipped excluded category" }).where(eq(articleUrlsTable.id, queued.id));
        continue;
      }
      await db.insert(articlesTable).values({
        ...article,
        category: article.category ?? queued.category ?? "GTAC Knowledge Base",
        url: queued.url,
      }).onConflictDoNothing({ target: articlesTable.url });
      await db.update(articleUrlsTable).set({ scraped: true, scrapedAt: new Date(), category: article.category ?? queued.category, priority: article.priority, lastError: null }).where(eq(articleUrlsTable.id, queued.id));
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
      if (!queueCount?.total) throw new Error("GTAC discovery found no knowledge-base article URLs");
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