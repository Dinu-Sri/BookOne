## 2026-10-12 — Remove test ops; PLATFORM_ADMIN_EMAIL for Control Room

- Record: [CHG-20261012-remove-test-ops](changes/CHG-20261012-remove-test-ops.md).
- Deleted Control Room health-check runner (`health-check.ts`, panel, `rental-health.ts`); page is an empty placeholder.
- Deleted Control Room Audit page/nav; tenant `auditLog` writes remain.
- Deleted company reset actions/buttons, `api/platform/seed-rental-demo`, `cleanup-companies`, `platform-cleanup`, `scripts/seed-demo-*`, `generate-demo-product-images.ts`, `db:seed-products`.
- Deleted leftover docs: `E2E_*.md`, `REMOVE_INBUILT_E2E.md`, `PRODUCTION_SMOKE_TEST.md`.
- `PLATFORM_ADMIN_EMAIL` (compose + `.env.example`) promotes listed emails to `super_admin` on signup and login.
- Kept: schema/migration 019, `/ops/logs`, CoA/job seed on signup, package unit tests. No DROP TABLE.
- Next: owner sets `PLATFORM_ADMIN_EMAIL` in Portainer, Update with Re-pull OFF, log out and in.

## 2026-10-12 — Fresh staging stack (wiped images/volumes)

- Owner wiped Portainer images/volumes; data loss accepted. GitHub Action Docker web image #1 succeeded (2m 22s).
- Staging compose compiles web again; MinIO is `chainguard/minio:latest` (Docker Hub no longer has `minio/minio`). First Update uses Re-pull ON.

## 2026-10-12 — Staging web compile re-enabled

- Infra recovered; site was on `bookone_stage-web:latest` (24 Sep). Owner asked to move to current `master`.
- Staging `web` has `build:` again, still tagged `bookone_stage-web:latest`. Dockerfile: Debian, `pnpm@9`, `pnpm install --ignore-scripts` (no frozen-lockfile). Update with Re-pull OFF.

## 2026-10-12 — Staging: infra can start without a web image

- Portainer error `No such image: bookone-web:latest`. Web is now compose profile `erp` so Update can start postgres/redis/minio/traefik/cloudflared without it.
- After infra is up, set `WEB_IMAGE` from Portainer Images and `COMPOSE_PROFILES=erp`.

## 2026-10-12 — Staging compose: stop compiling web on Portainer Update

- Stack uses `docker/docker-compose.staging.yml`. Any `build:` failure removes the whole stack.
- Staging `web` now uses local image `${WEB_IMAGE:-bookone-web}` with `pull_policy: never` (no Dockerfile compile). Infra images `pull_policy: missing`; MinIO stays `never`.
- If web container is missing after Update, set Portainer env `WEB_IMAGE` to the name shown under Images (often `bookone-web` or `bookone-staging-web`).

## 2026-10-12 — Portainer frozen-lockfile: Debian image (second hotfix)

- Owner did the usual Portainer pull after Production Check went green. That workflow never builds the web image (GHCR publish was reverted). Alpine `pnpm install --frozen-lockfile --ignore-scripts` still failed.
- `Dockerfile.web` now uses `node:22-bookworm-slim`, `npm install -g pnpm@9.0.0`, and copies `apps/` + `packages/` like CI. Rebuild **web only**.

## 2026-10-12 — Portainer frozen-lockfile after Wave 1b merge

- `master` merge `2bbc334` made Portainer rebuild the web deps layer. Install failed at `pnpm install --frozen-lockfile --ignore-scripts`.
- Fix: pin pnpm 9.0.0 in `Dockerfile.web`; copy `apps/docs` and `apps/workers` manifests; replace `apps/*` workspace glob with explicit packages; add `.npmrc` supported architectures for Alpine musl.
- Local: frozen-lockfile still up to date (10 projects). Docker CLI not on this machine. Owner should pull/redeploy **web only**.

## 2026-10-12 — Wave 1b: remove inbuilt E2E from BookOne

