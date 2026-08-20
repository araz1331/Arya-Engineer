import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { count, desc, eq, sql } from "drizzle-orm";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ai } from "@workspace/integrations-gemini-ai";
import { db, articlesTable, answerFeedbackTable, communityQuestionsTable, scraperProgressTable } from "@workspace/db";
import { AnswerCommunityQuestionBody, AnswerCommunityQuestionParams, AnswerCommunityQuestionResponse, BulkImportArticlesBody, BulkImportArticlesResponse, ChatBody, ChatResponse, CreateArticleBody, CreateArticleResponse, DebugScrapeResponse, GetArticleCountResponse, GetFeedbackStatsResponse, GetStatsResponse, ImportPdfArticleBody, ImportPdfArticleResponse, ListArticlesQueryParams, ListArticlesResponse, ListCommunityQuestionsQueryParams, ListCommunityQuestionsResponse, LoginBody, LoginResponse, SeedScrapeUrlsBody, SeedScrapeUrlsResponse, StartScrapeResponse, SubmitAnswerFeedbackBody, SubmitAnswerFeedbackResponse, SubmitCommunityQuestionBody, SubmitCommunityQuestionResponse, GetScrapeStatusResponse } from "@workspace/api-zod";
import { getArticleList, searchArticles, ensureStarterArticles, toArticleResponse, extractRelatedVideos } from "../lib/knowledge";
import { debugScrape, getScraperStatus, runScraper, seedArticleUrls, subscribeScraperProgress } from "../lib/scraper";
import { cleanContent } from "../lib/content";

const router: IRouter = Router();

type ClaudeTextResponse = {
  content?: Array<{ type?: string; text?: string }>;
};

