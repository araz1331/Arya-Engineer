# Teamcenter Knowledge Base

A bilingual Teamcenter support workspace that grounds consultant answers in an indexed Siemens GTAC knowledge base.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `SIEMENS_CURL` — browser cURL session used by the GTAC scraper
- Claude Sonnet 4.6 generates text answers through `ANTHROPIC_API_KEY`; Gemini Flash remains reserved for screenshot/vision analysis through the managed Gemini integration

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/teamcenter-kb` — React/Vite chat workspace and admin corpus controls
- `artifacts/api-server/src/routes/knowledge.ts` — stats, articles, chat, and scraper endpoints
- `artifacts/api-server/src/lib/knowledge.ts` — corpus seeding and lightweight grounded retrieval
- `artifacts/api-server/src/lib/scraper.ts` — resumable GTAC scraper and cURL header parsing
- `lib/db/src/schema/knowledge.ts` — articles, scraper progress, and chat session schema
- `lib/api-spec/openapi.yaml` — source of truth for API contracts

## Architecture decisions

- The frontend uses generated React Query hooks from the OpenAPI contract; it does not hand-roll API response types.
- Claude Sonnet 4.6 generates grounded text answers, Gemini Flash handles screenshot analysis, and retrieval currently uses a database-backed lexical ranker so the first-run product works without unsupported embedding calls.
- Scraper progress is persisted per page and the scraper is guarded against concurrent runs.
- Starter articles keep the workspace useful before the first authenticated GTAC scrape, while real scraped URLs remain unique.

## Product

- Ask Teamcenter questions in English or Russian and receive a same-language answer grounded in indexed articles.
- Inspect source citations, categories, and confidence scores for each answer.
- Monitor corpus totals and scraper progress from the admin route.
- Search indexed articles and start/resume the GTAC scraper with the saved Siemens browser session.

## User preferences

No project-specific preferences recorded yet.

## Gotchas

- Keep the server's direct `@google/genai` dependency in sync with the shared Gemini integration package; the API bundle externalizes that runtime package.
- After changing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen` before touching generated hooks or route schemas.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
