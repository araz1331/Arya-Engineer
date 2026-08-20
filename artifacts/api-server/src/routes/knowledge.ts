import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { count, desc } from "drizzle-orm";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ai } from "@workspace/integrations-gemini-ai";
import { db, articlesTable, scraperProgressTable } from "@workspace/db";
import { BulkImportArticlesBody, BulkImportArticlesResponse, ChatBody, ChatResponse, CreateArticleBody, CreateArticleResponse, DebugScrapeResponse, GetArticleCountResponse, GetStatsResponse, ImportPdfArticleBody, ImportPdfArticleResponse, ListArticlesQueryParams, ListArticlesResponse, LoginBody, LoginResponse, SeedScrapeUrlsBody, SeedScrapeUrlsResponse, StartScrapeResponse, GetScrapeStatusResponse } from "@workspace/api-zod";
import { getArticleList, searchArticles, ensureStarterArticles, toArticleResponse, extractRelatedVideos } from "../lib/knowledge";
import { debugScrape, getScraperStatus, runScraper, seedArticleUrls } from "../lib/scraper";

const router: IRouter = Router();

async function translateQueryForSearch(query: string): Promise<string> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return trimmedQuery;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{ text: `Translate to English for technical search: ${trimmedQuery}` }],
      }],
      config: { maxOutputTokens: 512 },
    });
    return response.text?.trim() || trimmedQuery;
  } catch {
    return trimmedQuery;
  }
}

function replaceNumberedSourcesWithTitles(
  answer: string,
  matches: Array<{ article: typeof articlesTable.$inferSelect }>,
): string {
  return answer.replace(/\[Source\s+(\d+)\]/gi, (_placeholder, sourceNumber: string) => {
    const source = matches[Number(sourceNumber) - 1];
    return source ? `(${source.article.title})` : "";
  });
}

function passwordsMatch(candidate: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const expected = parsed.data.area === "admin" ? process.env.ADMIN_PASSWORD : process.env.APP_PASSWORD;
  if (!expected) {
    res.status(503).json({ error: "Password access is not configured." });
    return;
  }
  if (!passwordsMatch(parsed.data.password, expected)) {
    res.status(401).json({ error: "Wrong password." });
    return;
  }
  res.json(LoginResponse.parse({
    authenticated: true,
    area: parsed.data.area,
  }));
});

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

router.get("/articles/count", async (_req, res): Promise<void> => {
  const [articleCount] = await db.select({ total: count() }).from(articlesTable);
  res.json(GetArticleCountResponse.parse({ count: Number(articleCount?.total ?? 0) }));
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

  const parsed = BulkImportArticlesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const articles = Array.isArray(parsed.data) ? parsed.data : parsed.data.articles;
  const imported: Array<typeof articlesTable.$inferSelect> = [];
  await db.transaction(async (tx) => {
    for (const item of articles) {
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
    skipped: articles.length - imported.length,
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
  const englishSearchQuery = await translateQueryForSearch(parsed.data.message);
  const retrievalQuery = [englishSearchQuery, imageAnalysis].filter(Boolean).join("\n");
  const retrievedMatches = await searchArticles(retrievalQuery);
  const bestMatchScore = retrievedMatches[0]?.score ?? 0;
  const communityHandoff = bestMatchScore < 0.7;
  const sessionId = parsed.data.sessionId ?? crypto.randomUUID();
  if (communityHandoff) {
    res.json(ChatResponse.parse({
      answer: "I couldn't find a specific solution for this error in my knowledge base. Please send this to our community for expert help.",
      sessionId,
      sources: [],
      videos: [],
      communityHandoff: true,
    }));
    return;
  }
  const matches = retrievedMatches;
  const context = matches.map(({ article }) => `Article title: ${article.title}\n${article.content}`).join("\n\n");
  const sourceGuidance = matches.length > 0
    ? `Sources were found (${matches.length} article${matches.length === 1 ? "" : "s"}). You MUST use them to construct a helpful best-effort answer. Treat the closest relevant articles as useful even when their titles or wording are not an exact match: for example, an article titled "Configuring Teamcenter Project" is relevant to a question about configuring a workflow. Synthesize practical steps from the provided content and clearly distinguish direct guidance from a reasonable inference. Never say "I don't have information", "not found", or that the corpus has no answer when one or more articles are provided.`
    : "No sources were found. Only in this case, honestly say that the indexed knowledge base does not contain a relevant reference and ask the user for a little more context.";
  const prompt = `You are an expert Teamcenter consultant.
Answer questions in the same language the user writes in:
- If user writes in Azerbaijani → answer in Azerbaijani
- If user writes in Russian → answer in Russian
- If user writes in English → answer in English
Base answers on the indexed knowledge base articles.
${sourceGuidance}
Help with Teamcenter installation, configuration, troubleshooting, integrations and daily usage. Do not use numbered source markers such as [Source 1]. If you mention a source, use its exact article title instead.${parsed.data.imageData ? " The user uploaded a screenshot; incorporate the image analysis into your answer and clearly describe what the screenshot shows before proposing a solution." : ""}\n\nImage analysis:\n${imageAnalysis || "No image uploaded."}\n\nKnowledge base:\n${context}\n\nUser question:\n${parsed.data.message}`;
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
  answer = replaceNumberedSourcesWithTitles(answer, matches);
  res.json(ChatResponse.parse({
    answer,
    sessionId,
    sources: matches.map(({ article, score }) => ({ id: article.id, title: article.title, url: article.url, category: article.category, score })),
    videos: extractRelatedVideos(matches),
    communityHandoff: false,
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