- Branch `chore/remove-inbuilt-e2e`. Deleted `apps/e2e-runner/`, `/e2e` page, `/api/e2e/**`, e2e Docker service/image, product `E2E_*` env, catalog export scripts, root `test:e2e` / `agent:browse`.
- Middleware no longer treats `/e2e` or `/api/e2e` as public. Docs E2E_* are stubs pointing at https://github.com/Dinu-Sri/bookone-qa.
- Kept Health Check, company reset, seeds, migrations, MinIO, `/ops/logs`, package unit tests.
- Checks: accounting 60 passed; statement-import 26 passed / 4 skipped; lockfile dropped e2e-runner. Typecheck still has pre-existing errors. Docker CLI unavailable here. Denial tests not run (not on `master`).
- Do not merge to `master` until reviewed. Operator: stop `bookone-staging-e2e` and `bookone-e2e.clossyan.com`.

## 2026-10-12 — Wave 1a: QA denial tests + agent-browse port

- bookone-qa branch `qa/chg-20261012-e2e-denial` at `0ed11956634f4bb6117807ad8c1aebe18a357777`. Record: [CHG-20261012-remove-inbuilt-e2e](changes/CHG-20261012-remove-inbuilt-e2e.md).
- S-0031 / S-0032 / S-0033 / S-0578 assert `/e2e` and `/api/e2e` are gone. IDs preserved (747, last S-0760). `pnpm agent:browse` ported. HTTP runner unpublished.
- QA: unit 94 passed / 4 skipped; discovery 770 tests in 29 files; catalog 747/747. Browser denial not executed (staging still hosts the console).
- Next: Wave 1b product delete on `chore/remove-inbuilt-e2e`. Do not merge to `master` until that lands and denial tests run against the cleaned candidate.

## 2026-10-12 — Wave 0: prove preservation before removing inbuilt E2E

- Branch `chore/remove-inbuilt-e2e` from `bdff296`. Change record: [CHG-20261012-remove-inbuilt-e2e](changes/CHG-20261012-remove-inbuilt-e2e.md).
- QA HEAD `b9e13bc`; product pin still `d35ed92`. Inventory 84 imported / 14 source-reference-only. All inventoried files still exist. Catalog IDs match (747, last S-0760).
- Classified leftover files: port `agent-browse` + scenarios to QA; retire HTTP server/console/Docker/ui-audit scripts.
- QA unit against pinned checkout: 94 passed, 4 skipped. Browser discovery: 771 tests in 29 files (not executed). Product vitest: 60 + 26 passed, 4 skipped.
- No runtime deletion. Next: Wave 1a denial tests in bookone-qa, then Wave 1b product delete. Do not merge to `master` until 1a exists.

## 2026-10-11 — External QA handover

Canonical public QA project: https://github.com/Dinu-Sri/bookone-qa. All development agents must follow [QA_CHANGE_CONTRACT.md](QA_CHANGE_CONTRACT.md) and maintain [change records](changes/README.md). The owner requested removal of inbuilt testing through [REMOVE_INBUILT_E2E.md](REMOVE_INBUILT_E2E.md); no runtime removal is performed by this documentation update. See [CHG-20261011-external-qa-handover](changes/CHG-20261011-external-qa-handover.md). Older embedded-runner instructions are superseded by the new contract. Staging test data is owner-authorized; production is outside QA access.

---

# BookOne v2 — Task Log

> Track major tasks, decisions, and progress. Update as work progresses.

---

## 2026-09-12 — Print studio polish, QR, discounts, edit lock

- Browser print uses an iframe so the page is not blank. Sheet is a cleaner letterhead; TIN only on tax invoices.
- Document style: QR to public `/i/{token}`, type scale (minor/major second, thirds, fourth, golden), more fonts.
- Quote/invoice lines: % or LKR discount. Document-level % or LKR discount.
- List: printer icon next to view; Print removed from Actions; Edit added for invoices (lock after N days in Sales settings, 0 = unlimited).

## 2026-09-12 — Print preview popup + live styles

- Print opens an on-page A4 preview (Print / Close). No extra navigation.
- Styles apply if they are **active**; first save now defaults to Make active. Default snapshot is not frozen, so logo/bank/footer show after you activate.
- Logo URL is resolved at print time (signed S3 URLs do not expire on the copy).

## 2026-09-12 — Document styles (print themes)

