# BookOne v2 — Agent Instructions

> **Canonical AI-agent instruction file.** All AI assistants (GitHub Copilot, Claude, Cursor, etc.) MUST read this file before writing any code in this repository.

---

## Project Identity

- **Name:** BookOne v2
- **Type:** SaaS Accounting & ERP (multi-tenant)
- **Stack:** Next.js 15 (App Router), TypeScript (strict), PostgreSQL 16, Drizzle ORM, shadcn/ui, Tailwind CSS
- **Infra:** Linux VPS, Docker + Portainer, Cloudflare Tunnels, Traefik reverse proxy
- **Domain:** `bookone.clossyan.com` (via Cloudflare Tunnel)
- **Repo:** GitHub → pushed from local VS Code (Windows), pulled to VPS via GitOps webhook

---

## Production-First Rules (NEVER VIOLATE)

1. **Never hardcode localhost URLs, local file paths, passwords, API keys, or secrets.** Use environment variables (`process.env.*`) for everything environment-specific.
2. **Never assume "it works on my machine."** Every change must consider: does this work behind Traefik? Through Cloudflare Tunnel? With RLS enabled? In a Docker container?
3. **Never drop/recreate production tables.** Schema changes are additive migrations only.
4. **Never delete existing functionality.** Preserve working features; add new features alongside.
5. **Never commit `.env` files, secrets, or hardcoded production URLs.** `.env` is in `.gitignore`.

---

## Environment Variables

All configuration lives in environment variables. Template: `.env.example` (committed). Actual: `.env` (never committed).

Key variables:
- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — NextAuth.js secret
- `AUTH_URL` — `https://bookone.clossyan.com`
- `REDIS_URL` — Redis connection for cache/sessions/queues
- `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` — MinIO/S3 for file storage
- `OPENAI_API_KEY` — For AI assistant features
- `SENTRY_DSN` — Error tracking
- `NEXT_PUBLIC_POSTHOG_KEY` — Product analytics (public)
- `CRON_SECRET` — Secret for securing cron job endpoints

---

## Architecture Overview

```
apps/web/          → Next.js App Router (UI + API routes + Server Actions)
packages/db/       → Drizzle ORM schemas, migrations, tenant RLS helpers
packages/accounting/ → Core double-entry journal engine, inference engine, reports
packages/auth/     → NextAuth.js v5 configuration
packages/ui/       → Shared shadcn/ui components
packages/modules/  → Module registry, feature flags (inventory, tax, POS, CRM, HR)
docker/            → Dockerfile, docker-compose.yml, docker-compose.prod.yml
scripts/           → Seed, backup, migration scripts
playwright/        → E2E tests
docs/              → Architecture docs, deployment workflow, known errors
ai/                → AI session files (generated context, start-session prompt)
```

### Multi-Tenancy

- **Shared PostgreSQL with Row-Level Security (RLS)** on `tenant_id` column
- Every table has `tenant_id UUID NOT NULL`
- `app.current_tenant_id` is set at the start of every request via Next.js middleware
- RLS policy: `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)`

### Module System

Modules (inventory, tax, POS, CRM, HR, costing, websites) are activated per-tenant via `tenant_modules` table. Each module has its own schema namespace: `{module_slug}_{table_name}`.

---

## Database Changes — REQUIRED Checklist

When making any schema change, document:
1. [ ] New migration file created in `packages/db/migrations/`
2. [ ] Migration tested locally (`pnpm db:migrate`)
3. [ ] No breaking changes to existing tables (additive only)
4. [ ] RLS policies updated if new tables added
5. [ ] `.env.example` updated if new env vars needed
6. [ ] Commit includes migration file

---

## Deployment Checklist

For every change pushed to `main`:

1. [ ] Local test: `pnpm install && pnpm build && pnpm lint && pnpm test`
2. [ ] Any new env vars? → Added to VPS `.env` AND `.env.example`
3. [ ] Database migration needed? → `pnpm db:migrate` on VPS
4. [ ] Container rebuild needed? → `docker compose build` if Dockerfile changed
5. [ ] Portainer stack redeploy? → Pull latest image + restart
6. [ ] Cache clear? → `docker compose exec redis redis-cli FLUSHDB` (if schema changed)
7. [ ] Queue/worker restart? → If BullMQ processors changed
8. [ ] Cron update? → If new scheduled tasks added
9. [ ] Cloudflare Tunnel check? → Verify `bookone.clossyan.com` is accessible

### Rollback Steps (for risky changes)

