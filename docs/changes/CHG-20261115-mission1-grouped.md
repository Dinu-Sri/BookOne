# CHG-20261115-mission1-grouped — POS register write auth, payment validation, purchase VAT preview, VAT memo/labels, VAT summary (v2.5.29)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-11-15.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.5.29 on `fix/v2529-mission1-grouped` from origin/master `48e44072f43d8d26338d793c6692767e8b7d2082` / tree `06cb8f5c967ff3edab6361123ddc029778f087b0` (v2.5.28). Owner asked this candidate to be pushed to master for the Docker web image Action.
- QA repository revision and companion PR/change ID: Mission1 frozen QA `24534f7b95901dba29ef933fa3c3d5045c107d05`. Independent Medium review then Mission2 affected regression. Do not replay CONT11 or earlier funding/payment/sale/refund/shift queues. Original POS 118 refund stays closed.
- Intended before/after behaviour with a concrete example:
  - Viewer on `/company/sales` no longer sees Save VAT settings, register Save/Archive, or Add register. Direct `savePosRegisterFromForm` / `archivePosRegisterFromForm` throw `assertPermission('company.sales_settings.write')` before any write. `listPosRegisters` no longer inserts REG-01. Simple Entry omits Record; invoice Archive is omitted without `canWrite`.
  - Receive Payments / Pay Vendors: selected `-1` + `141.60` no longer previews 140.60 and submits 141.60. Invalid selected rows get field errors; preview total and payload come from one validated batch; submit stays disabled until every selected row is a positive two-decimal amount within the remaining cap.
  - Unsaved claimed purchase 2×60 shows subtotal 120, input VAT 21.60, payable gross 141.60. PO/GRN keep informational VAT (bill total after convert) without posting.
  - Output VAT memo is `Output VAT 18%` rather than `18.000000000000004%`. Money is unchanged.
  - Converted QT/SO with intended tax invoice show document type + “Intended tax invoice — VAT posts when invoiced”. They do not reuse the quote/order number as a tax invoice number.
  - Reports gains a VAT summary tab from posted 2200/2300 journals (input, output, returns, net payable, CSV). It is a bookkeeping summary, not a statutory return.
- Existing behaviour that must remain correct: tenant/location predicates; last-active-register protection; VAT-settings write guard; payment idempotency and over-cap refusal; posted purchase 600+108=708; POS linked-return 118 preview (v2.5.28); commercial/non-VAT nets; original V/N/A/B money, Walk-in, dates, closed shifts.
- Actual changed paths/symbols/routes:
  - `apps/web/src/app/actions/pos-registers.ts` — `assertPermission` on save/archive; list is read-only.
  - `apps/web/src/app/company/sales/page.tsx`, Simple Entry, commercial document detail pages — `jobCanWrite`.
  - `parsePaymentAmountStrict` / `validatePaymentAllocationBatch` in `document-guards.ts`; Receive Payments / Pay Vendors / `documents.ts` two-decimal schema.
  - `purchasePreviewTotals` + `CommercialDocNewForm` footer; `formatVatPercent` on posting memos; `salesDocumentPresentation`; Reports VAT tab via `composeVatSummary`.
- Business rule/profile/scenario IDs: Mission1 grouped P1 register write; P2 payment validation + purchase VAT preview; P3 VAT memo + document labels; VAT report capability.
- Accounting, stock/rental, tenant/access and customer-data effects: no historical journal rewrite; no BYPASSRLS; no live Viewer mutation; no replay of settled payments or the POS 118 refund. VAT summary reads existing 2200/2300 activity.
- Migrations, schema/history compatibility and recovery implications: **none**.
- Dependencies, settings/flags, deployment and external-service changes: none. Quote `v2.5.29 · <sha7>` after Docker web image is green and Portainer Update with Re-pull ON.
- Independent diff/impact review and uncertainties: isolated PostgreSQL/HTTPS of the live server actions was not-run here (no local Docker engine in this session). Source + unit tests cover the permission strings, strict payment matrix, purchase preview, memo format, labels, and VAT summary math. Cross-tenant register IDs still fail via existing tenant predicates.
- Checks executed: `pnpm --filter @bookone/accounting test` — 18 files / 237 passed. Auth vitest via accounting vitest binary — 11 files / 97 passed (pos-register-write-auth 6). `pnpm --filter @bookone/statement-import test` — 4 files / 34 passed. `pnpm --filter @bookone/accounting typecheck` passed. Isolated runtime and live browser not-run.
- Failed/skipped/flaky/blocked/not-run checks and reasons: live browser, isolated `bookone_qa_runtime` PostgreSQL/HTTPS with real RLS roles, mixed-TENDER split, backup/restore LAST.
- New QA assertions or outstanding work: Mission2 retests deployed affected paths (Viewer register/VAT settings, payment invalid-row matrix on fresh open AR/AP, unsaved purchase VAT footer, VAT memo on a new journal, QT/SO labels, Reports VAT tab). Do not reopen the original POS 118 refund.
- Created staging records/cleanup, if any: none.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, ACCESS_CONTROL_DESIGN register permission row.
- Next exact action and responsible role: Owner deploys via Docker web image then Portainer Re-pull ON. Independent Medium review of this candidate. Recovery LAST. BookOne is not customer-ready.

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references: company sales `party-form-shell`, Simple Entry submit bar, commercial document totals (`doc-totals-row`), Reports tabs, native field errors on allocation amounts. No second design system.
- Exact external QA commit and ux/workbook.json: Mission1 frozen `24534f7`. UXW-002 truthful totals/outcome.
- Before/after: Viewer cannot submit register/VAT writes; payment preview equals submit batch; claimed purchase footer shows VAT 21.60 / 141.60; QT/SO tax treatment is informational; Reports VAT tab lists 2200/2300 correspondence.
- Direct screens: `/company/sales`, `/`, `/sales/invoices/[id]`, `/sales/payments/new`, `/purchase/payments/new`, purchase new, `/reports?report=vat`, quotation/order detail.
- Preserved field/line/source identity: payment allocations still keyed by document id; purchase lines unchanged; posted bills stay 708.
- Desktop/narrow/keyboard/reader evidence: not run in this engineering session. Allocation field errors remain `role="alert"`.
- Exact and adjacent regressions: Owner sales-settings write; last-active register; over-cap payment; commercial purchase net; POS linked-return 118; sales-vat conversion profile.
- Conflict/exception: VAT summary is bookkeeping-only. Synthetic 18% does not certify legal filing.
- Small rollout: revert this commit; no schema.
- QA companion: Mission2 after owner deploy.
