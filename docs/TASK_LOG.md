# BookOne v2 — Task Log

> Track major tasks, decisions, and progress. Update as work progresses.

---

## 2026-06-14 — Project Initialization & Scaffold

### ✅ Completed
- Full analysis of v1.x PHP codebase (BookOne v1.4.0)
- Architecture plan document (`docs/ARCHITECTURE_PLAN.md`)
- Accounting engine design document (`docs/ACCOUNTING_ENGINE_DESIGN.md`)
- Multi-tenancy strategy decided: Shared PostgreSQL + RLS
- Technology stack finalized: Next.js 15, TypeScript, Drizzle, shadcn/ui, Docker/Portainer
- Module system design for future ERP expansion (Inventory, Tax, POS, CRM, HR, Costing, Websites)
- Old v1.x PHP files archived to `old-project/`
- AGENTS.md created — canonical AI agent instructions for all AI assistants
- `.github/copilot-instructions.md` synced from AGENTS.md
- `.github/workflows/production-check.yml` created — CI with lint, build, test, security scan, Docker build
- `.env.example` created with all 25+ environment variables documented
- Docker configs created: `docker-compose.yml` (local dev), `docker-compose.prod.yml` (production with Traefik + Cloudflared)
- `Dockerfile.web` (multi-stage Next.js) and `Dockerfile.worker` (BullMQ) created
- `docs/PORTAINER_SETUP.md` — Complete Portainer stack setup guide with all env vars
- `docs/DEPLOYMENT_WORKFLOW.md` — Updated for Portainer GitOps (direct from GitHub repo)
- `docs/PRODUCTION_RULES.md` — 10 unbreakable rules
- `docs/KNOWN_ERRORS.md` — Error reference with fixes
- `ai/AI_CONTEXT.generated.md` — Auto-generated context for AI agents
- `ai/start-session.prompt.md` — Reusable prompt for new AI sessions
- Monorepo structure scaffolded: `apps/web/`, `packages/{db,accounting,auth,ui,modules}`
- Package workspace stubs created (package.json for each)
- Favicon and logo preserved from v1.x
- Pushed to GitHub: `https://github.com/Dinu-Sri/BookOne` (master branch)
- Deployment approach finalized: Portainer pulls directly from GitHub repo, builds Docker images, Cloudflare Tunnel resolves domain

### 🔜 Next Steps
- [ ] Install pnpm + dependencies locally: `pnpm install`
- [ ] Set up Docker Compose locally: `docker compose -f docker/docker-compose.yml up -d`
- [ ] Initialize Next.js app in `apps/web/`
- [ ] Create Drizzle schema for core tables (tenants, users, chart_of_accounts, journal_entries, transactions)
- [ ] Implement Auth.js v5 with tenant-aware sessions
- [ ] Port journal generation logic from `old-project/includes/accounting.php` → `packages/accounting/src/journal-engine.ts`
- [ ] Build simple transaction entry UI (shadcn/ui table + modal)
- [ ] Set up VPS + Portainer + Cloudflare Tunnel
- [ ] Deploy initial version to `bookone.clossyan.com`

### 📝 Decisions Made
- **URL structure:** `bookone.clossyan.com` (not subdomain per tenant)
- **Auth:** Email/password initially, add Google SSO in v2.1
- **Payments:** Stripe for international, PayHere for Sri Lanka (future)
- **File storage:** MinIO (S3-compatible, self-hosted on VPS)
- **Deployment:** Portainer GitOps — pulls directly from GitHub, no container registry needed
- **Branch:** `master` (existing convention from v1.x)

---

## 2026-06-20 - Period Filtering & Suite Sidebar

### Completed
- Wired the accounting period selector into Dashboard, Transactions, Journal, Reports, and Reconciliation using `?period=YYYY-MM` plus `?period=all`.
- Added a reusable `PeriodSelector` client component and shared server-side period option resolver.
- Updated account balance aggregation so period reports only count journal lines whose parent journal entry is in scope.
- Reworked the left sidebar into one-open-at-a-time suite groups for Accounting, Tax, Inventory, POS, and HR. Future suite items are visible but marked as coming soon.
- Verified `tsc --noEmit -p apps/web/tsconfig.json`, `git diff --check`, and `next build`.

### Next Steps
- [ ] Build the bank reconciliation CSV upload and matching wizard.
- [ ] Add live production smoke-test notes after deployment to `bookone.clossyan.com`.

---

## Template for New Entries

```
## YYYY-MM-DD — Brief Description

### ✅ Completed
- Item 1
- Item 2

### 🔜 Next Steps
- [ ] Item 1
- [ ] Item 2

### ⚠️ Blockers
- Blocker description
```

---

*Last updated: 2026-06-14*
