import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { count, desc } from "drizzle-orm";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ai } from "@workspace/integrations-gemini-ai";
import { db, articlesTable, scraperProgressTable } from "@workspace/db";
import { BulkImportArticlesBody, BulkImportArticlesResponse, ChatBody, ChatResponse, CreateArticleBody, CreateArticleResponse, DebugScrapeResponse, GetStatsResponse, ImportPdfArticleBody, ImportPdfArticleResponse, ListArticlesQueryParams, ListArticlesResponse, SeedScrapeUrlsBody, SeedScrapeUrlsResponse, StartScrapeResponse, GetScrapeStatusResponse } from "@workspace/api-zod";
import { getArticleList, searchArticles, ensureStarterArticles, toArticleResponse } from "../lib/knowledge";
import { debugScrape, getScraperStatus, runScraper, seedArticleUrls } from "../lib/scraper";

const router: IRouter = Router();

router.get("/stats", async (_req, res): Promise<void> => {
  await ensureStarterArticles();
  const [articleCount] = await db.select({ total: count() }).from(articlesTable);
  const [progress] = await db.select().from(scraperProgressTable).limit(1);
  const categoryRows = await db.select({ name: articlesTable.category, total: count() }).from(articlesTable).groupBy(articlesTable.category).orderBy(desc(count()));
  res.json(GetStatsResponse.parse({
    totalArticles: Number(articleCount?.total ?? 0),
    indexedArticles: Number(articleCount?.total ?? 0),
    lastScraped: progress?.lastRun ?? null,
    categories: categoryRows.map((row) => ({ name: row.name ?? "Uncategorized", count: Number(row.total) })),
  }));
});

router.get("/articles", async (req, res): Promise<void> => {
  const parsed = ListArticlesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = await getArticleList(parsed.data.search, parsed.data.limit);
  res.json(ListArticlesResponse.parse(rows.map(toArticleResponse)));
});

router.post("/articles", async (req, res): Promise<void> => {
  const parsed = CreateArticleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [article] = await db.insert(articlesTable).values({
    title: parsed.data.title.trim(),
    content: parsed.data.content.trim(),
    category: parsed.data.category?.trim() || null,
    tags: parsed.data.tags.map((tag) => tag.trim()).filter(Boolean),
    url: parsed.data.url?.trim() || null,
  }).onConflictDoNothing({ target: articlesTable.url }).returning();
  if (!article) {
    res.status(409).json({ error: "An article with this URL already exists." });
    return;
  }
  res.status(201).json(CreateArticleResponse.parse(toArticleResponse(article)));
});