- Company → **Document styles**: logo, accent colour, columns, TIN/phone/email/bank, footer. One **active** style per document kind (quote / invoice / tax invoice / receipt) and optional brand.
- Saving increments **version**. First print of a document **snapshots** the style so old invoices do not change.
- Tax invoice always prints TIN, tax invoice no., VAT, amount in words.
- Quotes, invoices, and payment receipts share one print engine.
- Migration `035_document_styles.sql`. E2E S-0742, S-0743.

## 2026-09-12 — Purchase line lot cost (not sell price)

- Purchase / GRN / import / cash purchase lines use **Lot cost** (this carton’s buy price). Adding a catalog SKU fills last cost, not sell price. Hint shows last cost and sell price so they are not mixed.
- Sales quotes/invoices still use Unit price = sell price.
- E2E S-0741.

## 2026-09-12 — FIFO cost lots (keep last + average)

- Company → Inventory Settings costing: **Last cost**, **Weighted average**, **FIFO lots**.
- FIFO: each purchase/GRN/opening is a carton at its price. Sales, POS, and purchase returns take the **oldest carton first**. Example: 10 @ 500 then 20 @ 450 → first 10 sold COGS 500, then 450.
- Lots apply to **physical** (and rental fleet qty moves). Digital and service have no lots.
- Last/average still update product cost as before; lots are still maintained so you can switch to FIFO later. Switching to FIFO seeds remaining on-hand as lots at current cost.
- Product edit Stock tab lists open lots. Migration `034_cost_layers.sql`.
- E2E S-0740.

## 2026-09-11 — Product brand and stock location

- Product **Brand** on Identity (All brands = shared). Category brand only prefills if empty.
- Physical/rental **Opening location** on Stock. Required when opening qty > 0 and locations exist. Edit shows stock by location and can move unassigned stock.
- Product list columns Brand and Location. Shop-scoped users only see in-scope brands/locations.
- Existing products stay All brands / Unassigned. Migration `033_product_brand.sql`.
- E2E S-0738, S-0739.

## 2026-09-11 — Finish Team users: password reset, restore, URL deny, cashier E2E

- Team person **Set password** (tell them; no email).
- **Restore** a removed person (Remove no longer voids the row). Last owner cannot be removed.
- Typed URLs the job cannot read redirect to their first allowed screen (`?denied=1`). Cashier home is POS, not Simple Entry.
- E2E S-0717, S-0720, S-0730, S-0736, S-0737.

## 2026-09-11 — Add team person with password (no email)

- Company → Team **Add person**: name, email, password, job. Creates a login immediately. Tell them the email and password; they sign in at `/login`.
- Invite link remains as a second option if they should pick their own password.
- E2E S-0735.

## 2026-09-11 — Team shop scope (brand / location)

- Person page **Shops they can use**: tick locations and brands; blank = every shop. Owner/Admin always see all shops.
- Lists (sales/purchase docs, stock levels, POS registers, transactions) hide other shops. Writes (invoices, simple entry, POS shift, stock moves) blocked outside assigned shops.
- POS brand still comes from register location → location.brandId.
- Migration `032_membership_scope.sql`. E2E S-0734.

## 2026-09-11 — Team groups, SoD, access history, person extras

- Company → **Groups**: name + a non-Owner/Admin extra job + members. Removing a person (or the group) clears that extra job.
- Person page `/company/team/[userId]`: job, **Also help with** (one extra), live screen preview, Allow/Block exceptions, SoD banner when a customized/extra job can both book and pay supplier bills.
- Team **Access history** from `audit_log`. Seat count uses plan (starter 5 / growth 15 / pro 50; sole lite 2 / full 5). Invite job list omits Owner.
- E2E S-0731…S-0733.

## 2026-09-11 — Tenant Team RBAC (jobs, invites, enforcement)

- Company → **Team** / **Jobs**: invite people, assign a job, edit job matrix (No access / View only / Can edit).
- Permission catalog `module.screen.action` in `@bookone/auth`; templates Owner, Admin, Accountant, Sales, Purchasing, Warehouse, Cashier, Viewer.
- Nav hides screens the job cannot read; View only badge; server `assertPermission` on invoices, payments, simple entry, inventory module writes, create company.
- Invites: `/invite/[token]` → sign in → `/invite/complete` joins the company (does not create a second workspace). Copyable invite link.
- Migration `031_tenant_rbac.sql`. Workspace switch writes `active_tenant_id`.
- E2E S-0713, S-0714.

