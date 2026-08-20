import { and, desc, eq } from "drizzle-orm";
import { db, articlesTable } from "@workspace/db";

const starterArticles = [
  {
    title: "Teamcenter Rich Client cannot connect to the pool manager",
    category: "Troubleshooting",
    tags: ["rich client", "pool manager", "connection"],
    url: "https://support.sw.siemens.com/en-US/product/272221135/knowledge-base/starter-pool-manager",
    content:
      "When Rich Client cannot connect to the pool manager, verify the pool manager service is running, confirm the configured port is reachable from the client host, and check that the FMS bootstrap URL points to the correct Teamcenter environment. Review the pool manager and FMS logs together because a stale bootstrap configuration can look like a network failure.",
  },
  {
    title: "FMS configuration and volume access basics",
    category: "Configuration",
    tags: ["FMS", "volumes", "configuration"],
    url: "https://support.sw.siemens.com/en-US/product/272221135/knowledge-base/starter-fms",
    content:
      "Teamcenter File Management System configuration is driven by the FSC and volume definitions. Confirm each volume is reachable by the FSC process, permissions allow the service account to read and write, and the client receives the expected FMS bootstrap configuration. After changes, restart the affected FSC processes and validate with a small dataset file upload.",
  },
  {
    title: "BMIDE deployment checklist for Teamcenter environments",
    category: "Administration",
    tags: ["BMIDE", "deployment", "data model"],
    url: "https://support.sw.siemens.com/en-US/product/272221135/knowledge-base/starter-bmide",
    content:
      "Before deploying a BMIDE template, confirm the target environment is backed up, the template version matches the Teamcenter server release, and no users are performing changes during deployment. Validate custom properties and LOVs in a test environment first. Review deployment logs for partial failures before restarting services.",
  },
];

export async function ensureStarterArticles(): Promise<void> {
  const existing = await db.select({ id: articlesTable.id }).from(articlesTable).limit(1);
  if (existing.length > 0) return;
  for (const article of starterArticles) {
    await db.insert(articlesTable).values(article).onConflictDoNothing({ target: articlesTable.url });
  }
}

export async function searchArticles(message: string, limit = 5) {
  await ensureStarterArticles();
  const rows = await db.select().from(articlesTable).orderBy(desc(articlesTable.scrapedAt)).limit(250);
  const terms = message.toLowerCase().split(/[^a-zа-яё0-9]+/i).filter((term) => term.length > 2);
  return rows
    .map((article) => {
      const haystack = `${article.title} ${article.content} ${article.category ?? ""} ${(article.tags ?? []).join(" ")}`.toLowerCase();
      const hits = terms.reduce((count, term) => count + (haystack.includes(term) ? 1 : 0), 0);
      return { article, score: terms.length ? Math.min(0.99, hits / terms.length + (haystack.includes(message.toLowerCase()) ? 0.35 : 0.1)) : 0.1 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function getArticleList(search: string | undefined, limit: number) {
  await ensureStarterArticles();
  const rows = await db.select().from(articlesTable).orderBy(desc(articlesTable.scrapedAt)).limit(250);
  if (!search?.trim()) return rows.slice(0, limit);
  const query = search.toLowerCase();
  return rows.filter((article) => `${article.title} ${article.content} ${article.category ?? ""} ${(article.tags ?? []).join(" ")}`.toLowerCase().includes(query)).slice(0, limit);
}

export function toArticleResponse(article: typeof articlesTable.$inferSelect) {
  return {
    id: article.id,
    title: article.title,
    content: article.content,
    category: article.category,
    tags: article.tags ?? [],
    url: article.url,
    scrapedAt: article.scrapedAt,
    sourceUpdatedAt: article.sourceUpdatedAt,
  };
}

type ArticleMatch = { article: typeof articlesTable.$inferSelect };

const VIDEO_FILE_PATTERN = /\.(?:mp4|webm|mov|m4v|m3u8)(?:[?#].*)?$/i;
const VIDEO_HOST_PATTERN = /(^|\.)((youtube\.com)|(youtu\.be)|(vimeo\.com)|(loom\.com)|(wistia\.com)|(vidyard\.com))$/i;

function normalizeVideoUrl(value: string): string | null {
  const normalized = value.replace(/&amp;/g, "&").replace(/[.,!?;:'"]+$/g, "");
  try {
    const url = new URL(normalized);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (!VIDEO_HOST_PATTERN.test(url.hostname) && !VIDEO_FILE_PATTERN.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function cleanVideoTitle(value: string | undefined, fallback: string): string {
  const title = value?.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return title || fallback;
}

export function extractRelatedVideos(matches: ArticleMatch[], limit = 2) {
  const videos: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();
  const addVideo = (rawUrl: string, rawTitle: string | undefined, articleTitle: string) => {
    const url = normalizeVideoUrl(rawUrl);
    if (!url || seen.has(url) || videos.length >= limit) return;
    seen.add(url);
    let fallback = "Teamcenter video";
    try {
      fallback = `${new URL(url).hostname.replace(/^www\./, "")} video`;
    } catch {
      // normalizeVideoUrl already validates the URL.
    }
    videos.push({ title: cleanVideoTitle(rawTitle, cleanVideoTitle(articleTitle, fallback)), url });
  };

  for (const { article } of matches) {
    const content = article.content ?? "";
    const markdownLinks = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;
    const htmlLinks = /<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const iframeLinks = /<iframe\b[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
    const rawUrls = /https?:\/\/[^\s<>"')]+/gi;

    for (const match of content.matchAll(markdownLinks)) addVideo(match[2], match[1], article.title);
    for (const match of content.matchAll(htmlLinks)) addVideo(match[1], match[2], article.title);
    for (const match of content.matchAll(iframeLinks)) addVideo(match[1], undefined, article.title);
    for (const match of content.matchAll(rawUrls)) addVideo(match[0], undefined, article.title);
    if (videos.length >= limit) break;
  }

  return videos;
}