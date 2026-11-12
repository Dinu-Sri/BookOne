# CHG-20261112-purchase-vat-conversion — supported input VAT at PO/GRN-to-bill conversion (v2.5.27)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-11-12.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.5.27 on `fix/v2527-purchase-vat-conversion` from origin/master `e741a6a9b68969bfc58be70fb8459de479da2cdd` (v2.5.26). **Do not merge or deploy**; owner personally handles deployment.
- QA repository revision and companion PR/change ID: Product coding for the missing purchase-input-VAT choice found in source qualification. QA PR104 aligns stale tax fixtures to the already reviewed v2.5.26 contract; do not reintroduce old expected-commercial-VAT policy. Combined 11 Nov queues stay closed. No financial smoke, no history repair, no V/N fixture recreation.
- Intended before/after behaviour with a concrete example:
  - VAT-registered company, 10 units × 60, GRNI off. New PO can **Claim input VAT**; PO total stays **600**, no GL. Convert to GRN copies the claim; GRN stocks 10 units, no GL, no input VAT. Convert GRN (or PO) to bill with Claim posts **inventory 600 / input VAT 108 / AP 708** once, no second stock receipt. Explicit **No input VAT** on the bill stays **AP 600**. Linked supplier return of 2 units before payment reverses **inventory 120 / input VAT 21.60 / AP 141.60**; remaining AP **566.40**. Non-VAT companies keep hidden commercial; an explicit claim is refused with `INELIGIBLE_INPUT_VAT_MESSAGE` and zero posting.
  - Purchase conversion forms expose the same Claim / No input VAT selector, defaulting from the source, with a legitimate override on the bill.
- Existing behaviour that must remain correct: ordinary commercial/no-input purchase path net 600 / AP 600; output-sales commercial 0 VAT / TAX 18%; manual POS print; supplier invoice uniqueness; remaining quantities; approval/GRNI; source links; stored-rate returns; Rapid02/03/04 money; original QA Inventory-off ceiling. Mixed-TENDER split is still not accepted as pass coverage.
- Actual changed paths/symbols/routes:
  - `purchaseDocumentPostsInputVat` / `ineligibleInputVat` / `expectedPurchaseVat` / `INELIGIBLE_INPUT_VAT_MESSAGE` in `packages/accounting/src/engine/purchase-vat.ts`.
  - `createCommercialDocument` posts input VAT only on purchase/cash/return tax_invoice documents; PO and GRN persist intended `invoiceKind` with zero VAT. `convertDocument` copies source profile and refuses ineligible purchase claims with the input-VAT message. Purchase returns prefer the source tax profile and still reverse stored `vatRate`.
  - PO/GRN new forms, PO convert form, GRN-to-bill convert, purchase lists Kind column, detail Input VAT display. Language is **Claim input VAT** / **No input VAT**, not tax-invoice numbering.
- Business rule/profile/scenario IDs: purchase conversion input VAT (source qualification of the PO→GRN→bill journey). Output VAT conversion remains the v2.5.26 contract.
- Accounting, stock/rental, tenant/access and customer-data effects: input VAT (2300) posts only when a posting purchase document is claimed for a VAT-registered company. PO/GRN never post 2300. Linked returns reverse stored source `vatRate`. No BYPASSRLS. No live fixture grants. No new GL accounts. Existing financial records are not rewritten.
- Migrations, schema/history compatibility and recovery implications: **none**. `invoice_kind` already exists. No data rewrite. Code rollback is not data rollback.
- Dependencies, settings/flags, deployment and external-service changes: none. Quote `v2.5.27 · <sha7>` only after owner deploys via Docker web image then Portainer Update with Re-pull ON.
- Independent diff/impact review and uncertainties: conversion UI was the missing operator path; backend already posted input VAT on bills when `invoiceKind=tax_invoice`. Direct purchase and cash-purchase new pages already had the selector. List convert still copies source `invoiceKind` (override remains on the detail convert form). Isolated runtime / live browser / QA 136 / 30 HTTPS / fullcheck are not-run in this engineering session.
- Checks executed: `pnpm --filter @bookone/accounting test` — 16 files / 210 passed (includes purchase-vat PO→GRN→bill 708/108, commercial 600, return 21.60/566.40, ineligible zero, stored-rate, duplicate qty, and sales-vat/POS regressions). `pnpm --filter @bookone/accounting typecheck` passed. Isolated runtime and live browser not-run.
- Failed/skipped/flaky/blocked/not-run checks and reasons: live browser, isolated `bookone_qa_runtime`, QA 136 runtime, 30 real HTTPS, fullcheck, fixture grants, mixed-TENDER split, backup/restore LAST. AUTH-20261030 stays request, not grant, in docs.
- New QA assertions or outstanding work: qualify PO→GRN→bill Claim 708/108, direct PO→bill, explicit no-input 600, nonVAT refusal, return 2/21.60 remaining AP 566.40, stored-rate after settings change, duplicate conversion denied. Keep sales commercial 0 / TAX 18% and manual POS. Medium reviews then verifies owner-deployed candidate and prepares the executable combined 80-point Light batch.
- Created staging records/cleanup, if any: none.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS.
- Next exact action and responsible role: Medium reviews this exact diff. Owner deploys personally. Do not merge or deploy in this request. Backup/recovery LAST. BookOne is not customer-ready.

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references: native `select.input`, `Button`, `field` / `doc-totals`, shared `CommercialDocumentDetail` / `CommercialDocumentList` / `CommercialDocNewForm`. No second design system. `PurchaseVatFields` reuses the purchase new-form Claim/No input VAT copy.
- Exact external QA commit and ux/workbook.json: combined qualification `42d9671` / closure `be43029` remain closed parent evidence. UXW-002 outcome feedback. Applicable UX refs: UXW-002 (truthful totals/outcome).
- Before/after: VAT-registered PO/GRN show Input VAT Claim/No; convert-to-bill shows the same select defaulting from the source. Unchanged: non-VAT hidden commercial; direct purchase/cash Claim selector; sales TAX INVOICE numbering.
- Direct screens: `/purchase/orders/new`, `/purchase/orders/:id`, `/purchase/orders`, `/purchase/receipts/new`, `/purchase/receipts/:id`, `/purchase/receipts`, `/purchase/purchases`, `/purchase/purchases/:id`. Shared consumers: `convertDocumentAction`, `createCommercialDocument`, `CommercialDocumentDetail` (also used by sales convert-to-invoice).
- Preserved field/line/source identity: conversion copies source lines/prices/discounts/brand/location/supplier-invoice uniqueness; tax profile is an additional retained field with bill override. Returns inherit source party and stored `vatRate`.
- Desktop/narrow/keyboard/reader evidence: not run in this engineering session. Native selects and existing controls.
- Exact and adjacent regressions: commercial/no-input purchase 600; sales quote→order→invoice TAX 18%; POS manual print; GRNI on/off; remaining qty overrun; duplicate conversion.
- Conflict/exception: mixed-TENDER split remains outside accepted scope. Fixture work is a separate QA setup mission. Do not recreate V/N accounts or alter A/B/original.
- Small rollout: revert this commit; no schema.
- QA companion: new dated qualification after owner deploy; 11 Nov queues stay closed.
