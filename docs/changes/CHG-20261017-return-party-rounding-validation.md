# CHG-20261017-return-party-rounding-validation — linked return party, residual rounding, source price, retained validation (v2.5.14)

Status: done.

- Author/agent and date: Grok coding agent, 2026-10-17.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.5.14 on `master` after `1a10201` (v2.5.13).
- QA repository revision and companion PR/change ID: [HANDOFF-20261017-v2513-next-wave](https://github.com/Dinu-Sri/bookone-qa/blob/qa/v2513-next-wave/handoffs/HANDOFF-20261017-v2513-next-wave.md); [RUN-20261017-v2513-next-wave](https://github.com/Dinu-Sri/bookone-qa/blob/qa/v2513-next-wave/runs/RUN-20261017-v2513-next-wave.md); [CHECKS-20261017-v2513-next-wave](https://github.com/Dinu-Sri/bookone-qa/blob/qa/v2513-next-wave/runs/CHECKS-20261017-v2513-next-wave.json). Companion QA remains [draft PR #39](https://github.com/Dinu-Sri/bookone-qa/pull/39). No QA merge/deploy by this change.
- Intended before/after behaviour with a concrete example:
  - P1 OBS-N13-PARTY / N13-054/055/090: source-linked purchase return copies D2513 Vendor and cannot save as BW261016 Supplier. Server rejects a different supplier before GL or allocation. Sales return picker still loads CUS0008 and rejects a change to CUS0005. Matching-party partial 85.50 / 171 and SR 0.99 still post.
  - P2 OBS-N13-PRICE / N13-016: remaining two units stay preview 171 when the source price is 100; editing unit price is locked. Posted credit stays 171.
  - P2 OBS-N13-ROUNDING / N13-071: INV0009 3×1 header 0.01 = 2.99. After credits 1+1, the last unit previews and posts 0.99 and closes 2.99. Do not change source price or return a fractional quantity.
  - P2 OBS-N13-INPUT / N13-067: 150% line discount still errors with “Percentage line discount cannot exceed 100%”, keeps customer/lines/dates on the form, and creates no invoice.
- Existing behaviour that must remain correct: historical AR 181/251; current due 180; as-of 15 Oct zero; quote/invoice Subtotal 270 / Discount 13.50 / Total 256.50; original-price partial previews 85.50/171; excess fourth unit rejected; Pay/Receive current lists; PR0004/SR0010 fixtures retained (no repair).
- Actual changed paths/symbols/routes: `packages/accounting/src/document-guards.ts` (`linkedReturnPartyMismatch`, `isClosingLinkedReturn`, `remainingReturnValue`, `applyClosingReturnResidual`); `createCommercialDocument` source-party bind; linked return preview/post; `PartyNameFields` lock; `DocumentLinesEditor` source-price lock; invoice/quote/sales/purchase create forms retain 150% denial on the form.
- Business rule/profile/scenario IDs: N13-054, N13-055, N13-016, N13-067, N13-071, N13-090. WB-PHY.J05.C06, WB-PHY.J06.C06, WB-HYB.J02.C06, WB-HYB.J02.C07, WB-CORE.J06.C06. Rulebook 1.0.0 / hash `abcdd8970b1c36e62a97c6a111d6088ca97067ad3d6e954f64250b67989b39fc`.
- Accounting, stock/rental, tenant/access and customer-data effects: linked credits always settle the source party. Closing returns take remaining source value so cents are conserved. Source unit prices stay locked on preview. Invalid 150% still refuses posting. No tenant GUC or RLS change. Keep D2513 and earlier fixtures.
- Migrations, schema/history compatibility and recovery implications: none. Existing wrong-party PR0004/SR0010 stay as recorded.
- Dependencies, settings/flags, deployment and external-service changes: Portainer Re-pull ON after Docker web image. Quote `v2.5.14 · <sha7>`. No new env vars. No migration.
- Independent diff/impact review and uncertainties: live browser stamp blocked. Do not replay staging payments. Encrypted backup last. BookOne is not customer-ready. Stock quantity/layer/location still unobserved. Same-tenant party tests do not prove cross-tenant isolation.
- Checks executed: `node node_modules/vitest/vitest.mjs run` in `packages/accounting` — 10 files, 111 passed. Independent cases: party mismatch true for different names / false for original; remaining 2.99−2=0.99; last unit residual 0.99; full qty 3 still 2.99; qty 2 still 171 at source price 100. Live browser stamp blocked. Do not replay staging payments.
- Failed/skipped/flaky/blocked/not-run checks and reasons: no live restricted-DB HTTP. Browser live-stamp pending QA. Do not replay staging payments. Backup last.
- New QA assertions or outstanding work: pin `v2.5.14 · <sha7>` and rerun N13-054/055/016/067/071/090 plus matching-party and original-price controls. Do not close observations from this code change alone. Do not blanket-close BUG-0062. Next QA coverage: stock quantities/layers, locations, settings, locks, verified roles.
- Created staging records/cleanup, if any: none. Preserve INV0009 remainder 0.99, PR0004, SR0010, INV0003 future receipt.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS.
- Next exact action and responsible role: Docker web image green, Portainer Update Re-pull ON; QA pins the stamp and reruns. Do not weaken assertions.

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.
