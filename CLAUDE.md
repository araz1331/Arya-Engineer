# CLAUDE.md — Arya Engineer (Teamcenter Knowledge Base)

## Project overview

Arya Engineer is an AI support assistant for Siemens **Teamcenter** (PLM) users and consultants. Users ask
questions (optionally with a screenshot); the API retrieves matching articles from an indexed Siemens GTAC
knowledge base stored in Postgres and has Claude write a grounded answer with source titles, related videos,
and a confidence score. When nothing relevant is found, the question is handed off to a "community" queue that
admins answer from the `/admin` page (answers are added back to the corpus). Admins also import articles
(manual, PDF, bulk JSON) and view usage analytics and answer feedback.

- Production URL: **https://tc.arya.az** (from `artifacts/teamcenter-kb/public/llms.txt`, `sitemap.xml`, `index.html`)
- Hosted on Replit (Replit Agent-generated pnpm workspace). `replit.md` has additional notes.

## Tech stack

- **Monorepo**: pnpm workspaces, Node.js 24, TypeScript ~5.9 (`.replit` modules: nodejs-24, python-base-3.13, postgresql-16)
- **Frontend** (`artifacts/teamcenter-kb`): React 19.1, Vite 7, Tailwind CSS 4, shadcn/ui (Radix), wouter routing,
  TanStack React Query, framer-motion, PWA (manifest + `public/service-worker.js`), optional GA4
- **Backend** (`artifacts/api-server`): Express 5, pino logging, Zod validation, pdfjs-dist (PDF text extraction),
  bundled with esbuild to `dist/index.mjs` (ESM)
- **DB/ORM**: PostgreSQL + Drizzle ORM (`drizzle-kit push`, no migration files), drizzle-zod
- **API contract**: OpenAPI 3 (`lib/api-spec/openapi.yaml`) -> Orval codegen -> React Query hooks + Zod schemas
- **LLMs**: Anthropic Claude `claude-sonnet-4-6` via raw `fetch` to `api.anthropic.com` (answers + query translation);
  Google Gemini `gemini-2.5-flash` via `@google/genai` / Replit-managed Gemini integration (screenshot vision only)
- **Retrieval**: lexical, DB-backed ranker in `artifacts/api-server/src/lib/knowledge.ts` (no embeddings; the
  `articles.embedding` column is unused). Exact error-code/quoted-phrase matching boosts scores; threshold 0.4.
- **Auth**: single shared `ADMIN_PASSWORD` (timing-safe compare); bearer token for bulk import. No user accounts.
- Payments / messaging: none.

## Key directories

- `artifacts/teamcenter-kb/` — public web app (Assistant `/`, About `/about`, Admin `/admin` behind LoginPage)
- `artifacts/api-server/src/routes/knowledge.ts` — all product endpoints (chat, articles, import, community, feedback, analytics, login)
- `artifacts/api-server/src/lib/knowledge.ts` — article search/ranking, video link extraction
- `artifacts/api-server/src/lib/content.ts` — `cleanContent()` strips GTAC page boilerplate from imported articles
- `artifacts/mockup-sandbox/` — Replit "Canvas" component preview server (design tooling, not the product)
- `lib/db/` — Drizzle schema (`src/schema/knowledge.ts`: articles, chat_sessions, community_questions, answer_feedback, analytics_events) and `drizzle.config.ts`
- `lib/api-spec/` — `openapi.yaml` (source of truth for API contracts) + `orval.config.ts`
- `lib/api-client-react/` — generated React Query hooks (`src/generated/`) + hand-written `custom-fetch.ts`
- `lib/api-zod/` — generated Zod schemas/types (`src/generated/`) used by the server for validation
- `lib/integrations-gemini-ai/` — shared Gemini client (text, image, batch helpers)
- `scripts/` — `post-merge.sh` (Replit post-merge hook) and a placeholder `hello` script
- `.agents/memory/` — Replit Agent learned notes (Gemini runtime dep, vision model, OpenAPI/Zod compat)
- `attached_assets/`, `.conversation/` — pasted screenshots/prompts from Replit Agent sessions; not app code

## Key commands

```bash
pnpm install                                         # must use pnpm (preinstall script rejects npm/yarn)
pnpm run typecheck                                   # tsc --build for libs + typecheck of artifacts and scripts
pnpm run build                                       # typecheck + build every package
pnpm --filter @workspace/api-server run dev          # build + start API (needs PORT, DATABASE_URL)
pnpm --filter @workspace/teamcenter-kb run dev       # Vite dev server (needs PORT and BASE_PATH)
pnpm --filter @workspace/api-spec run codegen        # regenerate hooks + Zod from openapi.yaml, then typecheck libs
pnpm --filter @workspace/db run push                 # drizzle-kit push schema to DATABASE_URL
pnpm --filter @workspace/db run push-force           # same, --force (destructive; avoid on prod data)
```

- **No tests** exist in this repo (no test runner or test scripts). Verify with `pnpm run typecheck`.
- No lint script; prettier is installed at the root.

## Deployment