---

## 2026-09-10 — Category tree, brand/location scope, footer align

- Category **Add / Delete / Save** buttons right-aligned (same footer as locations).
- Parent / child categories (two levels, WordPress-style). Child rows indent on the list.
- Optional **brand** and **location** on a category for later inventory reports and website sync. Blank = all shops.
- Products store `category_id` plus the display name POS already uses.
- Migration `030_product_category_tree.sql`. E2E S-0712.

---

## 2026-09-10 — Product units, categories, rich descriptions

- Product form **Sold as** dropdown uses plain labels (Each, Box, Pack, Kilogram…) instead of `ea`.
- Product **categories** master (`inventory_product_categories`) with `/inventory/categories` screen. Create from the product form via popup; delete blocked if products still use the name.
- **Short description** + **long description** rich-text (HTML, WordPress-ready). Compact on the Identity tab; **Edit in popup** for more space.
- Additive migration `029_product_categories_descriptions.sql`.
- E2E: S-0708…S-0711.

---

## 2026-09-10 — Location delete with in-use guard

- Company → Locations now has **Delete** on each saved location.
- Soft-void only (`voided_at` + inactive). Never hard-delete.
- Server re-checks before void: commercial docs, simple-entry transactions, journal entries/lines, stock on hand, stock movements, stock transfer/adjustment docs, POS registers, hire booking lines.
- If anything is linked, UI shows **Cannot delete** with the reasons. Unused locations can be removed after confirm.
- E2E: S-0706 (unused delete) · S-0707 (in-use blocked).

---

## 2026-09-05 — Garden kit live + serials v2 + calendar span (grid)

- Sample kit **GARDEN-SET** on SL TAX SOLUTION: 80 chairs + 10 tables + 1 tent, hire rate 35,000.
- Timeline bars use CSS grid columns so a 12–13 hire covers both days.
- Serials v2: `tracks_serials` + `rental_serials`. Dispatch auto-assigns; return sets available / repair / retired.

## 2026-09-05 — Hire kits + calendar bar span fix

- Timeline bars now span the full hire-from → hire-to (overlay, not grid items).
- Hire **kits**: `rental_kit_components`. Product → Kit tab. Quote/invoice add explodes into component fleet lines.

## 2026-09-05 — Hire calendar timeline (pastel bars)

- Default **Timeline** view: one row per hire SKU, days across, pastel bars spanning hire-from → hire-to.
- Same job keeps the same pastel on every SKU. Overlapping jobs on one SKU stack into lanes. Overdue = peach.
- Month view uses stacked chips; List keeps the table with a colour swatch. Toggle Timeline / Month / List.

## 2026-09-05 — Rental Phase 6 + agent-browse contract

- **AGENTS.md** records `pnpm agent:browse`: when to use, flags, JSON steps, credentials, artifacts, production vs local, no-mutate rule. Copilot instructions point at the same contract.
- **Wash / repair:** return good → warehouse or wash; dirty → wash; **Mark ready** back to warehouse. Stock levels Wash filter.
- **Health Check** full suite step `rental_hire` (4400, no COGS, dispatch → wash → warehouse).
- **Docs** `/docs/inventory/rental`. E2E S-0699…S-0703 + bucket `rental`.

## 2026-09-05 — Agent browser (login + click like a person)

- `pnpm agent:browse` runs Playwright Chromium on this machine, logs in from `.local/debug-accounts.json`, and writes screenshots + text snapshots to `.local/agent-browse/<run>/`.
- Use this for UI verification (hire dispatch, invoices, settings) instead of curl. Session is reused so `/login` is not hammered.

## 2026-09-04 — Hire invoice timing, extension, return photos

- **Invoice timing:** `rental_events.invoice_timing` (`on_confirm` / `on_dispatch` / `after_return` / `manual`). Sales invoices and POS sales with hire lines are blocked until the configured stage unless a manager ticks timing override. Quotes/orders store the timing without the gate.
- **Hire extension:** On-rent / invoice hire panel can push `hire_to` forward, re-checks overlap (excluding this document), pads turnaround, optional extra 4400 invoice.
- **Return photos:** `rental_return_photos` + inspection WebP (fit inside 1600, no crop). Attached on return; thumbnails on the job line.
- Migration: `packages/db/migrations/026_rental_timing_photos.sql`

