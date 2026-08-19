import { Router, type IRouter } from "express";
import { and, count, desc, eq } from "drizzle-orm";
import { ai } from "@workspace/integrations-gemini-ai";
import { db, articlesTable, scraperProgressTable } from "@workspace/db";
import { ChatBody, ChatResponse, GetStatsResponse, ListArticlesQueryParams, ListArticlesResponse, StartScrapeResponse, GetScrapeStatusResponse } from "@workspace/api-zod";
import { getArticleList, searchArticles, ensureStarterArticles, toArticleResponse } from "../lib/knowledge";
import { getScraperStatus, runScraper } from "../lib/scraper";

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

router.post("/chat", async (req, res): Promise<void> => {
  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const matches = await searchArticles(parsed.data.message);
  const sessionId = parsed.data.sessionId ?? crypto.randomUUID();
  const context = matches.map(({ article }, index) => `[Source ${index + 1}] ${article.title}\n${article.content}`).join("\n\n");
  const prompt = `You are an expert Teamcenter consultant assistant for SAMT LLC. Help with Teamcenter installation, configuration, troubleshooting and daily usage. Answer based on the provided knowledge base articles. If the sources do not contain the answer, say so honestly. Respond in the same language as the user. Cite sources naturally as [Source 1], [Source 2].\n\nKnowledge base:\n${context}\n\nUser question:\n${parsed.data.message}`;
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

router.get("/scrape/status", async (_req, res): Promise<void> => {
  res.json(GetScrapeStatusResponse.parse(await getScraperStatus()));
});

export default router;