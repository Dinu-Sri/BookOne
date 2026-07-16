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
