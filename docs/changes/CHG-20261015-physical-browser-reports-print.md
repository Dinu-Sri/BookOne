# CHG-20261015-physical-browser-reports-print — BS earnings, receipt print, PO vendor, SO preview (v2.5.8)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-10-15.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.5.8 on `master` after `7ffafab` (v2.5.7).
- QA repository revision and companion PR/change ID: [HANDOFF-20261015-v257-physical-browser-findings](https://github.com/Dinu-Sri/bookone-qa/blob/main/handoffs/HANDOFF-20261015-v257-physical-browser-findings.md). Live pin **v2.5.7 · 7ffafab**. Browser physical batch 19 pass / 4 fail; campaign **300 pass, 1 fail** (RT-060).
- Intended before/after behaviour with a concrete example:
  - Before: Balance Sheet showed assets 1520 and equity 1000 (liabilities+equity 1400) while P&L profit 120 was omitted; RT-060 invoice 600 reported equity 0. Customer receipt `/sales/payments/receipt` crashed after a committed 150 allocation because `DocumentPrintSheet` passed `window.print` onClick from a server page. First PO blocked Save on empty required Vendor while "Or type new name" was filled. Sales-order View preview said QUOTATION / Good thru.
  - After: Balance Sheet equity includes a Current earnings presentation line equal to unclosed net income (1120 = 1000+120; RT-060 equity 600). Journals unchanged. Receipt Print is a client `PrintSheetButton`; server still loads the authorised print model. Either vendor select or the alternative name is enough; purchase docs still require one of them server-side. Snapshot kicker/date/edit follow document type and list `editHrefPattern`.
- Existing behaviour that must remain correct: posted journals (Dr/Cr 2750); PO600 no stock/GL; GRN qty-only; bill Dr Inventory 600 / Cr AP 600; quote/order/invoice 400; original-cost return 60; receipts/AP allocations; stock +10/−4/+1; aging AR150/AP400; cash 950 / stock 7 / value 420 / profit 120; oversell 8-of-7 and payment 151-of-150 leave checked state unchanged; closed retained earnings are not doubled (netIncome 0 adds no extra line); invoice print preview and vendor remittance; BUG-0010–0043 originals. Do not reopen B-104.
- Actual changed paths/symbols/routes: `withUnclosedEarnings` in `packages/accounting/src/statement-sign.ts`; `getReports` balanceSheet equity; reports equity label; `PrintSheetButton`; `PartyNameFields`; `createCommercialDocumentFromForm` purchase empty-vendor; `QuotationSnapshotDialog` type-aware kicker/date/editHref.
- Business rule/profile/scenario IDs: BUG-0048 / RT-060 / LP257-021 BR-ACC-01/08 BR-DAT-01; BUG-0045 LP257-013 BR-ACC-04 RB-UI-01; BUG-0046 LP257-022 RB-UI-01; BUG-0047 LP257-023 RB-UI-01.
- Accounting, stock/rental, tenant/access and customer-data effects: reporting only for BUG-0048. Receipt page does not post again. PO override creates the vendor name already supported by the action. Snapshot is display/navigation only.
- Migrations, schema/history compatibility and recovery implications: none.
- Dependencies, settings/flags, deployment and external-service changes: Portainer Re-pull ON after Docker web image. Quote `v2.5.8 · <sha7>`.
- Independent diff/impact review and uncertainties: Balance Sheet still uses the same period filter as the trial (existing as-of/cumulative behaviour). Current earnings is that period's unclosed P&L. Receipt retest is read-only on the existing 150 allocation. Restore A→empty-B remains unverified. BookOne is not customer-ready.
- Checks executed: 2026-10-15 local Windows. `pnpm --dir packages/accounting test` (79 pass, including 4 BUG-0048 cases: 1000+120=1120, RT-060 equity 600, closed NI 0 no extra line, loss 920), `pnpm --dir packages/accounting typecheck` green, `pnpm --dir packages/auth test` (53 pass), `pnpm --dir packages/statement-import test` (30 pass / 4 skip). Isolated campaign and live receipt revisit are QA-owned.
- Failed/skipped/flaky/blocked/not-run checks and reasons: no live staging mutation. Isolated 301-check rerun and read-only receipt revisit are QA-owned. Browser GRNI/costing/permission slices continue in QA.
- New QA assertions or outstanding work: pin `v2.5.8 · <sha7>` and rerun RT-060 plus the physical positives; read-only receipt; PO alternative name; SO View kicker. Then further costing, GRNI, permissions; backup last.
- Created staging records/cleanup, if any: none in this change.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS.
- Next exact action and responsible role: Docker web image green, Portainer Update Re-pull ON; QA pins the stamp. Do not bypass Admin grant. Do not recreate the 150 receipt to debug rendering.

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.
