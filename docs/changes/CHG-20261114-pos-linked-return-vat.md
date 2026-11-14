# CHG-20261114-pos-linked-return-vat — POS linked-return preview uses original VAT (v2.5.28)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-11-14.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.5.28 on `fix/v2528-pos-linked-return-vat` from origin/master `dae17abcba12d6810c8f8c3fe4a74fb28280a026` / tree `78973f5a9298ce615f5c8cda17f77b2de714bfa2` (v2.5.27). Owner asked this candidate to be pushed to master for the Docker web image Action.
- QA repository revision and companion PR/change ID: CONT10 frozen QA `d10073475f8a34470367d64eb7331ce6b1d082a3`. Live preview defect on a TAX/local goods sale 2×100 net 200 / VAT 36 / gross 236. No refund was posted. Qualify a newly dated E30–E37 successor against current persisted originals/shift. Do not repeat S01/E28/E29, funding, purchases, setup or any N workflow.
- Intended before/after behaviour with a concrete example: VAT-registered TAX POS sale 2×100, gross 236. Return lookup still shows sold 2 / left 2 / total 236. Selecting one unit previously showed refund **100**. After this change the cart, payment modal and Complete refund button show **net 100 + VAT 18 = 118**, using the original ticket's stored `vatRate` and remaining caps. A second remaining unit is also 118. Commercial/zero-VAT linked returns stay 100. Free (unlinked) returns stay net-only.
- Existing behaviour that must remain correct: new-sale TAX/commercial invoice kind; current company rate on **new** sales only; manual POS print suppression; source ownership/authorization; remaining qty caps; service no-stock; cash/card/bank refund tenders. Server linked returns already reverse stored source `vatRate` via `createCommercialDocument`; this change does not reprice historical refunds from the live rate.
- Actual changed paths/symbols/routes:
  - `posLinkedReturnPreview` in `packages/accounting/src/pos-linked-return.ts`.
  - `PosTerminal` return totals/modal/banner use that helper instead of `mode === 'sale' && invoiceKind === 'tax_invoice'`.
  - `lookupPosSale` returns stored `vatRate` / `invoiceKind` / discounts / prior return net and lines.
- Business rule/profile/scenario IDs: CONT10 POS linked-return VAT preview. Adjacent: cash goods 118 twice; service 47.20 then 94.40 card; mixed goods+service 165.20 bank.
- Accounting, stock/rental, tenant/access and customer-data effects: preview/confirmation now match the already-posted linked-return journal path (output VAT reverse at stored rate, restock physical cost, no stock on service). No BYPASSRLS. No live fixture grants. Existing CONT10 sale/shift/bill are not rewritten.
- Migrations, schema/history compatibility and recovery implications: **none**.
- Dependencies, settings/flags, deployment and external-service changes: none. Quote `v2.5.28 · <sha7>` after Docker web image is green and Portainer Update with Re-pull ON.
- Independent diff/impact review and uncertainties: server `completePosReturn` still sends lines + source id (not the displayed total). Linked `sales_return` already loads `linkedSource.vatRate`. Preview was the live defect. Isolated runtime / live browser not-run in this engineering session.
- Checks executed: `pnpm --filter @bookone/accounting test` — 17 files / 223 passed (includes pos-linked-return 118/47.20/94.40/165.20, commercial 100, free-return net, qty cap, stored 18% vs live 15%, and sales-vat/POS print regressions). `pnpm --filter @bookone/accounting typecheck` passed. Isolated runtime and live browser not-run.
- Failed/skipped/flaky/blocked/not-run checks and reasons: live browser, isolated `bookone_qa_runtime`, fixture grants, mixed-TENDER split, backup/restore LAST.
- New QA assertions or outstanding work: E30–E37 on the current persisted TAX goods ticket (left 2) and dedicated open shift. If crossing UTC day, review dates and reuse of the old shift/source. Keep commercial/zeroVAT, partial-discount, rounding and cap coverage.
- Created staging records/cleanup, if any: none.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS.
- Next exact action and responsible role: Owner deploys via Docker web image then Portainer Re-pull ON. Independent candidate review before live qualification. Do not repair QA history. Recovery LAST. BookOne is not customer-ready.

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references: existing POS `pos-totals`, `pos-pay-sheet`, `pos-cart-banner`, native buttons. No second design system.
- Exact external QA commit and ux/workbook.json: CONT10 frozen `d100734`. UXW-002 truthful totals/outcome.
- Before/after: linked TAX return of 1×100 shows VAT 18 and refund 118 on cart, F4 sheet and Complete refund. Unchanged: new-sale kind selector; free-return net-only; commercial return 100; manual print mode.
- Direct screens: `/pos` return mode, payment modal, ticket lookup. Shared consumers: customer display channel (same totals), `/pos/receipt/:id` after post (server taxTotal).
- Preserved field/line/source identity: return cart still uses original unit prices and remaining qty; VAT comes from stored source `vatRate`.
- Desktop/narrow/keyboard/reader evidence: not run in this engineering session. F4 Refund still opens the sheet when qty is valid.
- Exact and adjacent regressions: commercial 100; free return; qty cap; service no-stock; cash/card/bank; manual print.
- Conflict/exception: free returns remain outside this linked-return VAT path.
- Small rollout: revert this commit; no schema.
- QA companion: newly dated E30–E37 after owner deploy.
