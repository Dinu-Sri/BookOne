# BookOne v2 — Agent Instructions

> **Canonical AI-agent instruction file.** All AI assistants (GitHub Copilot, Claude, Cursor, etc.) MUST read this file before writing any code in this repository.

---

## External QA and coding-agent memory (effective 2026-10-11)

Canonical QA: **https://github.com/Dinu-Sri/bookone-qa** (public). For every coding task, read **docs/QA_CHANGE_CONTRACT.md**, create/update **docs/changes/CHG-YYYYMMDD-short-slug.md** from its template, and update TASK_LOG and PROJECT_STATUS before handover. Tests, scenarios, assertion reviews and run history belong in QA; keep development change records and integration references here. Never publish secrets or raw customer/session evidence.

The inbuilt `/e2e` console, `/api/e2e/**`, and `apps/e2e-runner` were removed (Wave 1b). Control Room Health Check is an empty placeholder; company reset, demo seed APIs/scripts, and the Control Room Audit screen are gone. Browser tests live in bookone-qa. Keep migrations (including unused `019` history), MinIO, `/ops/logs`, CoA/job seeding on signup, and package unit tests. `PLATFORM_ADMIN_EMAIL` grants Control Room (`super_admin`) on signup and login.

The owner confirms **https://bookone.clossyan.com is staging with disposable testing data** and authorizes changes there. Production is outside the QA agent's access. Verify the target; older documents calling this host production are obsolete.

