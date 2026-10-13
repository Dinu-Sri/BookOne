# CHG-20261013-finance-qa-and-sidebar — QA finance defects + sidebar identity

Status: shipping on master (v2.2.0).

- Author/agent and date: Grok coding agent, 2026-10-13.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.2.0 on `master` after `2b92cf4`.
- QA repository revision and companion PR/change ID: bookone-qa [PR #5](https://github.com/Dinu-Sri/bookone-qa/pull/5) handoff [HANDOFF-20261013-finance-and-release](https://github.com/Dinu-Sri/bookone-qa/blob/qa/retest-viewer-permissions-20261012/handoffs/HANDOFF-20261013-finance-and-release.md). Bugs 0005, 0006, 0007, 0008, 0009.
- Intended before/after behaviour with a concrete example:
  - Viewer could persist a reversing journal from Transactions. After: `createReversingEntry` requires `accounting.simple_entry.write`; Viewer UI hides Reverse; denied form posts redirect with `flash=denied_write` and write no rows.
  - Dashboard/Reports cash flow summed `money_in` transaction amounts, so a 123.45 sale plus its reversal showed 246.90 in. After: cash flow is signed debit/credit on accounts 1000/1100/1200; same-period sale+reversal nets 0; October sale reversed in November stays in each month.
  - Customer Open AR summed all non-void `balanceDue`, including archived unposted drafts. After: AR/AP use posted documents only (`postedAt` set, status not draft/void/rejected/pending_approval). Archived posted unpaid remains a debt. Purchase orders are not AP.
  - Reports default heading parsed token `this_month` as 2001-01. After: headings use `periodOptions.label`.
  - Production Check swallowed lint/typecheck/build/test; Docker web image published independently. After: Tests fail the Tests job with no `|| echo`; Lint/typecheck/build fail their own job with no masking. Image publish waits for the same-SHA **Tests** job. Pre-existing turbo typecheck/build errors stay visible on the quality job and do not block GHCR until that debt is cleared.
  - Sidebar: version is centered; logo links to `/dashboard`; first name and job title sit above the version stamp.
- Existing behaviour that must remain correct: Owner/Admin reversals still post offsetting journals and keep history. P&L/balance sheet still come from signed account balances. Viewer still reads transactions. GHCR path and Portainer Re-pull ON unchanged. BUG-0001 cash-sale 4000 path unchanged.
- Actual changed paths/symbols/routes: `packages/accounting/src/cash-flow.ts`, `packages/accounting/test/cash-flow.test.ts`, `apps/web/src/lib/posted-obligations.ts`, `apps/web/src/app/actions/workspace.ts` (`cashFlowForPeriod`, `getReports`, `getDashboardData`, `getTenantInfo`), `record-entry.ts` (`createReversingEntry`, `reverseTransactionFromForm`), `parties.ts`, `commercial-docs.ts` (aging/open lists/credit-limit), `reports/page.tsx`, `transactions/page.tsx`, `bookone-shell.tsx`, `bookone-ui.tsx` (`BrandLockup` href), `globals.css`, `.github/workflows/production-check.yml`, `.github/workflows/docker-web.yml`.
- Business rule/profile/scenario IDs: BUG-0005, BUG-0006, BUG-0007, BUG-0008, BUG-0009.
- Accounting, stock/rental, tenant/access and customer-data effects: cash-flow sign from cash journal lines; AR/AP from posted invoices/bills; reversal is a write. No schema/migration. Historical journals kept.
- Migrations, schema/history compatibility and recovery implications: none.
- Dependencies, settings/flags, deployment and external-service changes: Docker web image waits for Production Check job **Tests** on the same SHA. Lint/typecheck/build run unmasked in a separate quality job (currently red on pre-existing apps/web errors). `workflow_dispatch` still publishes as a manual override. Wait for **Docker web image** green, then Portainer Update Re-pull ON. Confirm sidebar `v2.2.0 · <sha7>`.
- Independent diff/impact review and uncertainties: quality job will show red until turbo typecheck is cleaned. Image publish is gated on Tests, not the quality job.
- Checks executed: `pnpm --dir packages/accounting typecheck` and `test` (66 passed, including 5 cash-flow); `pnpm --dir packages/auth test` (8 passed); `pnpm --dir packages/statement-import typecheck`.
- Failed/skipped/flaky/blocked/not-run checks and reasons: live Viewer reversal and cash-flow retest wait for GHCR + Portainer. `pnpm agent:browse` is not in this repo (ported to bookone-qa) and `.local/debug-accounts.json` is absent, so sidebar UI is code-complete and needs a staging click-through after Portainer. Full turbo lint/typecheck/build still fail on pre-existing apps/web errors; they now fail the quality job instead of being swallowed.
- New QA assertions or outstanding work: retest BUG-0005/0006/0007/0009 on identified `v2.2.0` stamp; confirm Reverse is hidden for Viewer and a direct POST creates no journal; sale 123.45 + reverse nets 0 cash; CUS-0001 archived draft Open AR is 0; default Reports label is the current month name. BUG-0008 needs a controlled failing check after this lands. Period locks, concurrent reversal, foreign-tenant remain outstanding.
- Created staging records/cleanup, if any: none.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS.
- Next exact action and responsible role: wait for Docker web image, Portainer Update Re-pull ON; QA records the on-screen stamp then retests the five bugs.
