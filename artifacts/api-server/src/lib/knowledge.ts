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
  };
}