# CHG-20261119-dashboard-db02-compact — compact desktop dashboard overview

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-19
- Product version (`VERSION` file) and base SHA / branch/PR: 2.11.5 on `fix/v2115-dashboard-db02-compact` from origin/master `9ed27aad107d37108ac5d9ac491b43ee3e83b88d` (v2.11.4)
- QA repository revision and companion PR/change ID: independent staging QA pending. Handoff CODING-DB02-COMPACT-DASHBOARD.md. No bookone-qa companion opened in this change. Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`.
- Intended before/after behaviour with a concrete example: v2.11.4 `/dashboard` in a normal laptop viewport showed a duplicate company heading, two tall metric rows, always-visible daily tables and more aging below the fold. After this change the default overview is a compact Dashboard title, six KPI cells, two chart panels and a small AR/AP + exceptions summary that fits 1280×720, 1366×768, 1440×900 and 1920×1080 at 100% zoom. Daily tables open from View data. Metric formulas and card-clearing recon open from Details.
- Existing behaviour that must remain correct: DB-01 metric IDs and formulas, period vs as-of, company currency, timezone cutoff, `accounting.dashboard.read`, dimension scope, cash universe excluding internal transfers from received/paid, card clearing separate from spendable cash, AgentBridge AB-11 protocol negotiation, AB-10 exact callback, AB-09 redemption/consent, UI-NAV-01 list clipping, tiles removed, posting engine, company flags
- Actual changed paths/symbols/routes: `apps/web/src/components/dashboard/dashboard-overview.tsx`, `dashboard-controls.tsx`, `dashboard-chart-panel.tsx`, `dashboard-panel-dialog.tsx`, `dashboard-attention.tsx`, `dashboard-markup.ts`, `apps/web/src/app/dashboard/page.tsx`, `apps/web/src/app/globals.css` `.dash-*`, Playwright `e2e/dashboard-db01.spec.ts`, auth `dashboard-db01-gate.test.ts`, `docs/DASHBOARD_METRICS.md`. Aggregates in `apps/web/src/app/actions/dashboard.ts` and `packages/accounting/src/dashboard-metrics.ts` unchanged
- Business rule/profile/scenario IDs: DB-02 compact dashboard. Retains DB01-NS / DB01-OR / DB01-NCM / DB01-CB / DB01-CC / DB01-AR / DB01-AP
- Accounting, stock/rental, tenant/access and customer-data effects: none. Read-only presentation. No posting, restore, flag, or grant changes
- Migrations, schema/history compatibility and recovery implications: none. CoreGuard `dashboard-db01` stays required. CoreGuard version stays `ab-11`. Schema protocol stays `ab-06.1`
- Dependencies, settings/flags, deployment and external-service changes: no new chart library. Owner Portainer Re-pull ON after Docker web image green. Do not change AgentBridge flags or signing material. Do not recreate the saved Codex entry
- Independent diff/impact review and uncertainties: Playwright uses query-backed fixture HTML plus CSS with a realistic shell so viewport-fit assertions include topbar/sidebar. This is not live-tenant dashboard acceptance
- Checks executed: `@bookone/auth` dashboard-db01-gate 7 passed; dashboard-db01-postgres 1 passed source / 1 skipped without local DATABASE_URL. `@bookone/accounting` dashboard-metrics 18 passed. `@bookone/agent-bridge` coreguard 2 passed. Playwright dashboard-db01 7 passed; ui-nav-01 6 passed. Auth ui-nav-01 9 passed. Screenshots in `docs/qa/db02/`.
- Failed/skipped/flaky/blocked/not-run checks: live Codex/Claude, OCR, production IdP, GitHub branch protection stay BLOCKED. Isolated Next+seed browser against a live tenant is not this gate
- New QA assertions or outstanding work; changed expectations and owner decision: owner Portainer Re-pull ON after GHCR latest is this SHA. Independent QA reviews live `/dashboard` at the recorded desktop sizes. Do not replay CONT11/POS 118/consumed OAuth codes
- Created staging records/cleanup, if any: none
- Documentation updated: `docs/DASHBOARD_METRICS.md`, `docs/qa/db02/ACCEPTANCE.md`, this CHG, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys. Independent QA on staging

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them: BookOne tokens and primitives in `globals.css`, `Button`, `BookOneShell`, `PeriodSelector`, native `<dialog>` / `<details>`. No second design kit. Compact density extends the existing `.dash-*` block from DB-01
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: independent fixture totals stay net sales 4,200, operating result 2,630, net cash 8,476, spendable cash 33,286, clearing 590. Daily sales/cash tables move from the default page into View data dialogs. Empty series show “No activity in selected period.” Zero exceptions show “All clear — no flagged items.”
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/dashboard` only. PeriodSelector in the shell is unchanged. Other modules do not consume these components
- Preserved field/line/source identity, money/stock/history/print and server permissions: posting and documents unchanged; dashboard remains read-only under `accounting.dashboard.read`
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: `docs/qa/db02/before-*.png` and `after-*.png` at 1280×720, 1366×768, 1440×900, 1920×1080, 375×720 plus empty 1366×768. Keyboard reaches compare/refresh; View data opens a closeable dialog. 200% zoom keeps `#company` in the layout box
- Exact and adjacent regressions; actual engineering checks and missing layers: AgentBridge CoreGuard suites retained. Dashboard DB-01 financial assertions retained. Signing PEM_FILE preserved. WCAG 2.2 A+AA is the target and is not claimed from these screenshots
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live dashboard acceptance from source-only checks
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert the VERSION 2.11.5 commit. No schema change
- QA companion change/run and independent review link (or pending): pending independent staging review after deploy
