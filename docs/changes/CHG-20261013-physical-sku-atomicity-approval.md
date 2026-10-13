# CHG-20261013-physical-sku-atomicity-approval — SKU tenant, posting txn, bill approve

Status: shipping on master (v2.2.5).

- Author/agent and date: Grok coding agent, 2026-10-13.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.2.5 on `master` after `343d546`.
- QA repository revision and companion PR/change ID: [HANDOFF-20261013-physical-findings](https://github.com/Dinu-Sri/bookone-qa/blob/main/handoffs/HANDOFF-20261013-physical-findings.md), [RUN-15](https://github.com/Dinu-Sri/bookone-qa/blob/main/runs/RUN-20261013-physical-lifecycle-15.md), QA PR13. Bugs 0018, 0019, 0020.
- Intended before/after behaviour with a concrete example:
  - C-115/215: invoice with another company’s product UUID created a document/journal and stored that product id. After: any non-null product id must belong to the current tenant and not be voided; missing product does not fall through as a service line. Zero business effects. Trigger `041` enforces the same on document/stock rows.
  - C-116/216: journal-line insert failed after a transaction row and empty journal were already committed. After: document, party, journal, stock, cost, settlement and audit share one `db().transaction` on the reserved tenant connection so the failure rolls back all of them.
  - RT-018/118: locked-period finance still created a party + audit via `ensureParty` before the period check. After: period lock is preflighted before writes, and party create lives inside the posting transaction.
  - RT-020/120: Viewer approved/posted an existing pending purchase. Create already denied. After: `approvePurchaseDocument` / `rejectPurchaseDocument` assert purchase write, Viewer/read-only, module and dimension scope before any update. Owner C-101/201 still posts. Buttons stay; the server denies.
- Existing behaviour that must remain correct: PO→GRN→bill stock/AP/GRNI, partial receipts/bills, FIFO/average/last sale-return, supplier payment 600 + repeat deny, unpaid purchase return AP480, payment denials, named dates, signed P&L, receipt keys, one reversal.
- Actual changed paths/symbols/routes: `createCommercialDocument`, `approvePurchaseDocument`, `rejectPurchaseDocument`, `requireOwnedProductIds`, `requireOwnedDocumentId`, `assertPurchaseWrite`, migration `041_product_tenant_ownership.sql`.
- Business rule/profile/scenario IDs: C-115/215, C-116/216, RT-018/118, RT-020/120, C-101/201.
- Accounting, stock/rental, tenant/access and customer-data effects: no journal sign change. Failed posts leave no txn/journal/stock. Foreign SKU never stored. Viewer cannot post pending bills.
- Migrations, schema/history compatibility and recovery implications: additive trigger/function 041. Existing in-tenant product links remain. Rows with a foreign product_id would fail future updates; QA reported that as the defect, not historic staging data.
- Dependencies, settings/flags, deployment and external-service changes: Portainer Re-pull ON after Docker web image. Quote `v2.2.5 · <sha7>`.
- Independent diff/impact review and uncertainties: HTTP/browser exposure still with QA. Convert/create share the new create transaction.
- Checks executed: 2026-10-13 local Windows. Deleted stale `apps/web/.next`, then `pnpm lint` (4 tasks), `pnpm typecheck` (6 tasks), `pnpm test` (accounting 71, auth 15 including reserved-drizzle, statement-import 30 pass / 4 skip), `pnpm build` (Next 15.5.19, 127 static pages). All green. Node v20 vs engines `>=22` warning only.
- Failed/skipped/flaky/blocked/not-run checks and reasons: no live staging mutation. QA runtime stays on their fixture. statement-import 4 skips unchanged.
- New QA assertions or outstanding work: rerun 60 source / 49 runtime on a fresh fixture at `v2.2.5`; keep the passing physical positives.
- Created staging records/cleanup, if any: none.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, KNOWN_ERRORS.
- Next exact action and responsible role: wait for Docker web image, Portainer Update Re-pull ON; QA pins `v2.2.5 · <sha7>` and reruns the physical batch.
