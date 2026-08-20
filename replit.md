# Teamcenter Knowledge Base

A bilingual Teamcenter support workspace that grounds consultant answers in an indexed Siemens GTAC knowledge base.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
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
- `artifacts/api-server/src/routes/knowledge.ts` — stats, articles, chat, and manual import endpoints
- `artifacts/api-server/src/lib/knowledge.ts` — lightweight grounded retrieval
- `lib/db/src/schema/knowledge.ts` — articles, chat session, community, and feedback schema
- `lib/api-spec/openapi.yaml` — source of truth for API contracts

## Architecture decisions

- The frontend uses generated React Query hooks from the OpenAPI contract; it does not hand-roll API response types.
- Claude Sonnet 4.6 generates grounded text answers, Gemini Flash handles screenshot analysis, and retrieval currently uses a database-backed lexical ranker so the first-run product works without unsupported embedding calls.
- The corpus is managed through manual article entry, document import, and protected batch import.

## Product

- Ask Teamcenter questions in English or Russian and receive a same-language answer grounded in indexed articles.
- Inspect source citations, categories, and confidence scores for each answer.
- Monitor corpus totals and manage articles from the admin route.
- Search indexed articles and import manually curated knowledge.

## User preferences

No project-specific preferences recorded yet.

## Gotchas

- Keep the server's direct `@google/genai` dependency in sync with the shared Gemini integration package; the API bundle externalizes that runtime package.
- After changing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen` before touching generated hooks or route schemas.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
