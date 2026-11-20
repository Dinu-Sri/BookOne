# CHG-20261120-bank-recon-live-retest — Align inbox difference, live posting names, guided search-first (v2.14.4)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-20
- Product version (`VERSION` file) and base SHA / branch/PR: 2.14.4 on `fix/v2144-bank-recon-live-retest` from origin/master `7513520d7acaceae6b47bb08f0c8e59c1ab4b39b` / v2.14.3 (PR https://github.com/Dinu-Sri/BookOne/pull/41). Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`
- QA repository revision and companion PR/change ID: independent staging QA pending. Live retest BANK-RECONCILIATION-LIVE-RETEST-20261120 observed v2.14.3 · 7513520. No match, fee, exclusion, finish or closure was submitted on the live workspace
- Intended before/after behaviour with a concrete example: inbox showed Rs. 0.00 while compare showed LKR 1,400.00 unexplained for the same session. Inbox, compare and classic now use `bankClose − bookClose + outstandingNet` and show Unverified when a current comparison is missing. Create category lists this company’s expense/income accounts by actual name (6800 · General Expense), not a hardcoded Bank fees caption. Guided bank-only starts with Search BookOne, then create
- Existing behaviour that must remain correct: ISO import, Bank-left/BookOne-right compare, Confirm match without journals, Review & finish only when the difference is explained, custom-bank 1101, CATALOG_VERSION 2, CoreGuard version `ab-11`
- Actual changed paths/symbols/routes: `packages/statement-import/src/finish-eligibility.ts` `comparisonDifference`; `packages/statement-import/src/posting-accounts.ts`; `apps/web/src/app/actions/bank-reconciliation.ts` list/open/create/`listReconPostingAccounts`; `reconciliation-inbox.tsx`; `reconciliation-compare.tsx`; `reconciliation-guided.tsx`; CoreGuard Playwright bank-recon
- Business rule/profile/scenario IDs: BANK-RECONCILIATION-LIVE-RETEST-20261120
- Accounting, stock/rental, tenant/access and customer-data effects: posting account is resolved from the company chart and verified only in the disposable seeded CoreGuard run. Live prior statement is left intact
- Migrations, schema/history compatibility and recovery implications: none. Restore LAST
- Dependencies, settings/flags, deployment and external-service changes: none. Owner Portainer Re-pull ON after Docker web image green
- Independent diff/impact review and uncertainties: v2.14.3 Production Check `44574669288` and Docker web image `44574669461` succeeded. This candidate does not post on the live tenant
- Checks executed: recorded in TASK_LOG. CI evidence is the unmasked CoreGuard **Pilot custom-bank** step
- Failed/skipped/flaky/blocked/not-run checks: live Codex/Claude, OCR, production IdP stay BLOCKED. Encrypted restore LAST. POS/rental/sales settlement stay not-run. Ambiguous same-amount pairs, date-boundary edges, duplicate re-import, Viewer write denial, and laptop/narrow screenshots remain independent QA. Positive live matching, invalid-direction correction, and live posting-account selection stay on the existing seeded plan
- New QA assertions or outstanding work; changed expectations and owner decision: owner Portainer Re-pull ON after GHCR latest is this SHA
- Created staging records/cleanup, if any: none
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, `docs/qa/bank-recon/ACCEPTANCE.md`
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them: inbox Difference column; compare/guided create category uses `SelectField`; BookOne search uses `TextField`; create preview uses `ConfirmDialog`
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: a session with bank close 1,400 and BookOne close 0 shows LKR 1,400.00 in the inbox and on compare, not Rs. 0.00. Missing closes show Unverified. Fee create lists 6800 · General Expense from the company chart
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/reconciliation`, `/reconciliation/session/[sessionId]`, guided, classic workbench
- Preserved field/line/source identity, money/stock/history/print and server permissions: matching existing records still creates no journals. Create still uses `recordEntry` with an eligible company account
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: CoreGuard Playwright bank-recon checks inbox 85.00, guided Search BookOne, and category General Expense
- Exact and adjacent regressions; actual engineering checks and missing layers: custom-bank Playwright stays in the same CoreGuard lane
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live-tenant reconciliation acceptance
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert this VERSION 2.14.4 commit. No schema change
- QA companion change/run and independent review link (or pending): pending independent staging review after deploy
