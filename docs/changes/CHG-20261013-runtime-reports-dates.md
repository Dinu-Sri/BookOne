# CHG-20261013-runtime-reports-dates — named dates, contra income, receipt, RLS, reversal

Status: shipping on master (v2.2.3).

- Author/agent and date: Grok coding agent, 2026-10-13.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.2.3 on `master` after `9c17f2b`.
- QA repository revision and companion PR/change ID: [HANDOFF-20261013-v2-2-2-followup](https://github.com/Dinu-Sri/bookone-qa/blob/main/handoffs/HANDOFF-20261013-v2-2-2-followup.md), [RUN-12](https://github.com/Dinu-Sri/bookone-qa/blob/main/runs/RUN-20261013-v2-2-2-retest-12.md). Bugs 0012 (remainder), 0013, 0014, 0015, 0016. Payment BUG-0010/0011 already verified on v2.2.2.
- Intended before/after behaviour with a concrete example:
  - `parseStatementDate('30 Feb 2026')` returned `2026-03-02` via Date.parse rollover (F-010). After: named-month text is parsed into Y-M-D and rejected unless that calendar day exists. `28 Feb 2026` stays valid. ISO/slash/serial/Date and DD/MM ambiguity unchanged.
  - Invoice 600 + credit 100 posted Dr4100/Cr1300 (B-003 kept). Ledger net revenue 500; getReports income 700 because debit-normal 4100 was added. After: P&L uses credit−debit for revenue and debit−credit for expense, so income 500, cash 250, AR 250. Journals unchanged.
  - `getReceiptDownloadUrl` signed a foreign tenant key (F-008). After: only keys under `tenants/{currentTenantId}/…` are signed. Own receipt still signs once. Adjacent product/style/rental object URLs use the same prefix check.
  - `withTenantContext` set a transaction-local GUC on one pool checkout then ran the callback on another, so a NOBYPASSRLS role saw 0 own rows (RT-002/004). After: one reserved connection holds session `app.current_tenant_id` for the whole callback (including nested `db()` / permission loads); GUC is cleared before release. No BYPASSRLS grant.
  - Two concurrent reversals of 123.45 both posted (RT-006). After: original row is locked inside the same tenant transaction, rechecked, and a unique index allows one non-void reversal per original. The losing request rolls back with a clear error. Sequential reverse, Viewer deny, and audit/link stay.
- Existing behaviour that must remain correct: B-007/B-011 payment denials; B-003 return journals Dr4100/Cr1300; F-004 ISO/slash/leap; F-005–F-007 uploads; RT-005 sequential reversal; RT-007 Viewer reversal deny; cash-sale 4000 path; quality gate.
- Actual changed paths/symbols/routes: `parseStatementDate`; `signedAccountBalance` + `getReports`/`getDashboardData`/`computeAccountBalances`; `getReceiptDownloadUrl` + `resolveProductImageUrl`; `withTenantContext`/`db()` ALS reserved connection; `loadAccessForUser`; `createReversingEntry`; migration `040_reversal_uniqueness.sql`.
- Business rule/profile/scenario IDs: F-010, B-104, BUG-0012, BUG-0016, BUG-0013/F-008, BUG-0014/RT-002/RT-004, BUG-0015/RT-006.
- Accounting, stock/rental, tenant/access and customer-data effects: no journal/history rewrite. Reports/Dashboard use statement signs including contra revenue 4100 and drawings 3100. Receipt signing is tenant-prefix authorized. RLS GUC is connection-scoped. One reversal per original.
- Migrations, schema/history compatibility and recovery implications: additive unique index `transactions_one_reversal_per_original_uidx` on `(tenant_id, reverses_transaction_id)` where reversal is set and not voided. Existing single reversals remain. Duplicate reversal rows would fail the index; none should exist in staging.
- Dependencies, settings/flags, deployment and external-service changes: intended runtime DB role remains a non-owner NOBYPASSRLS login; do not grant BYPASSRLS. Portainer Re-pull ON after Docker web image. Quote `v2.2.3 · <sha7>`.
- Independent diff/impact review and uncertainties: deployed HTTP/browser exposure for receipts and concurrent reverse is still unverified. Existing presigned URLs issued before this fix expire in 10 minutes (receipts) / 1 hour (product images).
- Checks executed: `pnpm lint` pass; `pnpm typecheck` pass; `pnpm test` pass (auth 12, accounting 71 including 3 statement-sign, statement-import 30 passed / 4 skipped); `pnpm build` pass (Next.js compiled, 127 static pages).
- Failed/skipped/flaky/blocked/not-run checks and reasons: no live staging mutation. No local PostgreSQL NOBYPASSRLS role. `pnpm agent:browse` not required for these server/parser paths.
- New QA assertions or outstanding work: retest F-010, B-104, F-008, RT-002, RT-004, RT-006 on `v2.2.3`; keep payment and sequential reversal positives.
- Created staging records/cleanup, if any: none.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, KNOWN_ERRORS.
- Next exact action and responsible role: wait for Docker web image, Portainer Update Re-pull ON; QA pins `v2.2.3 · <sha7>` and reruns the failing cases.
