# CHG-20261029-rapid02-consolidated — cash-refund settlement, allocation feedback, financial activity, return tender, rental contract (v2.5.23)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-10-29.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.5.23 on review branch `fix/v2523-rapid02-consolidated` after v2.5.22 `211771e95d6f97cac5eb281a0f8e63f0fceef8a4`. This is a reviewable source candidate. Do not merge or deploy as part of this request.
- QA repository revision and companion PR/change ID: Rapid02 continuation results `c8b86bd61a88c2170d85f333addb610bbb31c07a` ([PR 89](https://github.com/Dinu-Sri/bookone-qa/pull/89)). Consolidated coding mission [CODING-MISSION-20261029-rapid02-consolidated](https://github.com/Dinu-Sri/bookone-qa/blob/c8b86bd61a88c2170d85f333addb610bbb31c07a/handoffs/CODING-MISSION-20261029-rapid02-consolidated.md). Execution: 18 passed / 3 failed / 2 inconclusive / zero pending. Both Rapid02 queues and their transactions are consumed. Do not replay purchases, refunds, credits, receipts or payments. Do not repair live QA records.
- Intended before/after behaviour with a concrete example:
  - **P2 supplier cash-refund settlement:** Cash purchase 240 then purchase returns 60 and 180 (and service 80 then 40+40) already posted correct cash/stock or expense reversals and exhausted source quantity/value, but the four refund credits stayed `open` / paid 0 / balance 60,180,40,40. A completed cash refund now stores `paidAmount = total`, `balanceDue = 0`, `status = refunded` on the **return** document. Original cash-purchase payments are not rewritten. Ordinary AP credit-bill allowance stays on the apply-to-source path (`paid` / balance 0). No extra cash posting.
  - **P2 allocation UX:** Receive Payments and Pay Vendors now show per-source `aria-invalid` / `role="alert"` copy as amounts change when a selected source exceeds its own balance (81 against 80 with a second 80). Record payment stays disabled until every selected amount is within balance + 0.005. Values are not clamped. Submit-time toast and server `PAYMENT_OVER_BALANCE_MESSAGE` remain. Valid 30/20 then 50/60 still submit.
  - **Financial activity:** `/journal/audit` lists tenant-scoped `audit_log` rows for financial tables with actor, action, source, record id and event text. Permission is existing `accounting.journal.read`. Team access history stays on Team. Journals stay on Journal. Cashier is denied. Foreign rows cannot appear: query is inside `withTenantContext` and filters `tenant_id`.
  - **Ordinary sales-return tender:** New sales return shows Refund from account with current-tenant active liquid cash/bank/card accounts plus Credit only. Server cash-refund path was already present; the ordinary UI now uses it. Original receipt is kept on cash refund (existing `cashRefund` skip of AP/AR apply).
  - **Rental catalogue:** Owner product-create view-only is the Inventory module/plan ceiling, not a missing Owner job. Starter defaults keep inventory and rental off. Supported enabled-positive fixture is a company (or sole full) with Inventory and Rental modules on via Control Room plan/modules. Denied fixture is Starter / inventory off / Viewer. A rental product still does not qualify booking, deposit, dispatch, return, inspection, charges, deposit apply/refund, availability, audit or reports.
  - **Reliability:** Original first guarded Logout and delayed View/Print observations are preserved. Session-cookie expire now sets HttpOnly/Secure. This is hardening, not a proven reproduction of the first logout. View/Print has no claimed product defect. Do not physically print.
- Existing behaviour that must remain correct: Rapid02 accepted 12 financial submissions and their cash/AP/AR/stock/journal effects. Ordinary credit-bill allowance 40 paid/balance 0. Original purchase payments. Cumulative return quantity/value limits. Valid partial then final customer/vendor allocations. BUG-0039/0040 expectations (cash-refunded credit settles; revenue 4000 is not tender). Light07 S600/P200 and converted quotation/order 600 stay untouched. No live-data repair.
- Actual changed paths/symbols/routes:
  - `isCashSettledReturn` / `purchaseReturnRefundCashAccount` in `packages/accounting/src/cash-return-settlement.ts`; used by `createCommercialDocument` settlement and purchase-return refund cash.
  - Payment allocation helpers in `packages/accounting/src/document-guards.ts`; `AllocationAmountField`; both payment forms; server `allocateDocumentPaymentBody`.
  - `listFinancialAuditEvents` and `/journal/audit`; Journal Activity link; nav Activity aliased to `accounting.journal`.
  - Sales return `showPaymentAccount` + credit-only option; cash-purchase-linked purchase return refund account.
  - `getDocumentFormOptions` liquid tender list uses `isLiquidTenderCode` and active assets.
  - Product create/edit view-only copy names module/plan ceiling vs job denial.
  - Purchase-return status guide includes refunded/paid/partial.
  - Logout cookie expire attributes.
- Business rule/profile/scenario IDs: Rapid02 cash-refund settlement; BUG-0039/0040; BUG-0061 over-balance feedback; RB-PAY-02; RB-UI-01; BR-SAL-02 / BR-ACC-02. Rulebook 1.0.0 / hash `abcdd8970b1c36e62a97c6a111d6088ca97067ad3d6e954f64250b67989b39fc`. UX refs: UXW-002 outcome feedback; UXW-018/021 status help. Last known UX JSON SHA256 `383d18ad74978af67e9e75d855c77c87b45a92beb00c101a3338dd0abd01e57f`. QA commit `c8b86bd61a88c2170d85f333addb610bbb31c07a`.
- Accounting, stock/rental, tenant/access and customer-data effects: cash refund GL posting is unchanged; only return document paid/balance/status is aligned with that posting. AP aging already ignored open purchase_return credits (`AP_BILL_TYPES`). Allocation over-balance is UI+existing server. Audit is read-only. Rental writes are not expanded. Sales-return tender uses existing `assertEligibleDocumentTender`.
- Migrations, schema/history compatibility and recovery implications: **none**. No migration. Existing Rapid02 refund credits remain `open` / paid 0 until a separate reviewed data-repair, if ever authorized. Code rollback is not data rollback. Do not rewrite issued history in this candidate.
- Dependencies, settings/flags, deployment and external-service changes: quote `v2.5.23 · <sha7>` after a later authorized deploy. No env vars, migrations, or new dependencies. No merge or deploy in this request.
- Independent diff/impact review and uncertainties: live Rapid02 refunds are historical and will still display open until re-posted on a new fixture. Server denial of over-allocation was not submitted in Rapid02; this candidate preserves it and adds UI. Audit UI reads existing `audit_log` writers; absence of a row for an old event is not proof the writer was missing. Rental lifecycle remains unqualified. Logout/View/Print original observations are not closed. Encrypted backup last. BookOne is not customer-ready.
- Checks executed: `Set-Location packages/accounting; node node_modules/vitest/vitest.mjs run` — 13 files, 182 passed (was 171 on v2.5.22; added cash-return settlement 6, financial-audit 2, allocation feedback 3). `packages/auth` vitest — 10 files, 90 passed (was 86 on ceiling file; added rental contract 3 and journal-read gate 1). `packages/statement-import` vitest — 4 files, 34 passed. No Rapid02 financial replay. No live browser stamp. Full `pnpm check` / `pnpm test` not claimed green from these focused package tests.
- Failed/skipped/flaky/blocked/not-run checks and reasons: no live browser stamp on this candidate. No replay of Rapid02 financials. No restricted-DB HTTP. Isolated v2.5.14 upgrade not prepared. Assistive-technology and 320/390 rendered evidence not run here. Full `pnpm check` may still include unrelated Windows workflow-governance failures; product package tests are the engineering evidence. Backup last.
- New QA assertions or outstanding work: Medium reviews this diff and binds a NEW Rapid regression queue on a fresh fixture/clock after candidate review. Required grouped regressions are listed below. Do not close Rapid02 failures from this code alone. Do not retarget consumed Rapid02 transactions.
- Created staging records/cleanup, if any: none. Live QA records immutable.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS.
- Next exact action and responsible role: Medium compares this exact diff, then publishes a NEW Rapid regression queue. Owner may later authorize merge/deploy. Do not merge or deploy in this request.

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.

## Historical-data implications (review separately)

The four Rapid02 supplier cash-refund credits already posted correct cash/stock or expense journals and remain `open` / paid 0. This candidate does not update those rows. A later reviewed repair, if authorized, would set those return documents to `refunded`, `paidAmount = total`, `balanceDue = 0` without inserting another cash journal or touching the original cash purchases. Until then, list/detail/history/report consumers of those four records stay historically wrong. New cash refunds on this candidate persist settled state.

## Qualification gaps

| Gap | Status | Owner / prerequisite |
|---|---|---|
| Supplier cash-refund settlement | Implemented for **new** posts. Historical Rapid02 rows unrepaired. | Coding done; QA retest on fresh fixtures. Data-repair is a separate reviewed change. |
| Allocation over-balance UI | Implemented on both forms. Server check preserved. Concurrency/atomicity not newly proven. | QA: isolated invalid 81+80 with zero persistence; valid 30/20 then 50/60. |
| Financial actor/action audit | Implemented `/journal/audit` on existing `audit_log` + `accounting.journal.read`. | QA: bind a real Rapid02 or new actor/action/source/event; cashier denial; foreign-tenant empty. Do not create live money only to rediscover old events. |
| Rental catalogue / lifecycle | Contract qualified. Not a defect. Enabled-positive needs Control Room Inventory+Rental on. Lifecycle (book/reserve/deposit/dispatch/return/inspection/charges/deposit apply or refund/availability/audit/preview/report) remains **blocked** until that fixture exists and a dedicated rental batch is bound. | Fixture owner: Platform Control Room plan/modules on an isolated company. Coding does not force grants. |
| Ordinary customer cash refund UI | Ordinary sales-return tender implemented. Not live-accepted. | QA: credit-only vs cash/bank/card; original receipt preserved; cumulative qty/value; revenue 4000 denied; Viewer/module/tenant denial. |
| Logout / View / Print | Investigated. No confirmed product defect/fix. Cookie HttpOnly expire is hardening only. | Preserve original observations. Repro on the new stamp before claiming a defect. Do not physically print. |

## Grouped regression proposal (after candidate review)

Bind a **new** run-owned fixture and clock. Do not replay Rapid02 consumed events.

1. Physical cash purchase (example 4×60=240) → partial return 60 → remaining 180. Assert return documents `refunded` / paid=total / balance 0; cash Dr matches refunds; inventory Cr; source remaining 0; original purchase `paid` unchanged; no second cash journal per refund; AP GL/aging unchanged.
2. Manual-service cash purchase 80 → 40 + 40. Same settlement-state assertions; expense reversal; no stock.
3. Ordinary credit-bill allowance 40: paid 40 / balance 0; AP reversed; not `refunded` unless it was a cash refund.
4. Customer two-source balances 80/80: invalid 81+80 keeps Record payment disabled, field errors, zero persistence; valid 30/20 posts; remaining 50/60 posts; original receipts unchanged on invalid attempt.
5. Vendor two-source same pattern (541 vs 540 adjacency).
6. Ordinary sales return: credit-only vs cash 1000 vs bank 1100 vs card 1200 vs revenue 4000 denial; original receipt identity; credit paid/refunded as appropriate; AR/cash; cumulative qty/value.
7. `/journal/audit` shows actor, action, source, event for the new posts; cashier/foreign-tenant denied; Team access history still team-only.
8. Product create: Starter/inventory-off Owner sees module-ceiling view-only copy; isolated Pro/inventory+rental-on Owner can create a rental product. Do not treat a rental SKU as lifecycle acceptance.
9. Receipts, remittances, print preview (no physical print), retry/idempotency, role/tenant/race/atomicity with honest layer labels.
10. Preserve BUG-0039/0040, Rapid02 first failures, and all historical fixtures.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them: existing `input` / `form-error` / `Button` / `Card` / `table` / Journal page. Allocation field is a thin shared wrapper. Activity reuses Team access-history table pattern. No second design system.
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: QA `c8b86bd61a88c2170d85f333addb610bbb31c07a`. Last known UX JSON SHA256 `383d18ad74978af67e9e75d855c77c87b45a92beb00c101a3338dd0abd01e57f`. UXW-002, UXW-018/021.
- Before/after behaviour; independent expected/unchanged example: cash purchase return 60 is refunded/paid 60/balance 0. Entering 81 against 80 shows Payment cannot exceed balance due and does not post. Unchanged: Rapid02 live rows, ordinary AP credit 40, valid 30/20.
- Direct screens and transitive shared consumers: Receive Payments, Pay Vendors, sales/purchase return new, Journal, Activity, product create/edit, Logout. Shared `getDocumentFormOptions` liquid list now includes custom 11xx/12xx banks.
- Preserved field/line/source identity, money/stock/history/print and server permissions: no extra cash posting; original payments kept; server over-balance and tender guards kept; inventory write ceiling kept; no BYPASSRLS.
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: not run in this engineering session. Field errors use `aria-invalid` and `role="alert"`. Independent QA owns rendered keyboard/AT evidence.
- Exact and adjacent regressions: listed above. Missing: live browser, restricted-DB HTTP, rental lifecycle, physical print, backup/restore.
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: UXQ-001–004 unresolved. Rental lifecycle explicitly unqualified. Historical Rapid02 refund rows unrepaired. No launch-readiness claim.
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert this commit; no schema. Do not rewrite Rapid02 rows on revert or merge.
- QA companion change/run and independent review link (or pending): Rapid02 PR 89 results. Independent NEW regression queue pending Medium review.

## Checks executed

- Accounting vitest: 13 files, 182 passed.
- Auth vitest: 10 files, 90 passed.
- Statement-import vitest: 4 files, 34 passed.
- Not run: live browser, restricted-DB HTTP, full turbo lint/build/test, rental lifecycle, physical print, backup/restore.
