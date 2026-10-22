# CHG-20261022-pr54-header-dialog-credit — raw header discount, dialog focus, tooltip placement, credit print (v2.5.20)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-10-22.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.5.20 on master after v2.5.19 `3e9ffee819183eb8513f446cd9b9c32ebce42faf` (docs successor of Light03 `4c3a304e6adc985c591ecb7934382b8929f9b189`). This is a reviewable source candidate. Do not deploy across a fixed Light mission.
- QA repository revision and companion PR/change ID: [CODING-MISSION-20261022-pr54](https://github.com/Dinu-Sri/bookone-qa/blob/qa/pr54-review-light05/handoffs/CODING-MISSION-20261022-pr54.md); [REVIEW-20261022-pr54](https://github.com/Dinu-Sri/bookone-qa/blob/qa/pr54-review-light05/reviews/REVIEW-20261022-pr54.md); QA PR #55 revision `37408fc48c5a3699a2033966594d8474652ab751`. Companion QA is a NEW pinned Light05 queue after Medium compares this diff. Light04/PR54 evidence is immutable. Do not replay INV0032.
- Intended before/after behaviour with a concrete example:
  - C54-02: Quote header 150% of a 10 line used to submit as clamped fixed 10 and save a draft 0. Client now posts raw `headerDiscountType`/`headerDiscountValue`; client, form adapter, and `resolveManualHeaderDiscount` refuse HEADER 150% before create (message distinct from LINE 150%). Display clamp stays display-only. Valid 100%, fixed ≤ line-net, zero, and 3×100 / line 10% / header 5% = 256.50 remain accepted. Amount-only callers still cannot submit more than line-net. Linked source headers are not replaced by client hidden fields. QT-20261021-0004 draft 0 is not edited.
  - C54-03: ConfirmDialog now focuses Cancel, traps Tab/Shift+Tab, Escape/backdrop cancel unless `busy`, restores the trigger, and uses unique `useId` labels. Browser QA never confirms Delete/Archive for this check.
  - C54-04: StatusHelp places from measured bubble size and layout viewport (scrollbar-aware). 320px with measured 304 stays left 8, not −28. 390px x42+340 stays unclipped.
  - C54-05: Sales returns print as CREDIT NOTE with source/line/header/VAT facts (`/sales/returns/:id/print`). Remaining editable qty prefills from `linkedReturnPrefillQuantities` while `sourceQuantity` stays the original for proration. Same-SKU different-price mapping stays unresolved.
  - C54-01: Product create/edit pages render view-only when `probeModuleWrite('inventory')` is false. Expected refusals return `{ok:false}` without catching `NEXT_REDIRECT`. `createQuickProduct` asserts inventory write. Exception digests 3472322650 (edit) and 2035480479 (create) are **not** confirmed from source alone.
  - C54-06: Required-supplier-number refusal remains `refuseAfterClaim` → `{ok:false}` at `createCommercialDocument`. Client `submitRetainingFields` keeps a durable `role="alert"` banner plus the existing 3200ms toast. PR54 did not capture the toast; this does not claim a missing-toast product bug.
- Existing behaviour that must remain correct: INV0018 draft 10, INV0030/0031 256.50, INV0032 open 300, QT-20261017-0002, Light03 closing 122 journals 13243.63 / AR 1306.21 / AP 1090 / InvGL 660 / stock 780 / inherited gap 120. Required-supplier refusal then same-form correction 10; VAT 302.67/46.17; fresh 7/10/3 ladders; 2+2 vs 3 refused; party-matched linked returns. Do not implement D12-008/D12-035/N13-068. P15-01 and U7/U10 stay blocked.
- Actual changed paths/symbols/routes:
  - Raw header: `resolveManualHeaderDiscount`; hidden `headerDiscountType`/`headerDiscountValue` on quotation, invoice, sales, and commercial create forms; `preventExcessiveHeaderDiscountSubmit`; `createCommercialDocumentFromForm` rejects HEADER percent > 100 before create.
  - Dialog: `ConfirmDialog` (`nextFocusIndex`, `FOCUSABLE_SELECTOR`).
  - Tooltip: `placeFloatingOverlay` / `layoutViewportSize` in `StatusBadge` and `StatusColumnHelp`.
  - Credit print: `creditPrintTitle`; `getDocumentPrintModel` credit title/source/VAT; `/sales/returns/[id]` and `/sales/returns/[id]/print`; purchase print uses credit title + VAT.
  - Prefill: `SalesDocumentForm.pickSourceInvoice` uses `linkedReturnPrefillQuantities`.
  - Product: `probeModuleWrite`; ProductForm `canWrite` + `submitRetainingFields`; `createQuickProduct` `assertModuleWrite('inventory')`.
  - Feedback: durable form-refusal banner in `submitRetainingFields`.
- Business rule/profile/scenario IDs: BR-SAL-03 raw header vs line discount. UXW-002 refusal-then-correction; UXW-005 ConfirmDialog keyboard; UXW-018 StatusHelp placement; UXW-021 shared submit/recovery. Rulebook 1.0.0 / hash `abcdd8970b1c36e62a97c6a111d6088ca97067ad3d6e954f64250b67989b39fc`.
- Accounting, stock/rental, tenant/access and customer-data effects: no posting-math change for valid linked returns or 256.50 drafts. Inventory write ceiling is unchanged; the page no longer presents a writable form when the ceiling or job denies write. No tenant GUC, RLS, BYPASSRLS, grant expansion, or module-flag change.
- Migrations, schema/history compatibility and recovery implications: none. Do not fabricate upgrade fixtures. Isolated v2.5.14 `a36af04` app/auth/DB remains blocked.
- Dependencies, settings/flags, deployment and external-service changes: quote `v2.5.20 · <sha7>` after a later authorized deploy. No env vars, migrations, or new dependencies.
- Independent diff/impact review and uncertainties: live browser stamp blocked here. Product exception digests still need private permission context and server evidence. Supplier toast capture in PR54 remains inconclusive; durable banner is additive. Same-SKU different-price rows stay unresolved. Encrypted backup last. BookOne is not customer-ready.
- Checks executed: `Set-Location packages/accounting; node node_modules/vitest/vitest.mjs run` — 11 files, 163 passed (was 147 on v2.5.19; added HEADER vs LINE 150%, fixed/saved excess, valid 100%/256.50, amount-only cap, linked source override, credit titles, remaining sourceQuantity 3 / remaining 2, overlay 320/390/scrollbar/flip/desktop, Tab cycle). `Set-Location packages/auth; node ..\accounting\node_modules\vitest\vitest.mjs run` — 10 files, 86 passed (added sole-lite inventory deny, sole-full allow, inventory-off deny, viewer deny, owner allow). Independent examples retained: 256.50, 85.50/171, 302.67, 118, 2+2 vs 3, 7/10/3 ladders, 1.01/1.04. Live browser stamp blocked. Do not replay staging payments or INV0032.
- Failed/skipped/flaky/blocked/not-run checks and reasons: no live restricted-DB HTTP. Isolated upgrade environment not prepared. Assistive-technology and narrow-viewport stamps not run here. UX 1.1.0 `workbook.json` was 404 on `qa/pr54-review-light05`; last published 1.0.0 JSON SHA256 `383d18ad74978af67e9e75d855c77c87b45a92beb00c101a3338dd0abd01e57f`. 48 UX workflows remain unrun. Backup last.
- New QA assertions or outstanding work: Medium compares this diff and publishes a NEW exact-bound Light05 queue. Rerun HEADER 150% on a **new** quote (do not edit QT-20261021-0004); ConfirmDialog keyboard on invoice and purchase without confirming Delete/Archive; StatusHelp at 320/390/desktop; credit print 300 and historical 302.67/46.17 under current VAT false; remaining-qty prefill; authorized vs denied product write; required-supplier refusal then correction. Do not close observations from this code change alone.
- Created staging records/cleanup, if any: none. Preserve Light03 fixtures and restored settings.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS.
- Next exact action and responsible role: Independent QA / Medium pins Light05 to `v2.5.20 · <sha7>` after reviewing the diff. Owner may later authorize deploy. Do not close OBS-M19 from this code. Do not deploy across an active mission.

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them: existing ConfirmDialog, StatusHelp, DocumentPrintSheet, ProductForm, DocumentLinesEditor, commercial create forms, `form-error` tokens. No replacement design system.
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: QA PR #55 `37408fc48c5a3699a2033966594d8474652ab751`. UX 1.1.0 JSON not fetchable at the mission branch (404). Last known 1.0.0 JSON SHA256 `383d18ad74978af67e9e75d855c77c87b45a92beb00c101a3338dd0abd01e57f`.
  - UXW-002 refusal-then-correction (supplier banner + product retain)
  - UXW-005 ConfirmDialog focus/Escape/busy
  - UXW-018 StatusHelp measured placement
  - UXW-021 shared submit/recovery (raw header + durable alert)
- Before/after behaviour; independent expected/unchanged example: HEADER 150% of 10 is refused with the header message and no new quote; LINE 150% still uses the line message. Unchanged: 256.50, INV0032 open 300, QT0004 draft 0.
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings:
  - Direct: `/sales/quotations/new`, `/sales/invoices/new`, `/sales/orders/new`, `/sales/returns/new`, `/purchase/*/new`, `/sales/returns/:id/print`, `/inventory/products/new`, `/inventory/products/:id/edit`.
  - Shared ConfirmDialog: invoice/purchase lists (`CommercialDocumentList`), purchase detail, product list, categories, parties, discounts, brand/location, company form, reconciliation workbench/guided/inbox, bank-import studio.
  - Shared StatusHelp: sales/purchase lists and purchase/sales document detail.
  - Shared `submitRetainingFields`: all commercial create forms plus ProductForm.
  - Shared `createQuickProduct`: DocumentLinesEditor and POS terminal.
- Preserved field/line/source identity, money/stock/history/print and server permissions: source unit price, remaining qty vs original `sourceQuantity`, header 13.50 + VAT 18, INV0018/0030/0031/0032, Light03 closing totals. Server `assertModuleWrite` remains. Linked source header is not overridden by hidden fields.
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: live browser stamp blocked in this engineering session. Geometry helpers cover 320/390/desktop and Tab cycle. Independent QA owns rendered evidence.
- Exact and adjacent regressions; actual engineering checks and missing layers: accounting 163; auth 86. Missing: live restricted-DB HTTP, isolated v2.5.14 upgrade, assistive-technology, 48 unbound UX workflows.
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: UXQ-001–004 unresolved. Product digest attribution pending private server evidence. Same-SKU different-price mapping unresolved; no first-match guess.
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert this commit; no schema/data change. Do not credit INV0032. Encrypted backup last.
- QA companion change/run and independent review link (or pending): [CODING-MISSION-20261022-pr54](https://github.com/Dinu-Sri/bookone-qa/blob/qa/pr54-review-light05/handoffs/CODING-MISSION-20261022-pr54.md). Independent Light05 pending. Do not close OBS-M19 from code.

## Already-authorized Inventory product-write fixture (private)

Provision through supported Team/Jobs UI on an existing test tenant that already has the inventory module on and a capability that allows inventory writes (company, or sole full). Bind a job that includes `inventory.products.write`. Keep credentials and IDs private; do not commit them. Light must not change module flags, jobs, or grants to obtain a pass.

- Authorized variant: create Physical / Standard / cost 60 / sell 10 / opening 0, then edit only the new fixture notes; both persist once with zero stock/GL.
- Denied variant: Viewer (or sole lite with inventory view-only) sees a non-writable form, a clear supported refusal, no created/edited record/GL/stock, and applicable fields retained.
- Bind each role/config separately. Owner label alone is insufficient.
- `createQuickProduct` uses the same inventory write ceiling; test it with the same provisioned roles in isolated auth fixtures.

Exception digests 3472322650 (edit) and 2035480479 (create) remain unattributed from source alone. They are consistent with an uncaught thrown authorization/validation error, but the actual digest cause requires private actor/module/job context and server logs.