---

## 2026-07-22 — E2E full-catalog deep automation (Phase 0 + auth)

### Decisions
- **Goal:** automate all 698 catalog scenarios with deep asserts (not shell-only), phased P0→P1→P2/P3
- **Run model:** `/e2e` with target URL + credentials only — **no staging/host gates** (gates removed 2026-07-22)

### ✅ Completed (Phase 0 foundation + Phase 1)
- Helpers: `catalog.ts`, `staging.ts`, `settings.ts`
- Coverage generator: `scripts/generate-coverage.mjs` → `docs/E2E_COVERAGE.md`
- `tests/14-route-smoke-ids.spec.ts` — §18 route smoke IDs (gated)
- `tests/01-auth.spec.ts` — **S-0001…S-0020**
- `tests/03-shell-routes.spec.ts` — **S-0034…S-0049**
- `tests/04-company-masters.spec.ts` — **S-0050…S-0079**
- `tests/12-settings-save.spec.ts` — **S-0694…S-0698**
- Docs: catalog status, automation guide; `.env.example` E2E vars

### ✅ Phase 2 (sales / purchase / stock P0)
- Helpers: `lifecycle.ts` (create/convert/pay/delete), `balances.ts` (stock on-hand, aging, journal)
- `05-parties-products.spec.ts` — §6 product/stock P0 IDs (S-0107…)
- `06-sales-journey.spec.ts` — §8 sales P0 (S-0179… payments, returns, convert)
- `07-purchase-inventory.spec.ts` — §9 purchase P0 (S-0245… GRN/bill/pay)

### ✅ Phase 3 (accounting / POS / validation / day / platform)
- `simpleEntry` modes in `documents.ts` (money in/out/transfer)
- `08-accounting` §11 P0 · `09-pos` §10 P0 · `10-edges-security` §15 P0
- `11-integrity` §19 P0 · `13-validation-catalog` §17 (30 IDs)
- `15-business-day` §12 P0 journeys · `17-platform` §14+§22 (gated)

### ✅ Phase 4–5 (P1 matrices + P2/P3 + stress)
- Catalog-driven packs: parties §7, settings matrix §5 (full-suite), mid-op §13
- Matrices: qty/price §23, numeric §16, reports×period §26, payment §24, status §25
- Public §2 IDs, UI/UX §20, stress §21 (gated), domain remainder §6/8/9/10/11/12/15/19
- Final sweep `27-catalog-sweep.spec.ts` (full-suite, coverage-driven stragglers)
- Helpers: `catalog-run.ts`, `loadScenariosBySectionAndPriorities`, `loadMissingScenariosFromCoverage`

### ✅ E2E governance (current vs next level)
- `docs/E2E_GOVERNANCE.md` — process for feature → catalog → tests/backlog → level bump
- `apps/e2e-runner/src/catalog/level.json` — E2E system level **1.0.0**
- `apps/e2e-runner/src/catalog/backlog.json` — next-level depth upgrades
- Scripts: `export-catalog`, `coverage`, `level`, `level:bump`, `sync`

### ✅ Multi-service Docker (web / docs / e2e)
- Slim `Dockerfile.web` (no Chromium)
- `Dockerfile.docs` + `apps/docs` static site
- `Dockerfile.e2e` standalone Playwright
- `docker-compose.staging.yml` (3 app services) + updated `docker-compose.prod.yml` (web+docs)
- Ops guide: `docs/PORTAINER_MULTI_SERVICE.md`

### 🔜 Next
- [ ] Portainer: switch compose path + set WEB_HOST/DOCS_HOST/E2E_HOST + Cloudflare hostnames
- [ ] Run E2E via `e2e.bookone.clossyan.com`
- [ ] Work backlog BL-0001/BL-0002 → E2E level 1.1.0

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

## 2026-06-20 - Reconciliation Preview & UI Polish

### Completed
- Removed "Suite" and "Workspace" wording from the expandable sidebar group labels.
- Kept the accounting period selector only in the sticky header; Simple Entry now shows today's date instead.
- Replaced text-based dropdown chevrons with lucide chevron icons for a cleaner modern style.
- Replaced the Journal raw `ANY(...)` lookup with Drizzle `inArray()` to avoid UUID-array runtime errors.
- Added the first bank reconciliation CSV preview: upload a CSV, parse date/description/amount columns, and preview matched versus review-needed statement rows.