A prior pass never certifies a new build. Record product/QA revisions, schema/configuration, fixtures, exact executed checks, failures/skips and evidence. Critical accounting, stock/rental, tenant/access and data-preservation changes require outcome assertions. Never weaken expectations merely to pass changed code.

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
6. **Never commit product code without bumping `VERSION`.** See [Release versioning](#release-versioning-mandatory-before-every-commit). A commit that leaves `VERSION` unchanged while changing `apps/`, `packages/`, `docker/`, or `scripts/` is incomplete. Do not push it.

---

## Form busy overlay (mandatory)

`FormBusyGuard` in the root layout shows **Working… please wait** after 1.5s. It clears on `emitFormPending(false)`, route change, submit-button unmount, or 45s.

**Do not add a document `submit` capture listener.** That is how the overlay got stuck after backup, reverse, login, and GET filters (same pathname, query only).

When adding a submit or long client write:

| Kind | Required |
|------|----------|
| `<form action={serverAction}>` | Shared `Button type="submit"` from `bookone-ui` (`useFormStatus` emits pending). |
| `preventDefault` + `fetch` / Better Auth / `startTransition` write | `await withFormPending(async () => { ... })` from `@/components/ui/form-busy`. Always clears in `finally`. |
| Search, GET filters, Cancel, `type="button"` | Do not emit pending. |

Never call `emitFormPending(true)` without a matching `false` in `finally`. Prefer `withFormPending`. POS / rental / recon / import wizards may keep a local spinner; if they should show the global overlay, wrap with `withFormPending`.

---

## Release versioning (MANDATORY before every commit)

Full contract: **[docs/VERSIONING.md](docs/VERSIONING.md)**. Read it. Follow it. Do not invent a second scheme.

Canonical file: repo-root **`VERSION`** (`MAJOR.MINOR.PATCH`). The live UI shows `vMAJOR.MINOR.PATCH · <sha7>` in the **sidebar bottom-left** and on `/login`.

**Before `git commit` you MUST:**

1. Bump `VERSION` in this same commit (`pnpm version:bump -- patch` or `minor` / `major`).
2. Write the new version in the CHG record.
3. `git add VERSION` with the rest of the files.

| Change | Bump |
|--------|------|
| Bug fix, permission fix, refactor, chore that rebuilds the web image | **patch** |
| New user-visible feature or screen | **minor** |
| Breaking workflow, API, or unskippable migration | **major** |

Never reuse a version. Never skip a bump because “it is small.” Workspace `package.json` versions are package identity, not the on-screen release. Local `pnpm dev` shows `dev` for the SHA; staging shows the GitHub SHA after Portainer Re-pull ON.

QA must quote the on-screen `vX.Y.Z · sha` in the run record. Findings without that stamp cannot be tied to a build.

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
- `PLATFORM_ADMIN_EMAIL` — Comma-separated emails that receive Control Room (`super_admin`) on signup and login

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
scripts/           → Init, backup, migration scripts
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

For every candidate intended for `master` (the deployment branch):

1. [ ] Local test: `pnpm install && pnpm build && pnpm lint && pnpm test`
2. [ ] Any new env vars? → Added to VPS `.env` AND `.env.example`
3. [ ] Database migration needed? → `pnpm db:migrate` on VPS
4. [ ] Web image: wait for GitHub Action **Docker web image** to push `ghcr.io/dinu-sri/bookone-web:latest` (do not compile on the VPS)
5. [ ] Portainer stack redeploy? → Update with Re-pull ON after the Action is green
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

8. **Web image comes from GHCR** *(2026-10-12)*
- Staging and prod `web` use `image: ghcr.io/dinu-sri/bookone-web:latest` with `pull_policy: always` and **no** `build:`.
- Action **Docker web image** is the image. Production Check is only pnpm lint/build/test.
- Wait for that Action to go green, then Portainer Update with Re-pull ON. Infra stays `pull_policy: missing`.
- Pull 401: set the GHCR package Public or add a `read:packages` PAT in Portainer Registries.
- Do not set a local name like `bookone_stage-web` (Hub 401). Do not add `WEB_IMAGE` env.

9. **Dockerfile `nextjs` user needs writable pnpm cache** *(2026-06-16)*
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
| Product commit (any apps/packages/docker/scripts change) | **`VERSION` bump** — [docs/VERSIONING.md](docs/VERSIONING.md) |
| **UI / posting / route / settings feature** | Change record + corresponding external QA scenarios/assertions — see `docs/QA_CHANGE_CONTRACT.md` |
| **UI you can click** | External QA browser journey or authorized browser tooling; save outcome evidence |

### External QA keep-in-sync

Follow docs/QA_CHANGE_CONTRACT.md. Link the product change record to the external QA change/run. Preserve S-NNNN IDs; do not maintain a second scenario catalog here. New P0 outcomes require implemented assertions before acceptance. Backlog, catalog presence and page-load checks are not release evidence.

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

## Agent UI testing — external QA

Use the browser tooling available in the authorized session or the external harness in [bookone-qa](https://github.com/Dinu-Sri/bookone-qa). For UI changes, exercise the changed and adjacent routes, inspect the rendered result, reload saved data, and verify relevant financial/stock outcomes. Record product build, QA revision, environment and evidence. Do not claim UI verification from code inspection or an HTTP response alone.

The bookone-qa README is authoritative for test commands (`pnpm test:e2e`, `pnpm agent:browse`). Credentials and raw evidence stay outside public Git. If execution is unavailable, record it as blocked/not-run.

---

## Git Workflow

```bash
pnpm version:bump -- patch    # or minor / major — required when the web image rebuilds
git add VERSION
git add -A
git commit -m "type: description"
git push origin <reviewed-branch>
```

Stop if `VERSION` was not bumped and the diff includes `apps/`, `packages/`, `docker/`, or `scripts/`.

Commit types: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `db:` (for migrations)

---

## Important Docs

- `docs/VERSIONING.md` — Mandatory on-screen release version (`VERSION` file + SHA stamp)
- `docs/QA_CHANGE_CONTRACT.md` — Mandatory development-agent handover to external QA
- `docs/changes/README.md` — Durable per-task change ledger and template
- `docs/TENANT_BACKUP_ARCHIVE.md` — Owner company backup/restore contract (empty tenant, two files)

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

*Last updated: 2026-10-13 | BookOne v2.1.0*

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

## Canonical business rulebook (2026-10-14)

The single maintained intended-behaviour reference is https://github.com/Dinu-Sri/bookone-qa/blob/main/docs/rulebook/README.md; readable rules are RULES.md in that directory and the structured source is rules/rulebook.json. QA companion PR: https://github.com/Dinu-Sri/bookone-qa/pull/16.

Before coding, identify applicable stable rule IDs/revisions and rulebook version/Git SHA/JSON hash in the CHG record. Applicable Sri Lankan law and the eligible accounting framework take precedence; current implementation is descriptive evidence, not its own expected result. Initial professional product defaults were delegated by the owner and remain independently expert-pending. Read RF-01–10 in the QA review queue for unresolved applicability and conflicting contracts.

Do not copy a second editable rulebook here, silently change adopted rules/settings or rewrite old assertions/results to match code. Material policy changes use the QA RULE_CHANGE template, responsible rule-owner review, independent worked examples, effective dates and compatibility/migration assessment. New-company defaults do not silently change existing companies or issued facts. Tests and full current-build acceptance remain independent from documentation or code review.


## Mandatory incremental UI/UX compatibility — owner2026-10-21

For every UI, UX, shared form/control, feedback, list, print or navigation change, MUST read docs/UI_UX_CHANGE_GUIDE.md and the relevant existing docs/LIST_TABLE_UX_GUIDE.md, Simple Entry/entity guidance and actual CSS/component implementation. Extend existing design references; never introduce a second design system for this adoption.

MUST record applicable external UX/UXW/WB IDs, exact QA commit/hash, direct screens and transitive shared consumers in CHG before implementation. Preserve existing branding/density, props/field identities, source snapshots, saved dates/notes, posting, access and historical output. Use the smallest compatible change; no global reset/palette/framework/screen rewrite or data migration for cosmetic work.

MUST use existing pending helpers, truthful outcome feedback, retained inputs on refusal, accessible labels/help/focus, coherent source hydration and reconciling row/footer values. No blind financial retry or posting an inconsistent preview. Follow formal accessibility criteria and exceptions rather than community aesthetic bans.

MUST run required product checks plus actual exact/adjacent browser/persisted business regressions and representative shared consumers; record missing layers. Preserve independent QA evidence/expectations and leave bug closure to independent QA. Update existing guides, QA companion links, TASK_LOG and PROJECT_STATUS. Every new or changed UI follows this process; legacy gaps are prioritized incrementally with owned time-bound exceptions. No automatic release/merge/deploy authority follows.

