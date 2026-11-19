# CHG-20261119-coa-01-chart-of-accounts — company Chart of Accounts, banks, advances, openings

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-19
- Product version (`VERSION` file) and base SHA / branch/PR: 2.12.0 on `feat/v2120-coa-01-chart-of-accounts` from origin/master `b35762d4bcfd79880ee0c8602564fb6b06b57ac5` (v2.11.5)
- QA repository revision and companion PR/change ID: independent staging QA pending. Handoff CODING-COA01-FULL-CHART-OF-ACCOUNTS.md. No bookone-qa companion opened in this change. Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`.
- Intended before/after behaviour with a concrete example: `/accounts` was a read-only list; business `/cashbook/settings` redirected home; Viewer could mutate banks; Dr 1101=300 did not count as cash; Cr 1100/Dr 1101 counted as an external outflow. After this change a company Owner maintains a full chart (five root classes, subtypes, groups, banks, advances), posts a balanced opening separately from account create, and uses custom banks in cash/dashboard/cash-flow. Customer receive 1000 / apply 400 leaves advance 600 with no sales revenue.
- Existing behaviour that must remain correct: seeded account ids/codes/journals, personal Cashbook, DB-01 metric IDs, DB-02 compact dashboard presentation, CATALOG_VERSION 2, AgentBridge AB-11 protocol negotiation, AB-10 exact callback, AB-09 redemption/consent, UI-NAV-01 list clipping, tiles removed, posting engine, company flags, deposits 2400 distinct from customer advances 2410
- Actual changed paths/symbols/routes: additive `049_chart_of_accounts.sql`; `packages/accounting` classification/lifecycle/advances/csv/opening; `apps/web` `/accounts`, `/accounts/new`, `/accounts/[id]`, `/accounts/opening`, `/accounts/import`, `/advances`; cashbook bank `assertBankWrite`; dashboard/cash-flow `isSpendableCashCode` / `isCashUniverseCode`; archive dump/restore of advance and opening tables; CoreGuard suite `coa-01`
- Business rule/profile/scenario IDs: COA-01. Pilot-01 bank P1s retained. BR-ACC-01–08, BR-SEC-01/02, BR-DAT-01/03, RB-PAY-02, RB-ACC-01, RB-INV-04 as named in the coding pack. Rulebook SHA is recorded by independent QA from bookone-qa at review time
- Accounting, stock/rental, tenant/access and customer-data effects: new journals only from authorized opening/advance actions on the current company. No rewrite of historical journals. No change to real company flags. Isolated synthetic tests only
- Migrations, schema/history compatibility and recovery implications: additive 049. Unique `(tenant_id, lower(code))` including archived; unique active name. RLS on new tables. Restore LAST. CoreGuard `coa-01` required. CoreGuard version stays `ab-11`. Schema protocol stays `ab-06.1` plus 049
- Dependencies, settings/flags, deployment and external-service changes: no new catalog keys. Owner Portainer Re-pull ON after Docker web image green. Do not change AgentBridge flags or signing material. Do not recreate the saved Codex entry
- Independent diff/impact review and uncertainties: Playwright COA-01 uses labelled fixture HTML. Postgres unique-code proof requires `DATABASE_URL`. Isolated restore LAST and live Owner UI remain independent QA. This is not live-tenant CoA/dashboard/Codex acceptance
- Checks executed: `@bookone/accounting` 23 files / 269 passed; `@bookone/auth` coa-01-gate 6 passed, coa-01-postgres 1 passed source / 1 skipped without DATABASE_URL, tenant-archive 26 passed, ui-nav-01 9 passed; `@bookone/agent-bridge` coreguard 2 passed; Playwright coa-01 2 passed, ui-nav-01 6 passed; accounting and db `tsc --noEmit` passed
- Failed/skipped/flaky/blocked/not-run checks: live Codex/Claude, OCR, production IdP, GitHub branch protection stay BLOCKED. Isolated Next+seed browser against a live tenant is not this gate. Restore LAST not executed
- New QA assertions or outstanding work; changed expectations and owner decision: owner Portainer Re-pull ON after GHCR latest is this SHA. Independent QA reviews `/accounts`, `/advances`, custom-bank cash, and the three non-VAT advance examples. Taxable advances stay refused. Do not replay CONT11/POS 118/consumed OAuth codes
- Created staging records/cleanup, if any: none
- Documentation updated: `docs/CHART_OF_ACCOUNTS.md`, `docs/DASHBOARD_METRICS.md`, this CHG, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys. Independent QA on staging

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them: BookOne tokens and primitives in `globals.css`, `Button`, `Card`, `Badge`, `BookOneShell`, native forms. No second design kit. Account actions use `Link className="button"` so New account is a real link
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: Dr 1101=300 is cash and bank 300. Cr 1100/Dr 1101 is an internal transfer. Account create does not write equity
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/accounts*` and `/advances` for business companies; personal `/cashbook/settings` unchanged; dashboard cash totals include custom 10xx/11xx; compact DB-02 layout unchanged
- Preserved field/line/source identity, money/stock/history/print and server permissions: journals keep original lines; cosmetic rename does not mutate amounts; Viewer cannot write
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: Playwright fixture in `e2e/coa-01.spec.ts` (heading, New account link, labelled Search, 1101/HNB, Customer Advances). Live screenshots pending independent QA
- Exact and adjacent regressions; actual engineering checks and missing layers: AgentBridge CoreGuard suites retained. Dashboard DB-01 financial assertions retained. Signing PEM_FILE preserved. WCAG 2.2 A+AA is the target and is not claimed from the fixture
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live CoA acceptance from source-only checks. Taxable advances are an explicit refusal, not a silent skip
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert the VERSION 2.12.0 commit. 049 stays additive; do not DROP columns on a live tenant
- QA companion change/run and independent review link (or pending): pending independent staging review after deploy
