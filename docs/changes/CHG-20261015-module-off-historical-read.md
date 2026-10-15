# CHG-20261015-module-off-historical-read — module-off historical document reads (v2.5.7)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-10-15.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.5.7 on `master` after `d5377d8` (v2.5.6).
- QA repository revision and companion PR/change ID: [HANDOFF-20261015-v256-retest](https://github.com/Dinu-Sri/bookone-qa/blob/main/handoffs/HANDOFF-20261015-v256-retest.md) and [BUG-0043](https://github.com/Dinu-Sri/bookone-qa/blob/main/bugs/BUG-0043-module-off-historical-detail.md). Final campaign on pin **v2.5.6 · d5377d8**: 292 checks, 291 passed, 1 failed (RT-047). Live sidebar confirmed the same stamp.
- Intended before/after behaviour with a concrete example:
  - Before: Owner posted invoice 100, then disabled Sales. New invoice and payment correctly denied. `getCommercialDocument` required `sales.invoices.read` through the module-on ceiling, so Owner historical detail was denied (`historyDenied=1`, `invoiceReadGrant=0`). Report profit 100 still survived.
  - After: Optional ERP modules (sales, purchase, inventory, POS, rental) are a **write** ceiling. Company/sole_prop members who still have job read authority, active membership, no explicit deny, and matching tenant/dimension scope can open existing documents (and print via the same guard). Writes stay denied. Nav still uses `canViewModule`, so disabled suites stay off the menu. Personal/pending entities still cannot view those modules. Warehouse without invoice grants still cannot read invoices.
- Existing behaviour that must remain correct: RT-045/051 scoped and no-read job detail denials; RT-046 scope-fault deny; Viewer hard-deny writes; Sales/Cashier/Accountant/branch denials when the module is on; AP competing 350/600 one-winner; FIFO C-111; average RT-032; service/digital VAT 413; source VAT after rate change; payment all-or-nothing and fingerprint; linked returns; archive helpers; BUG-0010–0042 originals. Do not reopen B-104 (fixture-corrected credit). S-0781 empty-hash is QA alignment.
- Actual changed paths/symbols/routes: `entityCanReadModularHistory` in `packages/auth/src/permissions/ceiling.ts`; `ceilingAllows` read path in `packages/auth/src/permissions/resolve.ts`; comment on `assertCanReadCommercialDocument` (print still uses the same helper). Nav `canViewModule` and `assertModuleWrite` unchanged.
- Business rule/profile/scenario IDs: BUG-0043 / RT-047; RB-CONFIG-01 revision 1; BR-DAT-01; BR-SEC-02. Rerun RT-045/046/047/048/049/050/051 plus the full 292 on the next pin.
- Accounting, stock/rental, tenant/access and customer-data effects: no journal, stock, or restore changes. Sales-off no longer blackouts authorised historical invoice/bill/POS/rental/inventory reads. Job grants, deny overrides, tenant, and dimension scope still apply. Module-off still blocks create/pay/dispatch/transfer writes.
- Migrations, schema/history compatibility and recovery implications: none.
- Dependencies, settings/flags, deployment and external-service changes: Portainer Re-pull ON after Docker web image. Quote `v2.5.7 · <sha7>`.
- Independent diff/impact review and uncertainties: list pages that call `allows(..., 'read')` can load for authorised jobs via a typed URL even when the suite is hidden in nav. That is historical access, not a grant of every disabled-module screen to every reader. Restore A→empty-B remains unverified. BookOne is not customer-ready.
- Checks executed: 2026-10-15 local Windows. `pnpm --dir packages/auth test` (53 pass, including 8 BUG-0043 cases: Owner/Viewer/Sales/Cashier historical invoice read with Sales-off, Warehouse invoice deny, explicit deny, personal deny, purchase/inventory/POS/rental history), `pnpm --dir packages/auth typecheck` green, `pnpm --dir packages/accounting test` (75 pass), `pnpm --dir packages/statement-import test` (30 pass / 4 skip). Isolated campaign rerun is QA-owned.
- Failed/skipped/flaky/blocked/not-run checks and reasons: no live staging mutation. No Admin test-account grant. Isolated campaign rerun is QA-owned. Browser physical-goods, permissions, and real backup/restore remain QA.
- New QA assertions or outstanding work: pin `v2.5.7 · <sha7>` and rerun RT-045–051 plus the full 292 on a fresh isolated DB. Keep original amounts and zero-mutation negatives. Continue physical-goods, permissions, and A→empty-B restore in parallel.
- Created staging records/cleanup, if any: none in this change.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS.
- Next exact action and responsible role: Docker web image green, Portainer Update Re-pull ON; QA pins the new stamp and reruns RT-047 with the retained campaign. Do not bypass Admin grant.

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.
