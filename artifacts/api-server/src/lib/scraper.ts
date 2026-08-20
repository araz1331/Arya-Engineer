import * as cheerio from "cheerio";
import { asc, eq, sql } from "drizzle-orm";
import { db, articleUrlsTable, articlesTable, scraperProgressTable } from "@workspace/db";
import { logger } from "./logger";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { cleanContent } from "./content";

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
const CATEGORY_ALIASES: Array<{ canonical: string; patterns: string[] }> = [
  { canonical: "Installation & Upgrade", patterns: ["installation & upgrade", "installation and upgrade"] },
  { canonical: "Getting Started", patterns: ["getting started"] },
  { canonical: "Programming and Customization", patterns: ["programming and customization"] },
  { canonical: "Engineering Process Management - Integration for CATIA", patterns: ["engineering process management - integration for catia"] },
  { canonical: "Machine Builders", patterns: ["machine builders", "machine builder", "plm for machine builders", "industry solutions and functions - machine builder"] },
];
let activeRun = false;
type ScraperProgressListener = (status: Awaited<ReturnType<typeof getScraperStatus>>) => void;
const progressListeners = new Set<ScraperProgressListener>();

export function subscribeScraperProgress(listener: ScraperProgressListener) {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

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

function parseCookieHeader(value: string | undefined) {
  return (value ?? "")
    .split(";")
    .map((part) => part.trim())
    .map((part) => {
      const separator = part.indexOf("=");
      return separator > 0 ? { name: part.slice(0, separator).trim(), value: part.slice(separator + 1).trim() } : null;
    })
    .filter((cookie): cookie is { name: string; value: string } => Boolean(cookie?.name && cookie.value));
}

async function launchBrowser(): Promise<{ browser: Browser; page: Page }> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(30_000);
  page.setDefaultTimeout(15_000);

  const headers = parseCurl(process.env.SIEMENS_CURL);
  const nonCookieHeaders = Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.toLowerCase() !== "cookie"),
  );
  if (Object.keys(nonCookieHeaders).length) await page.setExtraHTTPHeaders(nonCookieHeaders);
  const cookies = parseCookieHeader(headers.Cookie);
  if (cookies.length) {
    await page.setCookie(...cookies.map((cookie) => ({
      ...cookie,
      domain: ".sw.siemens.com",
      path: "/",
      secure: true,
    })));
  }
  return { browser, page };
}

async function navigateRendered(page: Page, url: string) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  if (response && response.status() >= 400) {
    throw new Error(`GTAC returned ${response.status()} for ${url}`);
  }
  await page.waitForSelector("body");
  await wait(500);
}