async function generateClaudeText(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    throw new Error(`Claude returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  const payload = await response.json() as ClaudeTextResponse;
  return payload.content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim() ?? "";
}

async function translateQueryForSearch(query: string): Promise<string> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return trimmedQuery;
  try {
    return await generateClaudeText(
      `Translate the following Teamcenter support question to English for technical search. Preserve every error code, API name, identifier, and quoted phrase exactly. Return only the translated search query.\n\n${trimmedQuery}`,
    ) || trimmedQuery;
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
    content: cleanContent(parsed.data.content),
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

router.post("/admin/cleanup", async (_req, res): Promise<void> => {
  const articles = await db.select({
    id: articlesTable.id,
    title: articlesTable.title,
    content: articlesTable.content,
  }).from(articlesTable);
  const removable = articles.filter((article) => {
    const title = article.title.trim();
    const content = article.content.trim();
    return content.length < 300
      || title.length === 0
      || /^(Products & Services|Sign in|Accept cookies|Cookie|Navigation)\b/i.test(content)
      || /(404|Error|Page Not Found)/i.test(title);
  });

  if (removable.length) {
    await db.transaction(async (tx) => {
      for (const article of removable) {
        await tx.delete(articlesTable).where(eq(articlesTable.id, article.id));
      }
    });
  }
  const [remaining] = await db.select({ total: count() }).from(articlesTable);
  res.json({
    removed: removable.length,
    remaining: Number(remaining?.total ?? 0),
  });
});

router.post("/admin/articles/clean-all", async (_req, res): Promise<void> => {
  const articles = await db.select({ id: articlesTable.id, content: articlesTable.content }).from(articlesTable);
  let cleaned = 0;
  for (const article of articles) {
    const content = cleanContent(article.content);
    if (content === article.content) continue;
    await db.update(articlesTable).set({ content }).where(eq(articlesTable.id, article.id));
    cleaned += 1;
  }
  res.json({ scanned: articles.length, cleaned });
});

router.get("/admin/articles/sample", async (req, res): Promise<void> => {
  const rawCount = req.query.count;
  const countValue = rawCount === undefined ? 20 : Number(rawCount);
  if (!Number.isInteger(countValue) || countValue < 1 || countValue > 100) {
    res.status(400).json({ error: "count must be an integer between 1 and 100." });
    return;
  }

  await ensureStarterArticles();
  const articles = await db
    .select({
      id: articlesTable.id,
      title: articlesTable.title,
      content: articlesTable.content,
      url: articlesTable.url,
    })
    .from(articlesTable)
    .orderBy(sql`random()`)
    .limit(countValue);

  res.json(articles.map((article) => ({
    id: article.id,
    title: article.title,
    content: article.content.slice(0, 200),
    url: article.url,
  })));
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
    content: cleanContent(content).slice(0, 1000000),
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
        content: cleanContent(item.content),
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
  // Keep the original wording in the retrieval input so rare identifiers and
  // quoted phrases survive translation before exact-term extraction.
  const retrievalQuery = [parsed.data.message, englishSearchQuery, imageAnalysis].filter(Boolean).join("\n");
  const retrievedMatches = await searchArticles(retrievalQuery);
  const bestMatchScore = retrievedMatches[0]?.score ?? 0;
  const communityHandoff = bestMatchScore < 0.7;
  const sessionId = parsed.data.sessionId ?? crypto.randomUUID();
  const responseId = crypto.randomUUID();
  if (communityHandoff) {
    res.json(ChatResponse.parse({
      answer: "I couldn't find a specific solution for this error in my knowledge base. Please send this to our community for expert help.",
      sessionId,
      sources: [],
      videos: [],
      communityHandoff: true,
      responseId,
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
    answer = await generateClaudeText(prompt);
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
    responseId,
  }));
});

router.post("/community/questions", async (req, res): Promise<void> => {
  const parsed = SubmitCommunityQuestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [question] = await db.insert(communityQuestionsTable).values({
    question: parsed.data.question.trim(),
    screenshotRef: parsed.data.screenshotRef?.trim() || null,
    language: parsed.data.language.trim().toLowerCase(),
    status: "pending",
  }).returning({ id: communityQuestionsTable.id });
  res.status(201).json(SubmitCommunityQuestionResponse.parse({
    id: question.id,
    status: "pending",
    confirmation: "Your question has been sent to the community. A Teamcenter expert will review it.",
  }));
});

router.post("/feedback", async (req, res): Promise<void> => {
  const parsed = SubmitAnswerFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [feedback] = await db.insert(answerFeedbackTable).values({
    responseId: parsed.data.responseId,
    sessionId: parsed.data.sessionId ?? null,
    rating: parsed.data.rating,
    comment: parsed.data.comment?.trim() || null,
  }).returning({ id: answerFeedbackTable.id });
  res.status(201).json(SubmitAnswerFeedbackResponse.parse({ id: feedback.id, recorded: true }));
});

function toCommunityQuestionResponse(question: typeof communityQuestionsTable.$inferSelect) {
  return {
    id: question.id,
    question: question.question,
    screenshotRef: question.screenshotRef,
    language: question.language,
    status: question.status as "pending" | "answered",
    answer: question.answer,
    answeredAt: question.answeredAt,
    createdAt: question.createdAt,
  };
}

router.get("/admin/community/questions", async (req, res): Promise<void> => {
  const parsed = ListCommunityQuestionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const query = db.select().from(communityQuestionsTable).orderBy(desc(communityQuestionsTable.createdAt));
  const questions = parsed.data.status === "all"
    ? await query
    : await query.where(eq(communityQuestionsTable.status, parsed.data.status));
  res.json(ListCommunityQuestionsResponse.parse(questions.map(toCommunityQuestionResponse)));
});

router.post("/admin/community/questions/:id/answer", async (req, res): Promise<void> => {
  const params = AnswerCommunityQuestionParams.safeParse(req.params);
  const parsed = AnswerCommunityQuestionBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [question] = await db.select().from(communityQuestionsTable).where(eq(communityQuestionsTable.id, params.data.id)).limit(1);
  if (!question) {
    res.status(404).json({ error: "Community question not found." });
    return;
  }
  const answeredAt = new Date();
  const answer = parsed.data.answer.trim();
  const [updated] = await db.transaction(async (tx) => {
    await tx.insert(articlesTable).values({
      title: `Community answer: ${question.question.slice(0, 120)}`,
      content: cleanContent(answer),
      category: "Community Answers",
      tags: ["community", "expert answer", question.language],
      url: null,
    });
    return tx.update(communityQuestionsTable)
      .set({ answer, status: "answered", answeredAt, updatedAt: answeredAt })
      .where(eq(communityQuestionsTable.id, question.id))
      .returning();
  });
  res.json(AnswerCommunityQuestionResponse.parse(toCommunityQuestionResponse(updated)));
});

router.get("/admin/feedback/stats", async (_req, res): Promise<void> => {
  const [total] = await db.select({ total: count() }).from(answerFeedbackTable);
  const [positive] = await db.select({ total: count() }).from(answerFeedbackTable).where(eq(answerFeedbackTable.rating, "positive"));
  const recentNegative = await db.select({
    id: answerFeedbackTable.id,
    responseId: answerFeedbackTable.responseId,
    comment: answerFeedbackTable.comment,
    createdAt: answerFeedbackTable.createdAt,
  }).from(answerFeedbackTable)
    .where(eq(answerFeedbackTable.rating, "negative"))
    .orderBy(desc(answerFeedbackTable.createdAt))
    .limit(10);
  const totalResponses = Number(total?.total ?? 0);
  res.json(GetFeedbackStatsResponse.parse({
    totalResponses,
    positivePercentage: totalResponses ? Math.round((Number(positive?.total ?? 0) / totalResponses) * 1000) / 10 : 0,
    recentNegative: recentNegative.map((item) => ({ ...item, comment: item.comment ?? "" })),
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

router.get("/scrape/events", async (_req, res): Promise<void> => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const send = (status: Awaited<ReturnType<typeof getScraperStatus>>) => {
    res.write(`event: progress\ndata: ${JSON.stringify(status)}\n\n`);
  };
  send(await getScraperStatus());
  const unsubscribe = subscribeScraperProgress(send);
  const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 15_000);
  _req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

router.get("/scrape/debug", async (_req, res): Promise<void> => {
  res.json(DebugScrapeResponse.parse(await debugScrape()));
});

export default router;