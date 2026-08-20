#!/usr/bin/env node

/**
 * Scrape Siemens Community threads into the Teamcenter Knowledge Base.
 *
 * Usage:
 *   node community-scraper.js
 *   COMMUNITY_URLS_FILE=/path/community_urls.txt node community-scraper.js
 *   MANUAL_LOGIN=true node community-scraper.js
 *
 * The default URL file is kept compatible with the original local scraper:
 * /Users/arazmamet/gtac-scraper/community_urls.txt
 */

import fs from "node:fs/promises";
import process from "node:process";
import readline from "node:readline/promises";
import puppeteer from "puppeteer";

const DEFAULT_URL_FILE = "/Users/arazmamet/gtac-scraper/community_urls.txt";
const DEFAULT_API_URL = "http://127.0.0.1:5000/api/articles/bulk";
const COMMUNITY_HOST = "community.sw.siemens.com";
const ARTICLE_DELAY_MS = 2_000;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function parseCurl(curl) {
  const headers = {};
  if (!curl) return headers;

  for (const match of curl.matchAll(/(?:-H|--header)\s+["']([^"']+)["']/gi)) {
    const [name, ...value] = match[1].split(":");
    if (name && value.length) headers[name.trim()] = value.join(":").trim();
  }

  const cookie = curl.match(/(?:-b|--cookie)\s+["']([^"']+)["']/i)?.[1];
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function parseCookieHeader(value) {
  return (value ?? "")
    .split(";")
    .map((part) => part.trim())
    .map((part) => {
      const separator = part.indexOf("=");
      return separator > 0
        ? { name: part.slice(0, separator).trim(), value: part.slice(separator + 1).trim() }
        : null;
    })
    .filter((cookie) => cookie?.name && cookie.value);
}

function readUrls(contents) {
  return [...new Set(
    contents
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*/, "").trim())
      .filter(Boolean)
      .filter((url) => {
        try {
          const parsed = new URL(url);
          return parsed.protocol === "https:" && parsed.hostname === COMMUNITY_HOST;
        } catch {
          return false;
        }
      }),
  )];
}

function textFromNodes(nodes) {
  return nodes
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

async function launchBrowser() {
  const manualLogin = /^(1|true|yes)$/i.test(process.env.MANUAL_LOGIN ?? "");
  const browser = await puppeteer.launch({
    headless: manualLogin ? false : true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(45_000);
  page.setDefaultTimeout(20_000);

  const headers = parseCurl(process.env.SIEMENS_CURL);
  const nonCookieHeaders = Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.toLowerCase() !== "cookie"),
  );
  if (Object.keys(nonCookieHeaders).length) await page.setExtraHTTPHeaders(nonCookieHeaders);

  const cookies = parseCookieHeader(headers.Cookie);
  if (cookies.length) {
    await page.setCookie(...cookies.map((cookie) => ({
      ...cookie,
      domain: `.${COMMUNITY_HOST}`,
      path: "/",
      secure: true,
    })));
  }

  if (manualLogin) {
    const loginUrl = process.env.COMMUNITY_LOGIN_URL || `https://${COMMUNITY_HOST}/`;
    await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
    await terminal.question("Complete Siemens Community login in the browser, then press Enter here to continue. ");
    terminal.close();
  }

  return { browser, page };
}

async function scrapeThread(page, url) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  if (response && response.status() >= 400) {
    throw new Error(`Community returned ${response.status()} for ${url}`);
  }
  await page.waitForSelector("body");
  await sleep(750);

  const thread = await page.evaluate(() => {
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
    const firstText = (selectors) => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        const value = clean(element?.textContent);
        if (value) return value;
      }
      return "";
    };

    const title = firstText(["h1", ".question-title"]) || clean(document.title);
    const questionBody = firstText([
      ".question-body",
      ".question-content",
      "[data-question-body]",
      "article .content",
      "main article",
    ]);

    const answerSelectors = [
      ".answer",
      ".reply",
      "[data-answer]",
      "[data-reply]",
      ".answer-body",
      ".reply-body",
      "[class*='answer']",
      "[class*='reply']",
    ];
    const answerElements = [...document.querySelectorAll(answerSelectors.join(","))];
    const seen = new Set();
    const answers = [];
    for (const element of answerElements) {
      const value = clean(element.textContent);
      if (!value || value.length < 2 || seen.has(value)) continue;
      seen.add(value);
      answers.push(value);
    }

    const statusElements = [
      ...document.querySelectorAll(
        ".answered, .is-answered, [data-status='answered'], [aria-label*='Answered' i], .status, .badge, [class*='status'], [class*='badge']",
      ),
    ];
    const hasAnsweredBadge = statusElements.some((element) => {
      const text = clean(element.textContent).toLowerCase();
      const ariaLabel = clean(element.getAttribute("aria-label")).toLowerCase();
      return text === "answered" || text.startsWith("answered ") || ariaLabel.includes("answered");
    });

    return { title, questionBody, answers, hasAnsweredBadge };
  });

  if (!thread.title) throw new Error("Thread did not contain a title");
  if (!thread.questionBody && thread.answers.length === 0) {
    throw new Error("Thread did not contain question or answer text");
  }

  return {
    title: thread.title,
    content: [
      "QUESTION:",
      thread.questionBody || "(Question body not available.)",
      "",
      "ANSWERS:",
      thread.answers.join("\n\n") || "(No answers found.)",
    ].join("\n"),
    category: "Community",
    url,
    answered: thread.hasAnsweredBadge,
  };
}

async function importArticles(articles) {
  const apiUrl = process.env.BULK_IMPORT_URL || DEFAULT_API_URL;
  const secret = process.env.SCRAPER_SECRET;
  if (!secret) throw new Error("SCRAPER_SECRET is required for bulk import.");

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ articles }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Bulk import returned ${response.status}: ${body.slice(0, 500)}`);
  return body ? JSON.parse(body) : {};
}

async function main() {
  const urlFile = process.env.COMMUNITY_URLS_FILE || process.argv[2] || DEFAULT_URL_FILE;
  const urls = readUrls(await fs.readFile(urlFile, "utf8"));
  if (urls.length === 0) throw new Error(`No valid ${COMMUNITY_HOST} URLs found in ${urlFile}`);

  const { browser, page } = await launchBrowser();
  const articles = [];
  const failures = [];
  try {
    // Answered threads are not known until rendered, so they are sorted first
    // after discovery rather than making a second request for each URL.
    for (let index = 0; index < urls.length; index += 1) {
      const url = urls[index];
      process.stdout.write(`[${index + 1}/${urls.length}] ${url}\n`);
      try {
        const article = await scrapeThread(page, url);
        articles.push(article);
        process.stdout.write(`  ${article.answered ? "ANSWERED" : "UNVERIFIED"}: ${article.title}\n`);
      } catch (error) {
        failures.push({ url, error: error instanceof Error ? error.message : String(error) });
        process.stderr.write(`  FAILED: ${failures.at(-1).error}\n`);
      }
      if (index < urls.length - 1) await sleep(ARTICLE_DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  const prioritized = [
    ...articles.filter((article) => article.answered),
    ...articles.filter((article) => !article.answered),
  ].map(({ answered: _answered, ...article }) => article);

  let importResult = null;
  if (prioritized.length) importResult = await importArticles(prioritized);
  console.log(JSON.stringify({
    discovered: urls.length,
    scraped: articles.length,
    answered: articles.filter((article) => article.answered).length,
    failed: failures.length,
    failures,
    import: importResult,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});