router.post("/articles/pdf", async (req, res): Promise<void> => {
  const parsed = ImportPdfArticleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!parsed.data.filename.toLowerCase().endsWith(".pdf")) {
    res.status(400).json({ error: "Only PDF files are supported." });
    return;
  }
  let content = "";
  try {
    GlobalWorkerOptions.workerSrc = new URL("../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).href;
    const document = await getDocument({ data: new Uint8Array(Buffer.from(parsed.data.data, "base64")), useSystemFonts: true }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const text = await page.getTextContent();
      pages.push(text.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      page.cleanup();
    }
    await document.cleanup();
    content = pages.join("\n").replace(/\s+/g, " ").trim();
  } catch (error) {
    res.status(400).json({ error: `Could not extract PDF text: ${error instanceof Error ? error.message : String(error)}` });
    return;
  }
  if (content.length < 20) {
    res.status(400).json({ error: "The PDF did not contain enough selectable text. Scanned PDFs are not supported." });
    return;
  }
  const [article] = await db.insert(articlesTable).values({
    title: parsed.data.title?.trim() || parsed.data.filename.replace(/\.pdf$/i, ""),
    content: content.slice(0, 1000000),
    category: parsed.data.category?.trim() || "Imported PDF",
    tags: parsed.data.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [],
    url: parsed.data.url?.trim() || null,
  }).onConflictDoNothing({ target: articlesTable.url }).returning();
  if (!article) {
    res.status(409).json({ error: "An article with this URL already exists." });
    return;
  }
  res.status(201).json(ImportPdfArticleResponse.parse(toArticleResponse(article)));
});

router.post("/articles/bulk", async (req, res): Promise<void> => {
  const configuredSecret = process.env.SCRAPER_SECRET;
  if (!configuredSecret) {
    res.status(503).json({ error: "SCRAPER_SECRET is not configured." });
    return;
  }
  const authorization = req.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  const expected = Buffer.from(configuredSecret);
  const received = Buffer.from(token);
  const validToken = expected.length === received.length && timingSafeEqual(expected, received);
  if (!validToken) {
    res.status(401).json({ error: "A valid scraper bearer token is required." });
    return;
  }

  const parsed = BulkImportArticlesBody.safeParse(req.body.articles);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const imported: Array<typeof articlesTable.$inferSelect> = [];
  await db.transaction(async (tx) => {
    for (const [index, item] of parsed.data.entries()) {
      const [article] = await tx.insert(articlesTable).values({
        title: item.title.trim(),
        content: item.content.trim(),
        category: item.category?.trim() || null,
        tags: item.tags.map((tag) => tag.trim()).filter(Boolean),
        url: item.url?.trim() || null,
      }).onConflictDoNothing({ target: articlesTable.url }).returning();
      if (article) imported.push(article);
    }
  });
  res.status(201).json(BulkImportArticlesResponse.parse({
    imported: imported.length,
    skipped: parsed.data.length - imported.length,
  }));
});

router.post("/chat", async (req, res): Promise<void> => {
  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let imageAnalysis = "";
  if (parsed.data.imageData) {
    try {
      const visionResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          role: "user",
          parts: [
            {
              text: "You are a Teamcenter expert. The user uploaded a screenshot of their Teamcenter interface or error. Analyze the image, identify the issue or question, then search the knowledge base for relevant answers. Describe what you see and provide solution. Return a concise technical analysis with visible labels, error messages, and likely Teamcenter modules.",
            },
            {
              inlineData: {
                data: parsed.data.imageData,
                mimeType: parsed.data.imageMimeType ?? "image/png",
              },
            },
          ],
        }],
        config: { maxOutputTokens: 8192 },
      });
      imageAnalysis = visionResponse.text ?? "";
    } catch {
      imageAnalysis = "The screenshot could not be analyzed. Use the user's written question and the indexed sources.";
    }
  }
  const retrievalQuery = [parsed.data.message, imageAnalysis].filter(Boolean).join("\n");
  const matches = await searchArticles(retrievalQuery);
  const sessionId = parsed.data.sessionId ?? crypto.randomUUID();
  const context = matches.map(({ article }, index) => `[Source ${index + 1}] ${article.title}\n${article.content}`).join("\n\n");
  const prompt = `You are an expert Teamcenter consultant for SAMT LLC (Baku, Azerbaijan).
Answer questions in the same language the user writes in:
- If user writes in Azerbaijani → answer in Azerbaijani
- If user writes in Russian → answer in Russian
- If user writes in English → answer in English
Base answers on the indexed knowledge base articles.
If answer not found in corpus — say so honestly.
Help with Teamcenter installation, configuration, troubleshooting, integrations and daily usage. Cite sources naturally as [Source 1], [Source 2].${parsed.data.imageData ? " The user uploaded a screenshot; incorporate the image analysis into your answer and clearly describe what the screenshot shows before proposing a solution." : ""}\n\nImage analysis:\n${imageAnalysis || "No image uploaded."}\n\nKnowledge base:\n${context}\n\nUser question:\n${parsed.data.message}`;
  let answer = "";
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 8192 },
    });
    answer = response.text ?? "";
  } catch {
    answer = matches.length
      ? `Based on the indexed Teamcenter references: ${matches[0].article.content}`
      : "I could not find a relevant Teamcenter reference in the indexed knowledge base.";
  }
  res.json(ChatResponse.parse({
    answer,
    sessionId,
    sources: matches.map(({ article, score }) => ({ id: article.id, title: article.title, url: article.url, category: article.category, score })),
  }));
});

router.post("/scrape/start", async (_req, res): Promise<void> => {
  const status = await getScraperStatus();
  if (status.status !== "running") void runScraper();
  res.status(202).json(StartScrapeResponse.parse(status.status === "running" ? status : { ...status, status: "running", lastRun: new Date() }));
});

router.post("/scrape/seed", async (req, res): Promise<void> => {
  const parsed = SeedScrapeUrlsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.status(201).json(SeedScrapeUrlsResponse.parse(await seedArticleUrls(parsed.data.urls)));
});

router.get("/scrape/status", async (_req, res): Promise<void> => {
  res.json(GetScrapeStatusResponse.parse(await getScraperStatus()));
});

router.get("/scrape/debug", async (_req, res): Promise<void> => {
  res.json(DebugScrapeResponse.parse(await debugScrape()));
});

export default router;