1. Revert commit: `git revert <commit-hash>`
2. Push revert
3. If migration ran: run `pnpm db:rollback` or apply reverse migration
4. Restart containers: `docker compose restart`

---

## Portainer Troubleshooting Memory (Verified)

Use these checks before changing architecture or rewriting Docker from scratch.

1. **Compose path must be production file**
- If stack only shows `postgres`, `redis`, `minio`, Portainer is using `docker/docker-compose.yml` (dev file).
- For production stack, compose path must be `docker/docker-compose.prod.yml`.

2. **Web service runtime arg pitfall**
- `pnpm --dir apps/web start -- -H 0.0.0.0 -p 3000` can fail with: `Invalid project directory ... /app/apps/web/-H`.
- Use: `pnpm --dir apps/web exec next start -H 0.0.0.0 -p 3000`.

3. **Docker build context must be clean**
- Keep `.dockerignore` present to exclude `node_modules`, `.next`, `.turbo`, local env/log files, and large local folders.
- Missing `.dockerignore` can cause unstable or non-reproducible builds.

4. **Use deterministic install/build flow first**
- Prefer full repo copy + `pnpm install --frozen-lockfile` + `pnpm --dir apps/web build`.
- Avoid complex partial-copy workspace install patterns until baseline deployment is stable.

5. **Branch consistency for GitOps**
- This repo currently deploys from `master` in Portainer.
- If docs mention `main`, treat that as outdated unless explicitly migrated.

6. **Middleware MUST live in the app, not in a workspace package** *(2026-06-16)*
- Symptom: login page shows "build v9" but DevTools shows every `/_next/static/chunks/*.js` returning **307 → /login**. Page renders as raw HTML, no CSS, JS fails with `Unexpected token '<'`.
- Cause: when `apps/web/src/middleware.ts` re-exports `middleware` and `config` from `@bookone/auth`, Next.js 15's bundler can drop the `config.matcher` during cross-workspace re-export, causing middleware to fire on static assets.
- Fix: keep middleware as a **local** file in `apps/web/src/middleware.ts`. Use a minimal cookie-presence check (no `auth()` call) to avoid pulling bcryptjs/drizzle into the Edge runtime bundle.
- Matcher must explicitly exclude `api/auth` (not just `api`) so NextAuth's own routes aren't intercepted:
  `'/((?!_next/static|_next/image|favicon.ico|favicon.webp|logo.webp|api/auth).*)'`

7. **Do NOT add global `Cache-Control: no-cache` headers in next.config.js** *(2026-06-16)*
- Symptom: HTML loads but JS chunks return 307/HTML with `Unexpected token '<'`.
- Cause: Cloudflare's edge cache was serving stale HTML referencing deleted JS chunks, and our no-cache header was *also* applied (incorrectly) to `_next/static` in some browser paths, masking chunk URLs.
- Fix: remove the custom `headers()` block. Next.js already sends `Cache-Control: public, max-age=31536000, immutable` for `/_next/static/*`. Use a build stamp in the HTML (e.g. `build: v10`) to force fresh fetches after redeploy.

8. **Dockerfile `nextjs` user needs writable pnpm cache** *(2026-06-16)*
- Symptom: `pnpm --filter @bookone/db db:migrate` fails with EACCES on first run.
- Fix: in `docker/entrypoint.sh`, export `PNPM_HOME=/app/.pnpm-store` and `npm_config_cache=/app/.cache/npm`, and `mkdir -p` those dirs. In `Dockerfile.web` `chown` `/app/.cache /app/.next /app/.pnpm-store` to `nextjs:nodejs` before `USER nextjs`.

---

## Key Files to Update When Things Change

| Change | Update These Files |
|--------|-------------------|
| New env var | `.env.example`, `docs/DEPLOYMENT_WORKFLOW.md`, VPS `.env` |
| New DB table | Migration file, `packages/db/schema/`, `docs/KNOWN_ERRORS.md` if common issues |
| New module | `packages/modules/registry.ts`, `AGENTS.md` module list |
| New package dependency | `package.json` in relevant package, root `pnpm-lock.yaml` |
| Architecture change | `AGENTS.md`, `docs/DEPLOYMENT_WORKFLOW.md` |
| Known error discovered | `docs/KNOWN_ERRORS.md` |
| Deployment process change | `docs/DEPLOYMENT_WORKFLOW.md`, `AGENTS.md` |
| **UI / posting / route / settings feature** | **E2E catalog + tests or backlog** — see `docs/E2E_GOVERNANCE.md` |

