# CHG-20261118-dashboard-db01 — Business overview dashboard (DB-01)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-18
- Product version (`VERSION` file) and base SHA / branch/PR: 2.9.0 on `feat/v290-dashboard-db01` from origin/master `9a719dc9e0873077e4549188a675120ff378c98e` (v2.8.3)
- QA repository revision and companion PR/change ID: independent staging QA pending; no bookone-qa companion opened in this change
- Intended before/after behaviour with a concrete example: `/dashboard?period=mtd` shows labelled period headlines (net sales, operating result, net cash movement) and as-of headlines (cash and bank, receivables, payables), card clearing separate from spendable cash, common-scale cash bars, sales/cash series, AR/AP aging, attention, and expense ranking. A 1,000 cash-to-bank transfer no longer makes received and paid both look full-width.
- Existing behaviour that must remain correct: AgentBridge signing PEM_FILE, Compose forwarding, OAuth, AUTH_SECRET, entrypoint, flags, UI-NAV-01 list clipping, tiles remain removed, existing period tokens, named P&L on `/reports`, posting engine unchanged
- Actual changed paths/symbols/routes: `packages/accounting/src/dashboard-metrics.ts`, `dashboard-fixture.ts`, `apps/web/src/app/dashboard/page.tsx`, `apps/web/src/app/actions/dashboard.ts`, `apps/web/src/components/dashboard/*`, `apps/web/src/lib/period-range.ts`, CoreGuard `dashboard-db01`, `docs/DASHBOARD_METRICS.md`
- Business rule/profile/scenario IDs: DB-01 / DB01-NS / DB01-OR / DB01-NCM / DB01-CB / DB01-CC / DB01-AR / DB01-AP
- Accounting, stock/rental, tenant/access and customer-data effects: read-only dashboard aggregates under `accounting.dashboard.read` and dimension scope. No posting, restore, flag, or grant changes. Historical stock valuation deferred.
- Migrations, schema/history compatibility and recovery implications: none
- Dependencies, settings/flags, deployment and external-service changes: no new chart library. Owner deploys after Docker web image is green. Do not change AgentBridge flags or signing material.
- Independent diff/impact review and uncertainties: Medium review still applies. Independent staging QA pending. AgentBridge client qualification pending.
- Checks executed: see TASK_LOG after local verification
- Failed/skipped/flaky/blocked/not-run checks and reasons: live Codex/Claude, OCR, production IdP, GitHub branch protection stay BLOCKED. Isolated Next+seed browser against a live tenant is not this gate; Playwright uses query-backed fixture HTML plus CSS.
- New QA assertions or outstanding work; changed expectations and owner decision: owner Portainer Re-pull ON after GHCR latest is this SHA. Do not replay CONT11/POS 118/Mission1/2.
- Created staging records/cleanup, if any: none
- Documentation updated: `docs/DASHBOARD_METRICS.md`, this CHG, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master per owner overlay. Owner deploys. Independent QA on staging.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them: BookOne tokens in `globals.css`, Card, PeriodSelector, BookOneShell. No new UI framework.
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not used
- Before/after behaviour; independent expected/unchanged example: independent fixture table in `dashboard-fixture.ts` (net sales 4,200, operating result 2,630, net cash 8,476, spendable cash 33,286, clearing 590)
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/dashboard`; PeriodSelector presets used by other modules
- Preserved field/line/source identity, money/stock/history/print and server permissions: posting and documents unchanged; dashboard is read-only
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: Playwright DB-01 at 375/1440/3440, 200% zoom, keyboard, both sidebar modes
- Exact and adjacent regressions; actual engineering checks and missing layers: AgentBridge CoreGuard suites retained. Signing PEM_FILE preserved.
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: none
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert the VERSION 2.9.0 commit. No schema.
- QA companion change/run and independent review link (or pending): pending
