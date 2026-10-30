# CHG-20261030-rapid04-rental-security — rental dispatch permission, agreed charges, cash tender, charge source-link (v2.5.24)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-10-30.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.5.24 on review branch `fix/v2524-rapid04-qualification` after v2.5.23 `b89dd788b9bec9dc66cb49d22f7b8c2c92015df7`. Final SHA is in PR metadata. Reviewable source candidate. Do not merge or deploy as part of Rapid04.
- QA repository revision and companion PR/change ID: Rapid04 qualification starts from published [PR 91](https://github.com/Dinu-Sri/bookone-qa/pull/91) `f256d2386786e2520d165fb860babca2e623b199`. Companion branch `qa/rapid04-coding-qualification`. Rapid03 results `eed69cf7f63d10d13aa872f43c82830241a26f43` remain immutable.
- Intended before/after behaviour with a concrete example:
  - **Dispatch/return/extend/wash-release permission:** Viewer (and any job without `rental.dispatch.write`) calling `dispatchRentalLine` / `returnRentalLine` / `extendRentalHire` / `releaseFleetBay` is refused with zero stock/journal/booking changes. Owner with Inventory+Rental on still dispatches reserved qty to On rent. Module-off Owner is refused by `assertModuleWrite('rental')`.
  - **Agreed charges only:** Record return of 8 good + 2 dirty moves stock only. Damage/late/extra amounts default to 0. **Invoice hire charges** posts 4450/4400 only when the operator types a non-zero agreed amount. Dirty wash does not create a charge. Extend hire changes dates only.
  - **Cash tender on deposits:** Collect deposit / Refund deposit use a Tender select (Cash 1000 / Bank 1100 / Card 1200), default Cash 1000. Server still requires an active liquid asset.
  - **Charge source link:** `invoiceHireCharges` stores `sourceDocumentId` on the charge invoice and **does not** mark the live hire order/invoice `converted`.
  - **Audit:** dispatch/return/extend/release write `audit_log` UPDATE rows on the booking/event/stock record with actor and notes.
- Existing behaviour that must remain correct: Rapid03 supplier/customer refunds and AR/AP feedback. Ordinary AP credits. Hire order still reserves without journals. Deposit Dr cash/bank Cr 2400. Hire invoice Dr 1300 Cr 4400. Receipt Dr 1000 Cr 1300. Apply deposit Dr 2400 Cr 1300. Refund Dr 2400 Cr cash. Dispatch is a stock transfer, no sale COGS. Over-return and over-refund still refuse. Historical Rapid02/Rapid03 rows untouched. Original QA company Inventory-off ceiling unchanged.
- Actual changed paths/symbols/routes:
  - `assertRentalDispatchWrite` / `writeRentalAudit` in `apps/web/src/app/actions/rental-bookings.ts` on dispatch, return, extend, release.
  - `createSchema.linkSourceWithoutConversion` and conversion skip in `commercial-docs.ts` (honored only for `sales_invoice`).
  - `invoiceHireCharges` passes `sourceDocumentId` + `linkSourceWithoutConversion`.
  - `RentalOpsPanel` tender select, Invoice hire charges, return no longer auto-invoices, late-fee default 0.
  - `/inventory/on-rent` lead copy.
  - `packages/auth/test/module-write-ceiling.test.ts` viewer dispatch write denial.
- Business rule/profile/scenario IDs: BR-REN-01@1, BR-REN-02@1, BR-REN-03@1, BR-REN-04@1, BR-SEC-01@1, BR-SEC-02@1. Rapid04 PLAN-RAPID04 G/R/N/RT/C specification IDs (not executed). Rulebook 1.0.0 as published on QA `f256d23`.
- Accounting, stock/rental, tenant/access and customer-data effects: no new GL accounts. Charge invoices remain Dr 1300 Cr 4450 (damage/late) or Cr 4400 (extra hire). Deposit apply unchanged. Dispatch/return remain location transfers. Missing qty still consumes on-rent stock (write-off path unchanged). Viewer/module-off writes persist nothing. No BYPASSRLS. No original-tenant grant change.
- Migrations, schema/history compatibility and recovery implications: **none**. Additive behaviour only. Code rollback is not data rollback.
- Dependencies, settings/flags, deployment and external-service changes: none. Quote `v2.5.24 · <sha7>` after a later authorized deploy. No merge/deploy in this request.
- Independent diff/impact review and uncertainties: original company Inventory-off is a ceiling, not a defect. Staging Pro+rental company A and foreign B require owner Control Room authorization (separate AUTH record). Runtime rental tests remain Owner-DB synthetic-session except new Viewer dispatch denial through real permission loading. HTTP rental action-codec positives need a rental-capable HTTP seed; GET denials are specified. Windows workflow-governance crash is a QA host issue. RF04/RF09 expert hire recognition remain open; this candidate uses configured after-return invoice timing when the company enables it. Backup last. BookOne is not customer-ready.
- Checks executed: workspace vitest `packages/auth` + `packages/accounting` + `packages/statement-import`: 27 files / 307 passed, including `module-write-ceiling` Viewer `rental.dispatch.write` denial. No Rapid03 replay. No live browser stamp. No staging grant. Isolated `bookone_qa_runtime` lanes not executed in this engineering session.
- Failed/skipped/flaky/blocked/not-run checks and reasons: live browser Rapid04 queue is not executable. Isolated `bookone_qa_runtime` rental-lifecycle/postgres-rls/commercial-deep/role-scope recorded separately in QA. Full `pnpm check` on Windows may still fail workflow-governance process 3221226505. Archive/recovery LAST.
- New QA assertions or outstanding work: Rapid04 operator plan is `executionReady=false` until Medium binds date/candidate/fixture. Viewer dispatch denial; dirty return no 4450; charge invoice source link without converting hire. HTTP rental write denials remain to be seeded. Staging fixture AUTH pending owner.
- Created staging records/cleanup, if any: none.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS.
- Next exact action and responsible role: Medium reviews this exact diff and the QA companion, binds a NEW Rapid04 Light mission after fixture AUTH and live stamp. Owner may later authorize merge/deploy. Do not merge or deploy in this request.

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.

## Supported rental contract (actual UI)

| Step | Route | Control label | Server | Independent oracle |
|---|---|---|---|---|
| Product (rental type) | `/inventory/products/new` | Product type **Rental (hire fleet — comes back)**; Save | `inventory.products.write` + inventory module | Fleet 20 @ 50 = 1000 at warehouse |
| Settings | `/company/rental` | Hire units, invoice timing (on confirm / dispatch / after return / manual), overlap, turnaround hours, default late fee | `company.rental_settings.write` | After-return enabled; late fee default is **not** an agreed charge |
| Quote 10 @ 50 | `/sales/quotations/new` | Hire from/to, invoice timing, Post | `sales.quotations.write`; `persistRentalBookings` status `hold` | No journal, no fleet move |
| Convert order | quotation → `/sales/orders` | Post | `sales.orders.write`; source bookings cancelled after new reserved lines | One reservation lineage |
| Calendar | `/inventory/calendar` | Calendar bars | `rental.calendar.read` | Reserved 10 of 20 |
| Collect deposit 1000 | `/inventory/on-rent` | Tender **Cash 1000**, Amount, **Collect deposit** | `collectRentalDeposit` `rental.dispatch.write` | Dr 1000 Cr 2400 |
| Dispatch 10 | `/inventory/on-rent` | **Dispatch** | `dispatchRentalLine` | Warehouse→on-rent transfer; owned 20 / value 1000; no COGS |
| Return 8 good + 2 dirty | `/inventory/on-rent` | Good, Dirty (wash), **Record return** | `returnRentalLine` | Warehouse 18 / wash 2 / on-rent 0; no 4450 |
| Wash release 2 | `/inventory/on-rent` Wash / repair | **Mark ready** (existing bay button) | `releaseFleetBay` | Warehouse 20 / wash 0 |
| Hire invoice 500 | `/sales/invoices/new` from order | Post, after-return timing | `createCommercialDocument` + `assertHireInvoiceTiming` | Dr 1300 Cr 4400 |
| Receipt 500 | `/sales/payments/new` | Record payment | existing payments | Dr 1000 Cr 1300 |
| Charge 200 | `/inventory/on-rent` | Agreed damage, **Invoice hire charges**, optional Apply deposit | `invoiceHireCharges` | Dr 1300 Cr 4450; then Dr 2400 Cr 1300 if apply |
| Refund 800 | `/inventory/on-rent` | Tender Cash 1000, **Refund deposit** | `refundRentalDeposit` | Dr 2400 Cr 1000 |
| Activity | `/journal/audit` | Activity table | `accounting.journal.read` | Actor/action/source/event; gaps remain explicit if a writer is missing |

Packing list: `/inventory/on-rent/[documentId]/packing`. Open doc links quotation/order/invoice.

## Gaps still unsupported or fixture-owned

- Staging isolated company A (Pro + inventory + rental) and foreign B: Control Room plan/modules. Signup creates Starter (inventory/rental off). AUTH record is separate; no grant in this change.
- Bank 1100 / card 1200 funded positives: fixture cashing, not a product defect.
- Period lock, overlap concurrency, journal-insert rollback: existing isolated runtime cases; not live staging.
- Expert RF04/RF09 hire recognition: after-return example only.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references: `Button` / `Card` / `input` / `party-check` on `RentalOpsPanel`. No second design system.
- Exact external QA commit and ux/workbook.json: Rapid04 base `f256d2386786e2520d165fb860babca2e623b199`. UXW-002 outcome feedback.
- Before/after: return 8+2 dirty posts no 4450; Invoice hire charges 200 with Apply deposit posts 4450 then 2400→1300. Unchanged: Rapid03 money, original QA Inventory-off.
- Direct screens: Dispatch / returns, Wash / repair, Rental Settings, quotation/order/invoice, Activity.
- Preserved field/line/source identity: hire order is not converted by a charge invoice. Deposit receipts keep original tender/account when the operator selected it.
- Desktop/narrow/keyboard/reader evidence: not run in this engineering session. Tender select and charge fields have `aria-label`.
- Exact and adjacent regressions: Viewer dispatch denial; dirty return no income; charge source link; Rapid03 refunds untouched.
- Conflict/exception: UXQ-001–004 unresolved. Rental live fixture AUTH pending. No launch-readiness claim.
- Small rollout: revert this commit; no schema.
- QA companion: Rapid04 coding branch; Medium binds Light after review.