async function updateProgress(values: Partial<typeof scraperProgressTable.$inferInsert>) {
  const [current] = await db.select().from(scraperProgressTable).limit(1);
  if (current) {
    await db.update(scraperProgressTable).set(values).where(eq(scraperProgressTable.id, current.id));
  } else {
    await db.insert(scraperProgressTable).values({
      currentPage: 0,
      totalPages: 0,
      articlesScraped: 0,
      status: "idle",
      phase: "content",
      ...values,
    });
  }
  const snapshot = await getScraperStatus();
  for (const listener of progressListeners) listener(snapshot);
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

function normalizeArticleUrl(value: string): string | null {
  try {
    const url = new URL(value, BASE_URL);
    const match = url.pathname.match(SEEDED_ARTICLE_PATTERN);
    return match ? ARTICLE_URL(match[1].toUpperCase()) : null;
  } catch {
    return null;
  }
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
  if (added > 0) {
    const [pending] = await db.select({ total: sql<number>`count(*)` }).from(articleUrlsTable).where(eq(articleUrlsTable.scraped, false));
    await updateProgress({
      phase: "content",
      status: "idle",
      currentPage: 0,
      totalPages: Number(pending?.total ?? 0),
      lastError: null,
    });
  }
  return { added, skipped, invalid };
}

function normalizeCategory(value: string): string {
  return value.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

function categoryDetails(value: string | undefined) {
  if (!value) return { category: null, priority: 999, skipped: false };
  const normalized = normalizeCategory(value);
  const alias = CATEGORY_ALIASES.find(({ patterns }) => patterns.some((pattern) => normalized.includes(pattern)));
  const category = alias?.canonical ?? [...PRIORITY_CATEGORIES, ...SKIPPED_CATEGORIES].find((candidate) =>
    normalized.includes(normalizeCategory(candidate)),
  ) ?? null;
  if (!category) {
    const label = value.replace(/\s+/g, " ").trim().replace(/^[|>:/\-\s]+|[|>:/\-\s]+$/g, "");
    return label.length > 0 && label.length <= 160
      ? { category: label, priority: 999, skipped: false }
      : { category: null, priority: 999, skipped: false };
  }
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
    article$(contextSelector).find("[data-category], [data-content-category], [class*='category'], [class*='breadcrumb']").map((_, node) => article$(node).text()).get(),
  ];
  for (const candidate of candidates.flat()) {
    const details = categoryDetails(candidate);
    if (details.category) return details;
  }
  return categoryDetails(undefined);
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

function parseArticleMarkup(markup: string) {
  const article$ = cheerio.load(markup);
  const title = article$("h1").first().text().replace(/\s+/g, " ").trim() || article$("title").text().trim();
  const mainContent = article$("main").text().replace(/\s+/g, " ").trim()
    || article$("article").text().replace(/\s+/g, " ").trim();
  const hasVideo = article$("video, iframe[src*='youtube'], iframe[src*='vimeo'], [class*='video'], [data-content-type='video'], [data-type='video']").length > 0;
  const content = mainContent || article$("body").text().replace(/\s+/g, " ").trim();
  if (hasVideo && mainContent.length < 120) return null;
  if (!title || content.length < 40) throw new Error("Rendered GTAC article did not contain usable title/content");
  const category = categoryFromMarkup(article$, "main, article, nav");
  return { title, content: cleanContent(content).slice(0, 100000), tags: extractTags(article$), sourceUpdatedAt: parseSourceDate(article$), ...category };
}

async function scrapeRenderedArticle(page: Page, url: string) {
  await navigateRendered(page, url);
  return parseArticleMarkup(await page.content());
}

async function discoverRenderedUrls(page: Page) {
  const discovered = new Map<string, string | undefined>();
  const visited = new Set<string>();
  let nextUrl: string | null = BASE_URL;
  let pageNumber = 0;

  while (nextUrl && !visited.has(nextUrl) && pageNumber < 250) {
    visited.add(nextUrl);
    pageNumber += 1;
    await navigateRendered(page, nextUrl);
    const links = await page.$$eval("a[href]", (anchors) => anchors.map((anchor: any) => ({
      href: anchor.href as string,
      text: String(anchor.textContent ?? "").replace(/\s+/g, " ").trim(),
    })));
    for (const link of links) {
      const articleUrl = normalizeArticleUrl(link.href);
      if (articleUrl) discovered.set(articleUrl, undefined);
    }
    await updateProgress({
      phase: "discover",
      status: "running",
      currentPage: pageNumber,
      totalPages: pageNumber,
      articlesScraped: 0,
      lastRun: new Date(),
    });
    const candidate = await page.$$eval("a[href]", (anchors) => {
      const next = anchors.find((anchor: any) => {
        const label = `${anchor.textContent ?? ""} ${anchor.getAttribute("aria-label") ?? ""} ${anchor.getAttribute("rel") ?? ""}`.toLowerCase();
        return label.includes("next") || label.includes("weiter") || label.includes("след");
      }) as any;
      return next?.href ?? null;
    });
    nextUrl = candidate && !visited.has(candidate) ? candidate : null;
    if (nextUrl) await wait(500);
  }
  return { urls: discovered, pages: pageNumber };
}

async function enqueueDiscoveredUrls(urls: Map<string, string | undefined>) {
  let added = 0;
  for (const [url, category] of urls) {
    const [inserted] = await db.insert(articleUrlsTable).values({
      url,
      category: category ?? null,
      priority: categoryDetails(category).priority,
      scraped: false,
      scrapedAt: null,
      lastError: null,
    }).onConflictDoNothing({ target: articleUrlsTable.url }).returning({ id: articleUrlsTable.id });
    if (inserted) added += 1;
  }
  return added;
}

async function runContentScrape(page: Page, articleCount: number) {
  const pending = await db.select().from(articleUrlsTable)
    .where(eq(articleUrlsTable.scraped, false))
    .orderBy(sql`coalesce(${articleUrlsTable.priority}, 999)`, asc(articleUrlsTable.discoveredAt));
  let scrapedCount = articleCount;
  for (const queued of pending) {
    try {
      const article = await scrapeRenderedArticle(page, queued.url);
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
      await updateProgress({ phase: "content", status: "running", currentPage: scrapedCount, totalPages: pending.length, articlesScraped: scrapedCount, lastRun: new Date() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.update(articleUrlsTable).set({ lastError: message }).where(eq(articleUrlsTable.id, queued.id));
      if (message.includes("GTAC returned 404")) {
        await db.update(articleUrlsTable).set({ scraped: true, scrapedAt: new Date(), lastError: "Skipped 404 public article" }).where(eq(articleUrlsTable.id, queued.id));
        continue;
      }
      throw new Error(message);
    }
    if (queued !== pending[pending.length - 1]) await wait(2000);
  }
  return scrapedCount;
}

export async function runScraper(): Promise<void> {
  if (activeRun) return;
  activeRun = true;
  let browser: Browser | undefined;
  try {
    const [progress] = await db.select().from(scraperProgressTable).limit(1);
    const { browser: runningBrowser, page } = await launchBrowser();
    browser = runningBrowser;
    const seeded = await db.select({ total: sql<number>`count(*)` }).from(articleUrlsTable).where(eq(articleUrlsTable.scraped, false));
    const hasSeededUrls = Number(seeded?.[0]?.total ?? 0) > 0;
    if (!hasSeededUrls) {
      await updateProgress({ phase: "discover", status: "running", currentPage: 0, totalPages: 0, articlesScraped: 0, lastRun: new Date(), lastError: null });
      const discovery = await discoverRenderedUrls(page);
      await enqueueDiscoveredUrls(discovery.urls);
    }
    const [queue] = await db.select({ total: sql<number>`count(*)` }).from(articleUrlsTable).where(eq(articleUrlsTable.scraped, false));
    const totalPending = Number(queue?.total ?? 0);
    if (!totalPending) throw new Error("GTAC discovery completed but no article URLs were found");
    let countScraped = progress?.articlesScraped ?? 0;
    await updateProgress({ phase: "content", status: "running", currentPage: 0, totalPages: totalPending, articlesScraped: countScraped, lastRun: new Date(), lastError: null });
    countScraped = await runContentScrape(page, countScraped);
    await updateProgress({ phase: "content", status: "complete", currentPage: totalPending, totalPages: totalPending, articlesScraped: countScraped, lastRun: new Date(), lastError: null });
  } catch (error) {
    logger.error({ error }, "Teamcenter scraper failed");
    const [progress] = await db.select().from(scraperProgressTable).limit(1);
    const lastError = error instanceof Error ? error.message : String(error);
    await updateProgress({ status: "error", phase: "content", currentPage: progress?.currentPage ?? 0, totalPages: progress?.totalPages ?? 0, articlesScraped: progress?.articlesScraped ?? 0, lastRun: new Date(), lastError });
  } finally {
    await browser?.close().catch((error) => logger.warn({ error }, "Failed to close Teamcenter scraper browser"));
    activeRun = false;
  }
}

export async function getScraperStatus() {
  const [progress] = await db.select().from(scraperProgressTable).limit(1);
  return progress ?? { status: "idle", phase: "content", currentPage: 0, totalPages: 0, articlesScraped: 0, lastRun: null, lastError: null };
}