### Next Steps
- [ ] Persist reconciliation imports and match decisions in the database.
- [ ] Add manual match/ignore controls for unmatched statement lines.

---

## 2026-06-20 - Dashboard & Picker Cleanup

### Completed
- Replaced the native accounting period select with a custom popover picker.
- Removed the Ready card from the left sidebar.
- Added a clickable mini calendar for the Simple Entry header date.
- Simplified Dashboard to working business metrics only: net position, net cash flow, cash available, money in/out, receivables/payables, and posting health.
- Added manual Reconcile / Unmatched actions in the CSV reconciliation preview.
- Added `docs/PRODUCTION_SMOKE_TEST.md` and linked it from the deployment workflow.

### Next Steps
- [ ] Replace remaining Simple Entry native form selects with custom app-styled pickers.
- [ ] Persist reconciliation imports, manual statuses, and period close locks.

---

## 2026-06-20 - Reconciliation Persistence & Period Close

### Completed
- Added tenant-scoped bank statement import, bank statement line, and period lock tables with RLS policies.
- Persisted CSV reconciliation imports and manual Reconciled / Unmatched decisions.
- Added period close controls on Reconciliation and blocked direct Simple Entry posting into locked months.
- Added reversing entries from Transactions; reversals post the opposite journal into the current open period and audit the action.
- Added transaction review filters for search, party, account, low confidence, missing receipts, and unreconciled items.
- Added receipt viewer links using private R2 presigned URLs.
- Updated the production smoke test checklist for reconciliation, period close, reversal, filters, and receipts.

### Next Steps
- [ ] Run live Portainer smoke test after GitHub Actions completes and the stack redeploys.
- [ ] Decide the next ERP module foundation: inventory, tax, POS, or HR.

---

## 2026-06-20 - AR/AP Documents & Reports v1

### Completed
- Added tenant-scoped `business_documents` and `business_document_lines` tables with RLS policies.
- Added reusable customer/vendor party actions and a Parties screen.
- Added Invoices/Bills screen for creating customer invoices and vendor bills.
- Document creation now posts journals to AR/AP plus revenue/expense accounts.
- Added payment allocation against open documents using `settlement_allocations`.
- Added Reports v1 views: Profit & Loss, Balance Sheet, Cash Flow, General Ledger, and Trial Balance.
- Added Accounting sidebar links for Parties and Invoices/Bills.

### Next Steps
- [ ] Add line-item editing and multiple lines per invoice/bill.
- [ ] Add document detail pages, print/PDF, and email/share workflow.
- [ ] Add AR/AP aging reports after payment allocation is validated in production.

---

## 2026-06-21 - Journal Audit & Test Reset

### Completed
- Redesigned Journal into an audit console with integrity metrics, ledger balance checks, and expandable journal rows.
- Added a formal Reports tab structure so Profit & Loss, Balance Sheet, Cash Flow, General Ledger, and Trial Balance are reviewed one at a time.
- Fixed the bank reconciliation CSV upload button by replacing the nested label/button behavior with an explicit file input trigger.
- Added a temporary header Reset data control for admin test cycles. It clears current-tenant operational data and tenant receipt files while preserving tenant, users, and chart of accounts.

### Next Steps
- [ ] Validate reset and journal audit on live Portainer deploy before using it with real data.
- [ ] Add immediate locked-period warning on date selection in Simple Entry and document/payment forms.

---

## 2026-06-21 - Company Settings Foundation

### Completed
- Added tenant-scoped company profile, tax profile, financial year, brand, location, and tenant membership tables.
- Added RLS policy migration for the new company setup tables.
- Rebuilt Settings into a business setup console for legal profile, tax IDs, document prefixes, financial years, brands, locations, and accessible companies.
- Added additional-company creation with owner membership, tax defaults, seeded chart of accounts, and audit logging.
- Added company switching foundation by updating the user's active tenant and redirecting back through login so the tenant session refreshes.