### E2E keep-in-sync (mandatory on product change)

When shipping user-visible or accounting/stock behavior:

1. Read current level: `pnpm --dir apps/e2e-runner level` (`apps/e2e-runner/src/catalog/level.json`).
2. Add or update scenarios in `docs/E2E_SCENARIO_CATALOG.md` (next `S-NNNN` after `last_scenario_id`).
3. Automate in `apps/e2e-runner/tests/` **or** add `apps/e2e-runner/src/catalog/backlog.json` item (`planned`).
4. `pnpm --dir apps/e2e-runner sync` (export catalog + coverage + level report).
5. After a maturity milestone: `pnpm --dir apps/e2e-runner level:bump -- X.Y.Z "label"`.

Full process: **`docs/E2E_GOVERNANCE.md`**.

---

## Local Development

```bash
# Prerequisites: Node.js 20+, pnpm, Docker Desktop
pnpm install
cp .env.example .env          # Edit .env with your local values
docker compose up -d           # Start PostgreSQL, Redis, MinIO
pnpm db:migrate                # Run migrations
pnpm db:seed                   # Seed test data
pnpm dev                       # Start Next.js dev server at http://localhost:3000
```

---

## Git Workflow

```bash
git add -A
git commit -m "type: description"
git push origin main
```

Commit types: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `db:` (for migrations)

---

## Important Docs

- `docs/PROJECT_STATUS.md` — **Master status, deployment errors, workflows, what's next** (read first)
- `docs/ARCHITECTURE_PLAN.md` — Full technology stack, scaling strategy
- `docs/ACCOUNTING_ENGINE_DESIGN.md` — Simple entry → professional accounting engine design
- `docs/DEPLOYMENT_WORKFLOW.md` — Production deployment steps
- `docs/PORTAINER_SETUP.md` — Complete Portainer stack setup with all env vars
- `docs/CLOUDFLARE_R2_SETUP.md` — R2 bucket + API token creation
- `docs/PRODUCTION_RULES.md` — Rules that must never be broken
- `docs/KNOWN_ERRORS.md` — Common issues and fixes
- `docs/TASK_LOG.md` — Track completed/in-progress tasks
- `docs/LIST_TABLE_UX_GUIDE.md` — Universal list tables: search, duration filter, sort, pagination, view+Actions menu
- `ai/AI_CONTEXT.generated.md` — Auto-generated project context
- `ai/start-session.prompt.md` — Prompt for new AI sessions

---

*Last updated: 2026-06-14 | BookOne v2*

## Codebase Memory MCP

**MANDATORY: use Codebase Memory MCP graph tools FIRST — before reading files or making code changes.**

This rule applies to every request involving this codebase.

Always call `list_projects` first when you do not already know the project name, then use the `display_name` or exact `name` returned by that tool.

```json
// Step 0 — discover project names
mcp_codebase-memo_list_projects()

// Step 1 — use the project identifier returned above
mcp_codebase-memo_get_architecture({ "project": "<display_name>" })
```

### Workflow

1. Call `list_projects` to discover the correct project name.
2. Call `get_architecture(project)` to understand the codebase structure.
3. Use `search_graph` to find relevant symbols, `trace_call_path` for call chains.
4. Use `get_code_snippet` to read specific function implementations.
5. Only use `read_file` when you need exact raw content to edit a specific line.

### Available Tools (14 MCP tools)

**Indexing:**
- `index_repository(repo_path)` — Index a repository into the knowledge graph
- `list_projects` — List all indexed projects with node/edge counts
- `delete_project(project)` — Remove a project and all its graph data
- `index_status(project)` — Check indexing status

**Querying:**
- `search_graph(name_pattern, name_scope, label, file_pattern, exclude_file_pattern)` — Structured search by label, name/qualified_name, include/exclude file globs
- `trace_call_path(function_name, direction, depth)` — BFS call chain traversal
- `detect_changes(project)` — Map git diff to affected symbols + risk
- `query_graph(query)` — Execute Cypher-like graph queries (read-only)
- `get_graph_schema(project)` — Node/edge counts, relationship patterns
- `get_code_snippet(qualified_name)` — Read source code for a function
- `get_architecture(project)` — Codebase overview: languages, packages, routes, hotspots
- `search_code(pattern, project)` — Grep-like text search within indexed files
- `manage_adr(action)` — CRUD for Architecture Decision Records
- `ingest_traces(traces)` — Ingest runtime traces to validate HTTP edges
