# CHG-20261104-rapid04-followup — hire charge source status, after-return continuity, hire bays, Activity (v2.5.25)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-11-04.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.5.25 on review branch `fix/v2525-rapid04-followup` after live v2.5.24 `e5bb589267035ffb031b6c083f4e911bb7d04aac`. Final SHA is in PR metadata. Reviewable source candidate. Do not merge or deploy as part of this follow-up.
- QA repository revision and companion PR/change ID: Fixture qualification [PR 93](https://github.com/Dinu-Sri/bookone-qa/pull/93) `1781dba56d2f9315d71a8ea23cc226feabf4b117`. Companion branch `qa/rapid04-followup`. Rapid03 `eed69cf` and Rapid04 first D-112 CI failure (run 41000512103) remain immutable.
- Intended before/after behaviour with a concrete example:
  - **D-112 charge source status:** Agreed damage 200 with Apply deposit links the hire order via `sourceDocumentId` and leaves the order status unchanged (not `converted`, not `fully_invoiced`). Ledger Dr 1000 1000 / Cr 2400 800 / Cr 4450 200.
  - **After-return hire invoice:** Invoice 500 copied from a returned order does not create a second reserved booking and does not void the original hire event (deposit 1000 stays on the order). Quote → order still cancels holds and reserves on the order.
  - **Hire bays:** Company → Locations Type includes On rent / Wash / Repair when Rental is on. Rental Settings has **Create missing hire bays**. Server refuses fleet types when Rental is off. No SQL/hidden values.
  - **Activity:** `/journal/audit` reads `rental_booking_lines`, `rental_events` and `inventory_stock_levels`. Wash-release audit `recordId` is the stock-level (or bay location) id, not the product id.
- Existing behaviour that must remain correct: Rapid03 supplier/customer refunds and AR/AP. Ordinary dirty return still posts no 4450. Viewer dispatch/return/collect/refund/charge still persist nothing. Charge invoices still skip `converted`. Quote → order still one reservation lineage. Original QA Inventory-off ceiling unchanged. Historical Rapid02/03 rows untouched.
- Actual changed paths/symbols/routes:
  - `shouldSkipHireSourceConversion` / `rentalInvoiceIsBillingOnly` in `packages/accounting/src/rental-guards.ts`.
  - `createCommercialDocument` skips `salesInvoiceSources` + `fully_invoiced` when the hire-charge skip flag is set.
  - `persistRentalBookings` billing-only for invoices against reserved/dispatched/returned/deposited sources; never voids an event with `depositHeld`.
  - `FINANCIAL_AUDIT_TABLES` plus compact labels; `releaseFleetBay` audit `recordId`.
  - Location Type options, `isAllowedLocationType`, `ensureFleetBays` / `HireBaySetupForm`.
- Business rule/profile/scenario IDs: BR-REN-01@1, BR-REN-02@1, BR-REN-03@1, BR-REN-04@1, BR-SEC-01@1, BR-SEC-02@1. Rapid04 PLAN-RAPID04 G/R/N/RT/C specification IDs (operator queue remains `executionReady=false`). Rulebook 1.0.0 as published on QA `f256d23`.
- Accounting, stock/rental, tenant/access and customer-data effects: no new GL accounts. Hire invoice 500 remains Dr 1300 Cr 4400. Charge 200 remains Dr 1300 Cr 4450 then apply Dr 2400 Cr 1300. Dispatch/return remain location transfers. Fleet types are not pickable on sales/purchase documents. No BYPASSRLS. AUTH-20261030 stays request, not grant, in docs. Existing A/B accounts are not recreated here.
- Migrations, schema/history compatibility and recovery implications: **none**. Additive behaviour only. Code rollback is not data rollback.
- Dependencies, settings/flags, deployment and external-service changes: none. Quote `v2.5.25 · <sha7>` after a later authorized deploy. No merge/deploy in this request.
- Independent diff/impact review and uncertainties: EventHireFields still default On confirm. Missing/loss still uses consume-at-location (5150 path unchanged). Signup still does not seed fleet bays; Owner creates them through Locations or Create missing hire bays. RF04/RF09 expert hire recognition remain open. Backup last. BookOne is not customer-ready.
- Checks executed: recorded after local vitest in TASK_LOG / PR. Isolated `bookone_qa_runtime` and live browser not-run in this engineering session unless listed.
- Failed/skipped/flaky/blocked/not-run checks and reasons: live Rapid04 Light queue stays unbound. Isolated runtime requires empty loopback PG16. Archive/recovery LAST. Windows workflow-governance 3221226505 remains a host crash, separate from Linux pin alignment.
- New QA assertions or outstanding work: preserve first D-112 CI failure; full-sequence six-journal regression; Activity Owner/Viewer/foreign; fleet-bay create/deny; pin archive catalog/plan to this candidate; HTTP rental GET/write codec; operator 40-point remains `executionReady=false`.
- Created staging records/cleanup, if any: none.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS.
- Next exact action and responsible role: Medium reviews this exact diff and the QA companion, then binds a NEW dated Light mission only after this review gate. Owner may later authorize merge/deploy. Do not merge or deploy in this request.

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references: native `select.input`, `Button`, `party-form-shell`, `company-inline-form` on Locations and Rental Settings. No second design system.
- Exact external QA commit and ux/workbook.json: Rapid04 fixture PR93 `1781dba56d2f9315d71a8ea23cc226feabf4b117`. UXW-002 outcome feedback.
- Before/after: Type offers On rent / Wash / Repair when Rental is on; Create missing hire bays posts those three through `company.locations.write` + rental module. Unchanged: operational types, Rapid03 money, original QA Inventory-off.
- Direct screens: `/company/locations`, `/company/rental`, `/journal/audit`, `/inventory/on-rent`. Shared consumers: location Type select, rental settings shells, Activity table.
- Preserved field/line/source identity: hire order status is not rewritten by a charge invoice; original hire event/deposit stay on the order through after-return billing.
- Desktop/narrow/keyboard/reader evidence: not run in this engineering session. Type select and Create missing hire bays use existing labels/buttons.
- Exact and adjacent regressions: D-112 source status; quote→order transfer; still-dispatched invoice; Viewer dispatch denial; dirty return no income.
- Conflict/exception: UXQ-001–004 unresolved. Fleet 20@50 opening on company A remains unprepared until qualified on the reviewed candidate. No launch-readiness claim.
- Small rollout: revert this commit; no schema.
- QA companion: `qa/rapid04-followup`; Medium binds Light after review.