### Next Steps
- [ ] Add onboarding flow that guides first-time users through company profile, tax profile, financial year, and first location.
- [ ] Add role-managed team invitations on top of tenant memberships.
- [ ] Add edit/archive controls for financial years, brands, and locations after the create/list flow is validated in production.

---

## 2026-06-21 - Better Auth, Company Module, and Dimensions

### Completed
- Replaced the NextAuth route/config with Better Auth tables, API route, email/password login, Google login wiring, email verification, and password reset email support through Resend.
- Added a single-page Sign In / Sign Up screen using BookOne styling and the requested tabbed layout.
- Added a reset-password landing page for emailed password reset links.
- Added Company sidebar module with separate Company Details, Tax Info, Brands, Locations, and Domain Verification screens.
- Added DNS TXT based company domain verification instructions and persistence.
- Added brand/location dimensions to transactions, journal entries, and journal lines.
- Made Simple Entry require brand/location when the company has configured them, with auto-selection when only one exists.

### Next Steps
- [ ] Add brand/location filters to Dashboard, Transactions, Journal, Reports, and Reconciliation.
- [ ] Add domain-verified organization joining rules after live DNS verification is tested.
- [ ] Add team invitations and role management on top of Better Auth organizations.

---

## 2026-07-16 — Inventory module upgrade (Sage-aligned)

### ✅ Completed
- Product types: **physical / digital / service** (migrate legacy `stocked` → physical).
- Migration `010_inventory_products_v2.sql` + enriched product fields.
- Posting: COGS/inventory only for physical; digital/service revenue-only.
- Screens: Products (Parties-grade UX), **Stock Levels**, **Stock Ledger**, Transfers, Adjustments.
- Physical-only transfers/adjustments; delete/archive guards; header toasts.

### 🔜 Next Steps
- [ ] Apply migration 010 on production after Portainer redeploy.
- [ ] Smoke: physical sale COGS, digital sale no 5100, transfer TB unchanged.

---

## 2026-07-16 — Parties module full upgrade (Phases 1–4)

### ✅ Completed
- Migration `009_parties_enrichment.sql`: SL tax/identity/address/bank fields, `is_customer`/`is_vendor`, status.
- Dual-role master: one record on both Customer and Vendor lists; role demotion guarded by document usage.
- List: search, status/role/tax/balance filters, multi-column sort (URL searchParams).
- Create/edit forms with full SL field sections; edit routes under `/parties/{customers|vendors}/[id]/edit`.
- Safe soft-delete only when no commercial docs and no simple-entry name matches; Archive/Restore always available.
- `ensureParty` merges dual roles on name match; blocks inactive/blocked parties on document post.
- Sales/Purchase forms: party master picker + walk-in override; invoice credit-limit advisory note.

### 🔜 Next Steps
- [ ] Apply migrations 008+009 on production after Portainer redeploy.
- [ ] Optional: multi-address / multi-bank tables later.

---

## 2026-07-16 — Four modules: Parties, Sales, Purchase, Inventory

### ✅ Completed
- Reorganized app into **4 operational modules**: Parties, Sales, Purchase, Inventory (plus Accounting + Company).
- **Parties:** Customers and Vendors list+new screens (`/parties/customers`, `/parties/vendors`).
- **Sales:** Quotations, Orders, Invoices, Returns, POS, Discounts — list table + New pattern.
- **Purchase:** Purchase Orders, Purchases, Import Purchases, Purchase Returns — same design system.
- **Inventory:** Products, Stock Transfers, Stock Adjustments.
- Schema migration `008_sales_purchase_inventory_parties.sql` (nullable transaction_id, inventory tables, discounts, party fields).
- Posting builders + unit tests for sales invoice/return, vendor/import purchase, purchase return, stock adjustment (COGS accuracy).
- Legacy `/parties`, `/documents`, `/purchase/bills` redirect into new module routes.
- Sidebar nav wired to live module hrefs.

### 🔜 Next Steps
- [ ] Run migration against local Docker Postgres when Docker Desktop is up.
- [ ] End-to-end accounting accuracy walkthrough (product → purchase → sale → return → trial balance).
- [ ] Payment allocation UI on sales invoice / purchase detail pages.
- [ ] Multi-line form editor with add/remove rows (beyond fixed 3 lines).

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

*Last updated: 2026-07-16*
