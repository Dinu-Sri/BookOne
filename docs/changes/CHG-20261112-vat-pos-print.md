# CHG-20261112-vat-pos-print — VAT conversion profile and manual POS print (v2.5.26)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-11-12.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.5.26 on `fix/v2526-vat-pos-print` from origin/master `a6eda602bc67f20eb86736cbeceabc9cdd841769` (v2.5.25). Owner authorized push to master for the Docker web image Action.
- QA repository revision and companion PR/change ID: Combined qualification execution `42d9671660edc1eecdbf17a68d76e03139c4ffc8`; published closure `be4302965e4dfe2d9fb10035fb0be5450f2d7c05`. This is proposed product work for that grouped candidate. Old 11 Nov queues remain closed.
- Intended before/after behaviour with a concrete example:
  - **VAT conversion:** Eligible VAT company quote 1 × 1000, intended TAX / local. Quote total stays **1000** (informational; no GL, no tax invoice number). Convert to order copies TAX/local, total **1000**. Convert to invoice (retained or selected TAX) posts **VAT 180**, total **1180**, tax invoice number, Dr 1300 1180 / Cr 4000 1000 / Cr 2200 180. Commercial convert of the same lines stays **1000**, no 2200. Non-VAT companies keep hidden commercial/local. Explicit tax invoice without VAT registration is refused with `INELIGIBLE_TAX_INVOICE_MESSAGE` and zero posting. Linked returns inherit the source tax profile and reverse the source `vatRate`.
  - **POS print:** Register print mode `manual` is preview-only. Sale, refund, and Z-close do not open `?autoprint=1`, write thermal/Web Serial, or kick the drawer. Last receipt and Last Z-report open preview pages without autoprint. `browser` / `thermal` / `both` keep their previous automatic effects. Default remains `browser`. Existing registers are not rewritten.
- Existing behaviour that must remain correct: ordinary non-VAT commercial quotes/orders/invoices; purchase conversion; Rapid02/03/04 money; original QA Inventory-off ceiling; mixed-TENDER split is still not accepted as pass coverage (mixed **product** basket is in scope).
- Actual changed paths/symbols/routes:
  - `resolveSalesTaxProfile` / `salesDocumentPostsOutputVat` / `ineligibleTaxInvoice` / `expectedInvoiceVat` in `packages/accounting/src/engine/sales-vat.ts`.
  - `posPrintEffects` / `manual` mode in `packages/accounting/src/pos-print.ts`.
  - `convertDocument` copies source `invoiceKind`/`saleChannel` (override on invoice conversion). `createCommercialDocument` persists intended kind on quotes/orders; posts output VAT only on tax_invoice sales_invoice/pos_sale/sales_return.
  - Quote/order/return forms, invoice VAT preview, quotation/order lists Kind column, detail convert selects when VAT-registered.
  - POS register schema comment, Company → Sales register select/save, `pos-terminal` finishPrint and Z-close.
- Business rule/profile/scenario IDs: CQ-11 (VAT conversion), CQ-14 (POS print off/manual). Combined qualification 15 passed / 4 blocked / 3 inconclusive on 11 Nov remains closed.
- Accounting, stock/rental, tenant/access and customer-data effects: output VAT (2200) posts only when the posted document is a tax invoice for a VAT-registered company. Linked returns still reverse stored source `vatRate` so historical commercial-with-VAT credits stay correct. No BYPASSRLS. No live fixture grants. No new GL accounts.
- Migrations, schema/history compatibility and recovery implications: **none**. `pos_registers.print_mode` is already `varchar(20)` default `browser`. No data rewrite. Code rollback is not data rollback.
- Dependencies, settings/flags, deployment and external-service changes: none. Quote `v2.5.26 · <sha7>` after Docker web image is green and Portainer Update with Re-pull ON.
- Independent diff/impact review and uncertainties: invoice form previously showed ex-VAT only; tax invoices now preview VAT before post. POS commercial sales on a VAT company previously posted company VAT while the terminal showed a net total; they now match (VAT only on TAX INVOICE). Mixed-TENDER split unchanged. Payment receipt investigation: supported route is `/sales/payments/receipt?payment=<paymentTransactionId>` (and remittance `?payment=`). `loadPaymentPrintFacts` reads `transactions` of type payment; audit allocation UUID is `settlement_allocations.id` and is not a payment id. No navigation/contract defect found; no receipt-route change.
- Checks executed: `pnpm --filter @bookone/accounting test` — 15 files / 196 passed (includes sales-vat conversion profile and pos-print manual mode). `pnpm --filter @bookone/accounting typecheck` passed. Isolated runtime and live browser not-run.
- Failed/skipped/flaky/blocked/not-run checks and reasons: live browser, isolated `bookone_qa_runtime`, fixture grants, mixed-TENDER split, backup/restore LAST. AUTH-20261030 stays request, not grant, in docs.
- New QA assertions or outstanding work: qualify VAT quote→order→invoice and return on a **new** VAT+Inventory fixture (do not reuse completed A / foreign B). Qualify manual POS print on a register explicitly set to manual. Full amount/cent payment feedback remains a QA gap on newly owned unpaid sources.
- Created staging records/cleanup, if any: none.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, POS_DESIGN.
- Next exact action and responsible role: Owner deploys via Docker web image then Portainer Re-pull ON. QA qualifies fixtures/live build and releases a NEW dated successor. Backup/recovery LAST. BookOne is not customer-ready.

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references: native `select.input`, `Button`, `doc-form-header`, `doc-totals`, POS `pos-link-btn` / `pos-hw-status`. No second design system.
- Exact external QA commit and ux/workbook.json: combined qualification `42d9671` / closure `be43029`. UXW-002 outcome feedback.
- Before/after: VAT-registered quote/order show Sale channel and Intended invoice kind; convert-to-invoice on the order detail shows the same selects defaulting from the source. POS print mode includes Manual / preview only. Unchanged: non-VAT hidden commercial/local; browser/thermal/both autoprint.
- Direct screens: `/sales/quotations/new`, `/sales/quotations/:id`, `/sales/quotations/:id/edit`, `/sales/orders/new`, `/sales/orders/:id`, `/sales/invoices/new`, `/sales/returns/new`, `/company/sales` POS registers, `/pos`. Shared consumers: `convertDocumentAction`, `createCommercialDocument`, POS terminal, register save.
- Preserved field/line/source identity: conversion copies source lines/prices/discounts/brand/location; tax profile is an additional retained field. Returns inherit source party and tax profile.
- Desktop/narrow/keyboard/reader evidence: not run in this engineering session. Selects and Last receipt / Last Z-report use existing controls.
- Exact and adjacent regressions: non-VAT commercial convert; POS browser autoprint; thermal+drawer on cash; Z autoprint for auto modes; payment receipt `?payment=` transaction ids.
- Conflict/exception: mixed-TENDER split remains outside accepted scope. Fixture work is a separate QA setup mission.
- Small rollout: revert this commit; no schema.
- QA companion: combined 11 Nov queues stay closed; new dated qualification after deploy.
