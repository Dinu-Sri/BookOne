# BookOne v2 — Master Status, Workflows & Operations Guide

> **Audience:** Anyone joining the project (yourself, future AI agents, or a teammate).
> **Last updated:** 2026-06-16
> **Live URL:** https://bookone.clossyan.com
> **Admin login:** dinu.sri.m@gmail.com / 12345678

This is the single canonical document for **what's built, what's running, what broke and how we fixed it, how to deploy, how to develop locally, and what's next.** It is the companion to `AGENTS.md` (which is AI-specific) and `docs/DEPLOYMENT_WORKFLOW.md` (which is the operational runbook).

---

## Table of Contents

1. [What is BookOne v2](#1-what-is-bookone-v2)
2. [Architecture at a glance](#2-architecture-at-a-glance)
3. [Implementation master plan — done vs in-progress](#3-implementation-master-plan--done-vs-in-progress)
4. [Repository layout](#4-repository-layout)
5. [Data model (PostgreSQL)](#5-data-model-postgresql)
6. [Storage: R2 (Cloudflare)](#6-storage-r2-cloudflare)
7. [Environments & secrets](#7-environments--secrets)
8. [Local development](#8-local-development)
9. [Production deployment — Portainer stack](#9-production-deployment--portainer-stack)
10. [Deployment errors we hit and exactly how we fixed them](#10-deployment-errors-we-hit-and-exactly-how-we-fixed-them)
11. [Code-level conventions & rules](#11-code-level-conventions--rules)
12. [Testing & verification](#12-testing--verification)
13. [What's next (open work)](#13-whats-next-open-work)
14. [Glossary](#14-glossary)

---

## 1. What is BookOne v2

BookOne v2 is a **multi-tenant SaaS accounting & ERP** application, rebuilt from scratch in Next.js 15 (TypeScript, App Router) on top of the proven double-entry accounting logic of the original PHP system. It is built for non-accountants:

- **Simple Entry** is a 4-tile screen (Money In / Money Out / Move Money / Invoice/Bill) with a date, party, amount, free-text description, and a receipt upload.
- **The engine** maps that minimal input to a proper double-entry journal with the right debit/credit accounts, balanced to the cent.
- The user **never** sees "debit" or "credit" in the UI; they just see the result and can override the inferred category if they disagree.

The product positioning and design philosophy is documented in `docs/ACCOUNTING_ENGINE_DESIGN.md`.

---

## 2. Architecture at a glance

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser → Cloudflare DNS → Cloudflare Tunnel (cloudflared)    │
│                                     │                          │
│                                     ▼                          │
│  VPS (Linux)                                                        │
│  ┌─────────────────────────────────────────────┐                │
│  │  Docker stack (Portainer)                        │                │
│  │  ┌────────────┐                                │                │
│  │  │ Traefik    │  ← TLS / routing              │                │
│  │  └─────┬──────┘                                │                │
│  │        ▼                                        │                │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────┐ │                │
│  │  │ bookone-   │  │ bookone-   │  │ bookone- │ │                │
│  │  │ web :3100  │  │ postgres   │  │ redis    │ │                │
│  │  │ (Next.js)  │  │ :5432      │  │ :6379    │ │                │
│  │  └─────┬──────┘  └────────────┘  └──────────┘ │                │
│  │        │                                        │                │
│  │  ┌────────────┐  ┌────────────┐                │                │
│  │  │ bookone-   │  │ cloudflared│  (tunnel)     │                │
│  │  │ minio/S3   │  │            │                │                │
│  │  │ (optional) │  │            │                │                │
│  │  └────────────┘                                │                │
│  └─────────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
                  ┌────────────────────┐
                  │  Cloudflare R2      │  (receipts)
                  │  bookone-receipts   │
                  └────────────────────┘
```

**Tech stack:**

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend + API | Next.js 15 App Router | SSR + server actions, RSC, type-safe |
| Language | TypeScript (strict) | Catch errors at compile time |
| Monorepo | pnpm workspaces + Turborepo | Fast, isolated, native TypeScript |
| DB | PostgreSQL 16 | RLS, JSON, mature |
| ORM | Drizzle ORM | Type-safe SQL builder, no runtime overhead |
| Auth | Auth.js v5 (credentials) | JWT, sessions, password hashing via bcryptjs |
| Storage | Cloudflare R2 (S3-compatible) | 10 GB free, no egress fees |
| File upload | AWS SDK v3 (S3 client) | Works with both MinIO and R2 |
| Reverse proxy | Traefik v3 | Auto-TLS, Docker provider |
| Tunnel | Cloudflare Tunnel | No open ports on VPS |
| CI | GitHub Actions | build + lint + typecheck on every push |
| Observability (planned) | Sentry + PostHog | Errors + product analytics |

---

## 3. Implementation master plan — done vs in-progress

Each phase corresponds to a commit on `master`. Replay them in order if you ever need to rebuild from scratch.

| # | Phase | Status | Commit | Notes |
|---|-------|--------|--------|-------|
| 0 | Legacy audit & architecture docs | ✅ | (pre-monorepo) | README, ACCOUNTING_LOGIC, CHANGELOG |
| 1 | Monorepo scaffold + AGENTS + deployment docs | ✅ | `937de9b` scaffold v2 | pnpm, Turborepo, docker/, docs/ |
| 2 | Docker pipeline working (Traefik, compose, Dockerfile) | ✅ | `3baa35a` | Port 3100 to avoid team-tasks-app |
| 3 | Auto-init entrypoint (migrations + RLS + seed on deploy) | ✅ | `2ded922` | No manual `pnpm db:migrate` needed |
| 4 | Phase 1 — Pure accounting engine + 12 tests | ✅ | `dabfec6` | packages/accounting |
| 5 | Phase 2 — Drizzle schema (9 tables + RLS) | ✅ | `79c517a` | packages/db |
| 6 | Phase 3 — Auth.js v5 with credentials + tenant middleware | ✅ | `39bb0a8` | packages/auth |
| 7 | Phase 4 — `recordEntry` server action | ✅ | `71be731` | Engine + DB transaction + audit |
| 8 | Phase 5 — Login page + entry form wiring | ✅ | `70b136c` | /login + form to recordEntry |
| 9 | Production deploy issues — middleware, cache, pnpm | ✅ | `3e331ea` `ad5fbdb` | Login worked |
| 10 | **Phase A** — Real account selector, date picker, R2 receipts, category override | ✅ | `233b1e2` | apps/web/src/app/actions/* |
| 11 | **Phase B + C** — Dashboard, Transactions, Journal, Reports, Accounts, Reconciliation, Settings | ✅ | `a4d8224` | 7 read pages with real DB data |
| 12 | Period filter actually scopes data | ✅ | (local) | Dashboard / Transactions / Journal / Reports / Reconciliation use `?period=YYYY-MM` or `?period=all` |
| 13 | Multi-tenant switcher | ⏳ | — | User belongs to 1 tenant for now |
| 14 | Bank reconciliation wizard (CSV upload) | ⏳ | — | Reconciliation page is a placeholder |
| 15 | Onboarding wizard (Onborda) | ⏳ | — | First-run tour |
| 16 | Sentry + PostHog | ⏳ | — | Env keys not configured yet |
| 17 | Worker service (apps/workers) | ⏳ | — | Disabled in compose, no source yet |
| 18 | BullMQ cron / scheduled jobs | ⏳ | — | Period close jobs |
| 19 | AI Assistant (OpenAI) | ⏳ | — | Tables exist in `migrations/006_ai_assistant*.sql` |
| 20 | Multi-user invitations | ⏳ | — | Settings page shows 1 user only |
| 21 | Stripe + PayHere billing | ⏳ | — | Env vars reserved in .env.example |

**Recommended next step:** Phase 14 (bank reconciliation CSV upload and matching wizard).

---

## 4. Repository layout

```
BookOne v2
├── apps/
│   ├── web/                        # Next.js 15 App Router (the live app)
│   │   └── src/
│   │       ├── app/                # Routes (/, /login, /dashboard, ...)
│   │       │   ├── actions/        # Server actions (recordEntry, accounts, ...)
│   │       │   ├── dashboard/
│   │       │   ├── transactions/
│   │       │   ├── journal/
│   │       │   ├── reports/
│   │       │   ├── accounts/
│   │       │   ├── reconciliation/
│   │       │   ├── settings/
│   │       │   ├── login/
│   │       │   ├── design-system/
│   │       │   ├── layout.tsx
│   │       │   ├── page.tsx        # Simple Entry
│   │       │   └── globals.css
│   │       ├── components/
│   │       │   ├── layout/bookone-shell.tsx  # Topbar + sidebar
│   │       │   └── ui/bookone-ui.tsx        # Button, Card, Badge, ...
│   │       ├── lib/entry-schema.ts
│   │       ├── lib/demo-data.ts
│   │       └── middleware.ts        # Local middleware (NOT re-exported)
│   └── workers/                    # Disabled — no source yet
├── packages/
│   ├── accounting/                 # Pure TS double-entry engine + inference
│   │   ├── src/
│   │   │   ├── chart-of-accounts.ts            # 20 accounts, 5 types
│   │   │   ├── inference/                      # Tier 1 regex rules
│   │   │   ├── engine/                         # Balanced journal generator
│   │   │   └── index.ts
│   │   └── test/engine.test.ts     # 12 vitest cases, all passing
│   ├── auth/                       # Auth.js v5 + tenant middleware
│   ├── db/                         # Drizzle ORM, migrations, RLS
│   │   ├── src/schema/             # 9 tables
│   │   ├── src/seed.ts             # Admin user + 20 accounts
│   │   ├── src/db.ts               # Lazy DB connection
│   │   ├── src/helpers.ts          # setTenantContext, withTenantContext
│   │   └── migrations/
│   │       ├── 001_enable_rls.sql
│   │       ├── 005_performance_indexes.sql
│   │       └── 006_ai_assistant*.sql
│   ├── modules/                    # Future: feature flags per tenant
│   └── ui/                         # (currently unused — apps/web has its own)
├── docker/
│   ├── docker-compose.prod.yml     # Production stack definition
│   ├── Dockerfile.web              # Multi-stage build, BUILD_DATE arg
│   ├── Dockerfile.worker           # (unused)
│   └── entrypoint.sh               # Auto-init: migrate → RLS → seed → start
├── docs/
│   ├── ARCHITECTURE_PLAN.md
│   ├── ACCOUNTING_ENGINE_DESIGN.md
│   ├── DEPLOYMENT_WORKFLOW.md      # Operational runbook
│   ├── PORTAINER_SETUP.md         # Env var reference
│   ├── PRODUCTION_RULES.md
│   ├── KNOWN_ERRORS.md
│   ├── TASK_LOG.md
│   ├── CLOUDFLARE_R2_SETUP.md      # Receipts setup guide
│   └── PROJECT_STATUS.md           # ← THIS FILE
├── ai/                             # AI context (auto-generated)
├── .github/
│   ├── copilot-instructions.md
│   └── workflows/production-check.yml
├── AGENTS.md                       # AI agent instructions (canonical)
├── .env.example                    # Template — NEVER commit .env
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── package.json
```

---

## 5. Data model (PostgreSQL)

9 tables, all with `tenant_id UUID NOT NULL`, RLS enforced.

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `tenants` | Workspace (1 per company) | `id`, `name`, `slug`, `plan` |
| `users` | Auth + role | `id`, `tenant_id`, `email`, `password_hash`, `role` |
| `accounts` | Chart of accounts | `id`, `code`, `name`, `type`, `normal_side` |
| `parties` | (Future) Customers, suppliers, employees | `id`, `tenant_id`, `name`, `type` |
| `transactions` | User-entered entries | `id`, `accounting_type`, `direction`, `amount`, `party`, `category_*`, `receipt_ref` |
| `journal_entries` | One per transaction | `id`, `transaction_id`, `memo`, `entry_date`, `is_balanced` |
| `journal_lines` | Debit/credit lines | `id`, `journal_entry_id`, `account_id`, `side`, `amount` |
| `settlement_allocations` | (Future) Invoice ↔ payment matching | `id`, `invoice_id`, `payment_id`, `amount` |
| `audit_log` | Every mutation | `id`, `user_id`, `action`, `table_name`, `record_id`, `new_values` |

**RLS policy:** `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)`. Set at the start of every request via `withTenantContext()` (server) or middleware (Edge).

**Migrations:** Use `pnpm --filter @bookone/db db:migrate` (which runs `drizzle-kit push`). In production, the entrypoint script runs this automatically on every container start.

---

## 6. Storage: R2 (Cloudflare)

Receipts are stored in **Cloudflare R2** under the `bookone-receipts` bucket.

| Property | Value |
|----------|-------|
| Endpoint | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| Region | `auto` |
| Force path-style | `true` |
| Public access | ❌ Disabled (private bucket) |
| Auth model | Presigned URLs (10 min) |
| Path layout | `tenants/<tenantId>/receipts/<userId>/<uuid>-<safeName>` |
| Allowed MIME | JPEG, PNG, WebP, HEIC, HEIF, PDF |
| Max size | 10 MB |

**Why R2:** Free 10 GB tier, no egress fees, full S3 API, same code works against MinIO if we ever need to self-host.

**Setup:** See `docs/CLOUDFLARE_R2_SETUP.md` for the 5-minute walkthrough.

---

## 7. Environments & secrets

| Variable | Used for | Where set |
|----------|----------|-----------|
| `DATABASE_URL` | Postgres connection | Portainer stack env |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Compose healthcheck + Postgres image | Portainer stack env |
| `AUTH_SECRET` | NextAuth JWT signing | Portainer stack env (32+ bytes, base64) |
| `AUTH_URL` | NextAuth callback URL | `https://bookone.clossyan.com` |
| `REDIS_URL` | Cache / future BullMQ | `redis://redis:6379` |
| `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`, `S3_FORCE_PATH_STYLE` | R2 / MinIO | Portainer stack env |
| `OPENAI_API_KEY` | AI assistant (Phase 19) | not yet set |
| `SENTRY_DSN` | Error tracking (Phase 16) | not yet set |
| `NEXT_PUBLIC_POSTHOG_KEY` | Product analytics (Phase 16) | not yet set |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflared | Portainer stack env |
| `LETSENCRYPT_EMAIL` | Traefik ACME | Portainer stack env |
| `BUILD_DATE` | Forces Docker cache invalidation on rebuild | Portainer stack env (number) |

**Local `.env`** is in `.gitignore`. Template is in `.env.example`. To set up a teammate:

```bash
cp .env.example .env
# fill in AUTH_SECRET: openssl rand -base64 32
# fill in DB_*
docker compose -f docker/docker-compose.yml up -d postgres redis
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

---

## 8. Local development

**Prerequisites:** Node.js 20+, pnpm 9+, Docker Desktop (for Postgres + Redis).

```bash
# 1. Clone and install
git clone https://github.com/Dinu-Sri/BookOne.git
cd BookOne
pnpm install

# 2. Set up env
cp .env.example .env
# Edit .env: set AUTH_SECRET, leave DB_ defaults

# 3. Start backing services
docker compose -f docker/docker-compose.yml up -d

# 4. Initialize DB (schema + RLS + seed)
pnpm --filter @bookone/db db:migrate
pnpm exec tsx scripts/init-db.ts

# 5. Start dev server
pnpm dev
# → http://localhost:3000
```

**Useful commands:**

```bash
pnpm test                                # Run all vitest suites
pnpm --filter @bookone/accounting test   # Just the accounting engine
pnpm --filter @bookone/web typecheck     # TypeScript check
pnpm --filter @bookone/web build         # Production build (no start)
pnpm --filter @bookone/db db:studio      # Open Drizzle Studio (DB GUI)
```

---

## 9. Production deployment — Portainer stack

**Source of truth:** GitHub `master` branch → Portainer pulls → Docker builds.

**In Portainer:**

1. **Stacks → bookone → Editor**
2. Repository: `https://github.com/Dinu-Sri/BookOne`
3. Compose path: `docker/docker-compose.prod.yml` ← **must be the prod file, not dev**
4. Environment variables: see Section 7 above. **Do not include quotes around values unless the value contains spaces.**
5. **Set `BUILD_DATE` to a new number on every rebuild** (e.g. `1`, then `2`, then `3`) to force Docker to skip its cache. This is critical when you change `Dockerfile.web` or `apps/web/`.
6. Click **Deploy the stack**.

**What happens automatically on `Deploy`:**

1. GitHub webhook → Portainer pulls latest `master`
2. Docker builds `bookone-web` with `BUILD_DATE` arg
3. `entrypoint.sh` runs inside the new container:
   - Waits for Postgres
   - Runs `drizzle-kit push` (additive migrations only)
   - Applies RLS policies via `scripts/init-db.ts`
   - Seeds admin user + 20 accounts (idempotent)
4. `next start` on port 3100
5. Traefik routes `bookone.clossyan.com` → `bookone-web:3100`

**Manual overrides** (only if auto-init fails):

```bash
docker exec -it bookone-web sh
pnpm --filter @bookone/db db:migrate
pnpm exec tsx scripts/init-db.ts
```

---

## 10. Deployment errors we hit and exactly how we fixed them

A chronological log of every blocker we hit during deployment and the exact fix. Use this when something breaks again.

### 10.1 Missing `pnpm-lock.yaml` → CI install fails

- **Symptom:** GitHub Actions `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` on `pnpm install --frozen-lockfile`
- **Fix:** Run `pnpm install` locally, commit `pnpm-lock.yaml`.
- **Lesson:** The repo's CI branch was `master`; the workflow was set to run on `main` only. Fixed to `master`.

### 10.2 Portainer shows only Postgres, Redis, MinIO

- **Symptom:** Stack shows 3 services instead of all 6.
- **Cause:** Portainer was using `docker/docker-compose.yml` (the dev file) instead of `docker/docker-compose.prod.yml`.
- **Fix:** In Portainer, change the compose path. The dev file is intentionally minimal.

### 10.3 Traefik YAML escape error

- **Symptom:** Container restart loop with `yaml: found character that cannot start any token`.
- **Cause:** A Traefik label contained a value with an unescaped `:` character.
- **Fix:** Properly quote the label value: `key="value with : inside"`.

### 10.4 Worker service fails to build

- **Symptom:** `pnpm --filter @bookone/worker build` fails with "no source files".
- **Fix:** Disabled the worker service in `docker-compose.prod.yml` (commented out). Will re-enable when `apps/workers/` has real code.

### 10.5 `next build` filter mismatch

- **Symptom:** `next build` runs in the wrong directory or skips web.
- **Cause:** `turbo.json` filter was `web`, the workspace package is `@bookone/web`.
- **Fix:** Aligned all filters to the workspace package name.

### 10.6 `next start` arg parsing

- **Symptom:** `Invalid project directory ... /app/apps/web/-H`.
- **Cause:** `pnpm --dir apps/web start -- -H 0.0.0.0` is invalid syntax.
- **Fix:** `pnpm --dir apps/web exec next start -H 0.0.0.0 -p 3100` (use `exec`, not `start`).

### 10.7 Docker build context issues

- **Symptom:** Build hangs on `COPY . .` or fails with "no such file or directory".
- **Fixes applied:** Added `.dockerignore`, made the `public/` dir exist with `.gitkeep`, reordered `COPY` and `RUN` layers to invalidate cache properly.

### 10.8 DATABASE_URL password mismatch

- **Symptom:** `password authentication failed for user "bookone"`.
- **Cause:** `DATABASE_URL` contained `bookone:bookone` but the Postgres container was created with a different password.
- **Fix:** Make sure `DATABASE_URL`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` in Portainer all match what the `postgres` service in compose expects. `DATABASE_URL` should be:
  `postgres://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}`

### 10.9 Login page shows, no design, login button does nothing

- **Symptom:** HTML loads, no CSS, every JS chunk returns **307 redirect to /login**, console shows `Unexpected token '<'`.
- **Root cause:** `apps/web/src/middleware.ts` was `export { middleware, config } from '@bookone/auth';` — a re-export across the workspace boundary. Next.js 15's bundler dropped the `config.matcher` during the re-export, so the middleware ran on EVERY path including `/_next/static/*`. Each chunk request got redirected to `/login` and the browser tried to parse HTML as JS.
- **Fix (3e331ea):** Make `apps/web/src/middleware.ts` a local file with a minimal cookie-presence check (no `auth()` call, to avoid pulling bcryptjs into the Edge bundle). Matcher: `'/((?!_next/static|_next/image|favicon.ico|favicon.webp|logo.webp|api/auth).*)'`

### 10.10 Cloudflare CDN caching stale HTML

- **Symptom:** After deploy, browser still shows old HTML referencing deleted JS chunks.
- **Cause:** Custom `Cache-Control: no-cache` header in `next.config.js` interacted badly with Cloudflare's edge cache.
- **Fix (3e331ea):** Removed the custom header. Next.js's default cache headers are correct: `immutable` for `/_next/static`, short max-age for HTML. A visible build stamp (`build: v10`) in the HTML forces a fresh fetch.

### 10.11 Port conflicts

- **Symptom:** `bind: address already in use` on port 3000, then 3001.
- **Cause:** Another app (team-tasks-app) is on the VPS.
- **Fix:** Switched to port 3100. `docker-compose.prod.yml`, `Dockerfile.web`, and `entrypoint.sh` all updated.

### 10.12 Docker build cache not invalidating

- **Symptom:** Code changes don't appear after redeploy.
- **Fix:** Added `ARG BUILD_DATE` in `Dockerfile.web`, set via Portainer env. Increment the value to force a fresh build.

### 10.13 `tsx: not found` inside the container

- **Symptom:** Entrypoint script fails with `tsx: not found` when running as `nextjs` user.
- **Cause:** pnpm store is not writable by the non-root user.
- **Fix:** Export `PNPM_HOME=/app/.pnpm-store`, `npm_config_cache=/app/.cache/npm` in entrypoint; `chown` these dirs in Dockerfile to `nextjs:nodejs` before `USER nextjs`.

### 10.14 `categoryOverride` typecheck error after extending the engine

- **Symptom:** `Property 'categoryOverride' does not exist on type ... & { direction: 'invoice_bill' }`.
- **Cause:** Added `categoryOverride` to the Zod schema but not to the matching TypeScript interface in `packages/accounting/src/inference/types.ts`.
- **Fix:** Always update both the Zod variants AND the TS union interfaces in lockstep. Documented in `/memories/nextjs.md`.

---

## 11. Code-level conventions & rules

(Enforced by `AGENTS.md`. Re-stated here for visibility.)

1. **No hardcoded localhost / secrets** in source. Use `process.env.*`.
2. **Never bypass tenant isolation.** Every DB query that touches tenant data MUST be inside `withTenantContext(user.tenantId, ...)`.
3. **Never `DELETE`** — set `voided = true` / `voidedAt = timestamp`.
4. **Every financial mutation must create journal entries** (via the engine).
5. **Use DB transactions** for multi-table mutations. If one step fails, all roll back.
6. **Schema changes are additive migrations only.** Never modify a migration file after it's been deployed. Create a new one with the next sequence number.
7. **Audit everything** financial in `audit_log`.
8. **Respect period locks.** Locked periods cannot be directly edited — create a reversing entry.

Additional BookOne-specific conventions:

- **Server actions live in `apps/web/src/app/actions/<domain>.ts`** and are the only way client components talk to the DB.
- **Pages can be Server Components** (read data via `getX()` server action) **or Client Components** (form interactions). Prefer Server Components for read paths.
- **Middleware must be a local file** in `apps/web/src/middleware.ts` — never re-exported from a workspace package (lesson 10.9).
- **Build stamp**: every meaningful user-facing change should bump `build: vN` in `login/page.tsx` so a quick visual confirms a fresh deploy.

---

## 12. Testing & verification

| Layer | How | When |
|-------|-----|------|
| Accounting engine | `pnpm --filter @bookone/accounting test` — 12 vitest cases | On every change to `packages/accounting` |
| TypeScript | `pnpm --filter <pkg> typecheck` | Before commit |
| Production build | `pnpm --filter @bookone/web build` | Before commit |
| Live deploy | Redeploy in Portainer, open https://bookone.clossyan.com | After push |
| RLS isolation | `pnpm exec tsx scripts/test-rls.ts` (TODO: write) | After any schema migration |
| End-to-end | Playwright (planned, not yet wired) | Pre-release |

**Manual smoke test (use after every deploy):**

1. Open https://bookone.clossyan.com/login
2. Sign in with `dinu.sri.m@gmail.com` / `12345678`
3. Verify the build stamp in the corner is the latest
4. Click Dashboard → should show real metrics
5. Click Simple Entry → fill in form, submit → "Entry recorded. Journal #..."
6. Click Journal → see the new entry with balanced lines
7. Click Reports → see the P&L reflect the new entry
8. Click Accounts → see updated balances

---

## 13. What's next (open work)

In rough priority order, picking up from where we are today:

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| 🔴 High | Bank reconciliation CSV upload | 1 day | Closes the period-close loop |
| 🟡 Med | Onboarding tour (Onborda) | 1 day | First-time UX |
| 🟡 Med | Sentry + PostHog wiring | 0.5 day | Observability |
| 🟢 Low | Multi-tenant switcher (user_tenants join table) | 2 days | For orgs with multiple companies |
| 🟢 Low | Stripe / PayHere billing | 3 days | Self-serve plan upgrades |
| 🟢 Low | AI Assistant (OpenAI) | 2 days | "What did I spend on rent in Q2?" |
| 🟢 Low | Worker service (BullMQ) | 1 day | Cron jobs, async tasks |
| 🟢 Low | Multi-user invitations | 1 day | Team collaboration |

Tell me which to pick up and I'll plan the work.

---

## 14. Glossary

| Term | Meaning |
|------|---------|
| **Account** | A ledger account (e.g. "Cash on Hand" code 1000). One of asset / liability / equity / revenue / expense. |
| **Journal entry** | A dated group of debits and credits that together balance to zero. |
| **Debit / Credit** | The two sides of a journal line. Whether a debit or credit increases a balance depends on the account's `normalSide` (asset/expense = debit-normal, liability/equity/revenue = credit-normal). |
| **RLS** | Row-Level Security — PostgreSQL feature that hides rows from a query based on a `current_setting(...)` value. |
| **Simple Entry** | The 4-tile UI for non-accountants. The "what happened?" screen. |
| **Engine** | The TypeScript function `inferTransaction()` that maps a Simple Entry to a balanced journal. |
| **Category override** | User picking a different expense account than what the engine inferred. Stored with `categorySource = 'override'`. |
| **R2** | Cloudflare's S3-compatible object storage, 10 GB free tier. |
| **Period** | A calendar month. The app groups reports by period. Locked periods are read-only. |
| **Tenant** | A workspace / company. All data in BookOne is tenant-scoped via RLS. |
| **BookOne** | This product. |

---

*Last reviewed: 2026-06-16 by GitHub Copilot.*
*If you find anything missing or wrong, edit this file. It is the single source of truth.*
