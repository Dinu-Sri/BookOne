# CHG-20261017-aging-return-preview-subtotal — historical settlements, return preview, subtotal labels (v2.5.13)

Status: done.

- Author/agent and date: Grok coding agent, 2026-10-17.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.5.13 on `master` after `ead3a82` (v2.5.12).
- QA repository revision and companion PR/change ID: [HANDOFF-20261016-v2512-browser-deep](https://github.com/Dinu-Sri/bookone-qa/blob/qa/v2512-deep-browser/handoffs/HANDOFF-20261016-v2512-browser-deep.md); [RUN-20261016-v2512-browser-deep](https://github.com/Dinu-Sri/bookone-qa/blob/qa/v2512-deep-browser/runs/RUN-20261016-v2512-browser-deep.md); [CHECKS-20261016-v2512-browser-deep](https://github.com/Dinu-Sri/bookone-qa/blob/qa/v2512-deep-browser/runs/CHECKS-20261016-v2512-browser-deep.json). Companion QA remains [draft PR #38](https://github.com/Dinu-Sri/bookone-qa/pull/38). No QA merge/deploy by this change.
- Intended before/after behaviour with a concrete example:
  - P1 BUG-0063 / D12-041: INV issued 16 Oct 256.50, receipt 75.50 on 16 Oct, receipt 1 on 17 Oct. Current due stays 180. As-of 16 Oct aging is 181 (not 180). Aggregate with a separate open 70 issued on or before 16 Oct is 251 (not 250). As-of 15 Oct still excludes the 16 Oct invoice. Future purchase payments/returns follow the same reconstruction. Do not delete the 17 Oct receipt or rewrite current due.
  - P2 BUG-0062 / D12-044/048: source 3×100, line 10%, header 5% = 256.50. Qty 1 preview is 85.50; remaining 2 preview is 171. Posted credits stay 85.50/171. INV0004 is fully returned; retest on a fresh source.
  - P2 OBS-D12-SUBTOTAL / D12-029: quote/invoice detail labels Subtotal 270, Discount 13.50, Total 256.50. Stored totals and journals are unchanged.
- Existing behaviour that must remain correct: 16 Oct issue-date exclusion; current INV due 180; valid 75.50/100 payments; print ignores query tampering; duplicate bill/return/over-balance errors; full return preview 256.50; extra return after 3 adds no SR/journal; P&L 86.50; BS 246.50; Pay vendors / Receive payment lists still use current open balances.
- Actual changed paths/symbols/routes: `packages/accounting/src/document-guards.ts` (`asOfOpenBalance`, `prorateLinkedReturn`, `displayedLineNetSubtotal`); `getArAgingSummary` / `getApAgingSummary`; sales/commercial return preview; `CommercialDocumentDetail` and print subtotal labels.
- Business rule/profile/scenario IDs: D12-029, D12-041, D12-044, D12-048. Rulebook 1.0.0 / hash `abcdd8970b1c36e62a97c6a111d6088ca97067ad3d6e954f64250b67989b39fc`. Required retests: those four plus D12-038 current 180, D12-039/040 as-of 15 Oct zero, D12-043 full preview, D12-045/049 posted credits.
- Accounting, stock/rental, tenant/access and customer-data effects: aging reconstructs open amounts from current balance plus settlements dated after the cutoff. Payment screens are unchanged. Return posting already prorated; preview now uses the same ratio. Subtotal label is display-only (stored `subtotal` remains after-header supply). No tenant GUC or RLS change. Keep D2512 fixtures.
- Migrations, schema/history compatibility and recovery implications: none. No table rewrite. Existing issued documents keep stored totals.
- Dependencies, settings/flags, deployment and external-service changes: Portainer Re-pull ON after Docker web image. Quote `v2.5.13 · <sha7>`. No new env vars. No migration.
- Independent diff/impact review and uncertainties: live browser stamp blocked. Do not replay staging payments. Encrypted backup last. BookOne is not customer-ready. Stock quantity/layer/location still unobserved.
- Checks executed: `node node_modules/vitest/vitest.mjs run` in `packages/accounting` — 10 files, 103 passed. Independent cases: asOfOpenBalance 180+1=181 / +70=251 / closed 0+181=181; prorateLinkedReturn qty1=85.50 qty2=171 qty3=256.50; displayedLineNetSubtotal(256.5, 13.5)=270. Live browser stamp blocked. Do not replay staging payments.
- Failed/skipped/flaky/blocked/not-run checks and reasons: no live restricted-DB HTTP. Browser live-stamp pending QA. Do not replay staging payments. Backup last.
- New QA assertions or outstanding work: pin `v2.5.13 · <sha7>` and rerun D12-029/041/044/048 plus adjacent passes. Do not close bugs from this code change alone. Next QA coverage: stock quantities/layers, locations, settings, locks, verified roles.
- Created staging records/cleanup, if any: none. Preserve INV0003 with 16 Oct 75.50 and 17 Oct 1 receipts.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS.
- Next exact action and responsible role: Docker web image green, Portainer Update Re-pull ON; QA pins the stamp and reruns. Do not weaken assertions.

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.