Replit Deployments (evidence: `.replit` `[deployment]` with `deploymentTarget = "autoscale"`, `router = "application"`,
and per-artifact `.replit-artifact/artifact.toml` files; git history contains "Published your App" commits).
Deploy by clicking Publish in Replit. There is no Dockerfile, CI workflow, or Vercel/Netlify config.

- API: build `pnpm --filter @workspace/api-server run build`; run `node --enable-source-maps artifacts/api-server/dist/index.mjs`
  with `PORT=8080`, served under path `/api`; startup health check `GET /api/healthz`.
- Web: build `pnpm --filter @workspace/teamcenter-kb run build`, served as static files from
  `artifacts/teamcenter-kb/dist/public` with SPA rewrite `/* -> /index.html`, `BASE_PATH=/`.
- Post-build: `pnpm store prune`. Post-merge hook (`scripts/post-merge.sh`): `pnpm install --frozen-lockfile && pnpm --filter db push`.

## Critical rules

- **API contract workflow**: edit `lib/api-spec/openapi.yaml` first, then run codegen. Never hand-edit
  `lib/api-client-react/src/generated/**` or `lib/api-zod/src/generated/**` (Orval uses `clean: true` and overwrites them).
  The frontend must use generated hooks, not hand-rolled fetch/response types.
- **Zod version trap**: generated Zod targets the installed Zod 3 runtime — avoid OpenAPI annotations like
  `format: uri` (emits `zod.url()`, which breaks typecheck). Run codegen + `typecheck:libs` after every spec change.
  Note: `lib/db` schema imports from `zod/v4`.
- **Orval title**: the transformer forces the API title to `Api` (outputs `api.ts`); keep exports relying on that.
- **Ports / env are mandatory**: API and Vite configs throw on startup if `PORT` (and `BASE_PATH` for Vite) is missing.
  Artifact ports: API 8080, web 21291, mockup sandbox 8081. (`replit.md` says API port 5000 — `artifact.toml` is authoritative.)
  All API routes are mounted under `/api`; the service worker skips `/api/` requests.
- **Gemini SDK dependency**: esbuild externalizes `@google/*`, so `@workspace/api-server` must keep `@google/genai` as a
  direct dependency in sync with `lib/integrations-gemini-ai`, or the bundle fails at runtime with module-not-found.
  Use only the supported flash model (`gemini-2.5-flash`) for vision; keep the text-only fallback when vision fails.
- **Esbuild externals**: native/unbundleable packages must be added to `external` in `artifacts/api-server/build.mjs`.
  The PDF worker is resolved at runtime from `../node_modules/pdfjs-dist/...` relative to the bundle.
- **Languages**: answers must be in the user's language (prompt covers Azerbaijani, Russian, English; UI says
  "Ask in any language"). Non-English queries are translated to English for search, but the original text is kept in
  the retrieval query so error codes/identifiers survive — don't remove that. UI copy is English.
- **Answer format**: Claude must not emit `[Source N]` markers; `replaceNumberedSourcesWithTitles` rewrites them to article titles.
- **Retrieval behavior**: score threshold 0.4 decides community handoff; `articles.url` is unique and imports use
  `onConflictDoNothing` on it (duplicates are skipped). Always run imported content through `cleanContent()`.
- **Auth boundaries**: the public assistant is intentionally open. Admin UI gating is client-side only
  (`sessionStorage` key `arya_admin_access` after `POST /api/auth/login`). The `/api/admin/*` routes, `POST /api/articles`,
  and `POST /api/articles/pdf` currently have **no server-side auth check** — do not assume they are protected, and
  add server-side checks if you touch them. `POST /api/articles/bulk` requires `Authorization: Bearer <BULK_IMPORT_SECRET>`
  (falls back to `ADMIN_PASSWORD`) with timing-safe comparison — keep that.
- **DB schema changes**: edit `lib/db/src/schema/*.ts`, then `pnpm --filter @workspace/db run push` (dev). No migration files.
- **Dependencies**: `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (supply-chain defense) — do not disable.
  Shared versions live in the `catalog:`; `react`/`react-dom` pinned to 19.1.0. Keep `pnpm-lock.yaml` committed.
- **Path aliases** (web): `@/*` -> `src/*`, `@assets` -> repo-root `attached_assets/`.
- `express.json` limit is 25mb (base64 screenshots/PDFs are sent in JSON bodies).

## Environment variables (names only)

- **Database**: `DATABASE_URL`
- **LLMs**: `ANTHROPIC_API_KEY`; `GEMINI_API_KEY` or `AI_INTEGRATIONS_GEMINI_API_KEY`; `AI_INTEGRATIONS_GEMINI_BASE_URL` (Replit-managed integration)
- **Admin / import auth**: `ADMIN_PASSWORD`, `BULK_IMPORT_SECRET` (optional, falls back to `ADMIN_PASSWORD`)
- **Server runtime**: `PORT`, `NODE_ENV`, `LOG_LEVEL`
- **Web build**: `PORT`, `BASE_PATH`, `GA4_MEASUREMENT_ID` (injected as `VITE_GA4_MEASUREMENT_ID`; GA script only added if set)
- **Replit**: `REPL_ID` (enables cartographer/dev-banner Vite plugins in dev)
