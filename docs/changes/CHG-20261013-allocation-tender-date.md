# CHG-20261013-allocation-tender-date — payment boundary permission, tender, calendar dates

Status: shipping on master (v2.2.2).

- Author/agent and date: Grok coding agent, 2026-10-13.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.2.2 on `master` after `993664b`.
- QA repository revision and companion PR/change ID: bookone-qa [HANDOFF-20261013-v2-2-1-findings](https://github.com/Dinu-Sri/bookone-qa/blob/main/handoffs/HANDOFF-20261013-v2-2-1-findings.md), [RUN-10](https://github.com/Dinu-Sri/bookone-qa/blob/main/runs/RUN-20261013-v2-2-1-retest-10.md). Bugs 0010, 0011, 0012. Quality gate already verified (A 15/15).
- Intended before/after behaviour with a concrete example:
  - Exported `allocateDocumentPayment` accepted a synthetic Viewer and persisted a payment (B-007). After: the same function requires `sales.payments.write` for AR documents and `purchase.payments.write` for AP documents, plus tenant/dimension/posted-state checks, before any insert. Viewer / read-only jobs are denied with zero document, journal, allocation, or audit changes. Wrapper `receiveCustomerPayments` still denies Viewer (B-012).
  - The same action accepted revenue `4000` as tender and changed the invoice balance (B-011). After: tender must be a tenant-owned, active, non-void asset whose code is cash `1000` or liquid `11xx`/`12xx` (same family as cashbook banks). Revenue, AR/AP control, expense, inactive, voided, and foreign accounts are denied atomically. Custom banks such as `1101` remain valid.
  - `parseStatementDate('2026-02-30')` returned that ISO as valid (F-004). After: ISO, slash/dash/dot, and constructed Y-M-D values must be real calendar dates including leap years. `2026-02-28` stays valid; `2026-02-30`, `2026-13-01`, and `31/04/2026` return empty `iso`. Preview/commit already skip empty dates.
- Existing behaviour that must remain correct: partial/full allocation, overpay deny, period lock, foreign tenant, unposted/zero/negative, generated payment sequences (B-004–B-006, B-008–B-010). Cash-sale 4000 path unchanged. Amount/sign/fingerprint import tests (F-001–F-003). Sri Lanka DD/MM ambiguous dates. Quality gate (A-014) unchanged. No staging writes.
- Actual changed paths/symbols/routes: `allocateDocumentPayment` in `apps/web/src/app/actions/documents.ts`; `isLiquidTenderCode` in `packages/accounting/src/inference/account-resolver.ts`; `listLiquidAccounts` in `apps/web/src/app/actions/cashbook-banks.ts`; `parseStatementDate` in `packages/statement-import/src/normalize.ts`; unit tests in accounting and statement-import.
- Business rule/profile/scenario IDs: BUG-0010 / B-007, BUG-0011 / B-011, BUG-0012 / F-004. Regression: B-004–B-006, B-008–B-010, B-012, F-001–F-003, A-014.
- Accounting, stock/rental, tenant/access and customer-data effects: payments still Dr cash/bank Cr AR 1300 (or Dr AP 2100 Cr cash/bank). Denied calls persist nothing. Historical journals kept. No schema change.
- Migrations, schema/history compatibility and recovery implications: none.
- Dependencies, settings/flags, deployment and external-service changes: none. Wait for **Docker web image** green, then Portainer Update Re-pull ON. Quote `v2.2.2 · <sha7>`.
- Independent diff/impact review and uncertainties: deployed Viewer/tender exposure was not reproduced on staging. Downstream bank-import corruption from bad dates is not proven; parser deny is the source fix. QA still owns real PostgreSQL permission/RLS/concurrency and Batch B quote→invoice→payment→credit.
- Checks executed: `pnpm lint` pass; `pnpm typecheck` pass; `pnpm test` pass (auth 12, accounting 68 including 2 liquid-tender, statement-import 29 passed / 4 skipped); `pnpm build` pass (Next.js compiled, 127 static pages).
- Failed/skipped/flaky/blocked/not-run checks and reasons: no live staging mutation. `pnpm agent:browse` not required (server/parser, no UI change).
- New QA assertions or outstanding work: retest B-007, B-011, F-004 on identified `v2.2.2` stamp; keep B-004–B-006, B-008–B-010, B-012, F-001–F-003. QA continues B-101–103 and A runtime RLS/concurrency.
- Created staging records/cleanup, if any: none.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, KNOWN_ERRORS.
- Next exact action and responsible role: wait for Docker web image, Portainer Update Re-pull ON; QA quotes `v2.2.2 · <sha7>` and retests the three findings.
