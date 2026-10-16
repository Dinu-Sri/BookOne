# CHG-20261016-broad-workflow-findings — purchase remaining, discounts, payment print, as-of aging (v2.5.12)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-10-16.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.5.12 on `master` after `0bcdf4d` (v2.5.11).
- QA repository revision and companion PR/change ID: [HANDOFF-20261016-broad-workflows](https://github.com/Dinu-Sri/bookone-qa/blob/qa/broad-workflows-20261016/handoffs/HANDOFF-20261016-broad-workflows.md); [RUN-20261016-broad-workflows](https://github.com/Dinu-Sri/bookone-qa/blob/qa/broad-workflows-20261016/runs/RUN-20261016-broad-workflows.md); [CHECKS-20261016-broad-workflows](https://github.com/Dinu-Sri/bookone-qa/blob/qa/broad-workflows-20261016/runs/CHECKS-20261016-broad-workflows.json). Companion QA remains draft PR #35; no QA merge/deploy by this change. Bugs 0056–0063 plus BUG-0037 quotation-draft extension.
- Intended before/after behaviour with a concrete example:
  - BUG-0056 / P08: PO ordered 10; GRN 4 then a second GRN of 7 is rejected (remaining receive 6). After GRN 4 is converted to a bill, PO remaining is billed 4 / remaining 6 (bills whose source is the GRN count against the PO).
  - BUG-0059 / RET02: first full purchase return of a 4×60=240 bill posts; a second full return of the same bill is rejected for remaining quantity/value.
  - BUG-0060 / VAL01: a new line defaults to percent. 3 × 100 with 10% line discount and 5% header is 256.50 (line net 270, header 13.50).
  - BUG-0058 / PAY02: remittance/receipt print from persisted payment allocations. Query `amt`/`total` cannot print a different paid amount.
  - BUG-0063 / AR001: as-of 15 Oct aging excludes documents issued 16 Oct. Independent example: open 690 issued 14 Oct plus 275.50 issued 16 Oct → as-of 15 Oct current 690.
  - BUG-0057 / P09: duplicate supplier invoice on GRN→bill convert redirects `?err=` with “Duplicate bill”; first bill is kept.
  - BUG-0061 / PAY01: amount 300 against balance 240 shows “Payment cannot exceed balance due.” and does not post; original 240 remains.
  - BUG-0062 / RET01: linked return preview copies the source header discount so 275.50 previews as 275.50.
  - BUG-0037 draft: quotation (and other forms) reject percentage line discount above 100%. Silent 150%→100% cap is not used. Posted-invoice original BUG-0037 disposition is unchanged.
- Existing behaviour that must remain correct: valid 240 vendor payment posts; mixed service/digital invoices; cash purchase; converted quote/order cannot convert again; extra sales-return of a fully returned invoice does not post a second journal; Viewer/foreign payment denials; 303 campaign; 129 PostgreSQL; no BYPASSRLS; no shared global tenant GUC.
- Actual changed paths/symbols/routes: `packages/accounting/src/document-guards.ts`; `billedQtyByLineKey` / `getPurchaseOrderRemainingLines` / `createCommercialDocument` / `convertDocument` / `convertDocumentAction` / `createReturnFromBillAction` / `getApAgingSummary` / `getArAgingSummary`; `lineDiscountAmount` default percent; `payVendorBills` / `receiveCustomerPayments` / `loadPaymentPrintFacts`; remittance and receipt pages; pay/receive forms; sales and commercial return header discount; quotation/invoice form discountType/value.
- Business rule/profile/scenario IDs: P08, P09, RET01–03, VAL01–02, PAY01–02, AR001, Q02. Rulebook 1.0.0 / hash `abcdd8970b1c36e62a97c6a111d6088ca97067ad3d6e954f64250b67989b39fc` as quoted by the v2.5.11 retest. Required retests: the nine findings plus the passing controls listed above.
- Accounting, stock/rental, tenant/access and customer-data effects: PO billed qty includes GRN-sourced bills; GRN qty cannot exceed remaining ordered; purchase returns share remaining qty/value with sales returns; payment print is allocation-backed; aging is historical as-of by issue date; percent discounts above 100% refuse. No GL change to valid posted documents. No tenant GUC or RLS change.
- Migrations, schema/history compatibility and recovery implications: none. No table rewrite. Existing issued documents keep stored totals.
- Dependencies, settings/flags, deployment and external-service changes: Portainer Re-pull ON after Docker web image. Quote `v2.5.12 · <sha7>`. No new env vars. No migration.
- Independent diff/impact review and uncertainties: live browser stamp blocked. Do not replay staging payments. Encrypted A→empty-B backup last. BookOne is not customer-ready. Convert form still shares one qty field for GRN and bill; server remaining checks are authoritative.
- Checks executed: 2026-10-16 local Windows. `packages/accounting` vitest 95 pass (includes 11 document-guards cases: PO billed via GRN child, GRN remaining 6 vs 7, purchase-return remaining, 3×100/10%+5% header = 256.50, missing discount type is percent, 150% rejected, as-of 15 Oct current 690). `packages/auth` vitest 74 pass. `packages/statement-import` vitest 34 pass. Web typecheck: no new errors on changed files (pre-existing qrcode/react module resolution in this worktree). Isolated HTTP/PostgreSQL/browser rerun is QA-owned. No staging mutation.
- Failed/skipped/flaky/blocked/not-run checks and reasons: no live restricted-DB HTTP from the coding agent. Browser live-stamp verification pending QA tooling. Encrypted backup last. Do not replay staging payments.
- New QA assertions or outstanding work: pin `v2.5.12 · <sha7>` and rerun the 62-check broad workflow plus unchanged 303/129/26. Keep original financial expectations. Do not close bugs from this code change alone.
- Created staging records/cleanup, if any: none in this change.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS.
- Next exact action and responsible role: Docker web image green, Portainer Update Re-pull ON; QA pins the stamp and reruns. Do not weaken assertions.

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.
