# CHG-20261012-viewer-write-denial — Viewer cannot create customers or invoice drafts

Status: ready for QA retest on identified GHCR image.

- Author/agent and date: Grok coding agent, 2026-10-12.
- Product base SHA and branch/PR: `57761dd` on `master`.
- QA repository revision and companion PR/change ID: bookone-qa [PR #4](https://github.com/Dinu-Sri/bookone-qa/pull/4) merged `1e44967`. Bugs [BUG-0003](https://github.com/Dinu-Sri/bookone-qa/blob/main/bugs/BUG-0003-viewer-can-create-customer.md), [BUG-0004](https://github.com/Dinu-Sri/bookone-qa/blob/main/bugs/BUG-0004-viewer-can-save-invoice-draft.md); BUG-0002 remains open until a denied write shows a normal message on this build.
- Intended before/after behaviour with a concrete example:
  - Viewer on `/parties/customers/new` saved a customer. After: server rejects create/update/archive/restore/delete; New/Edit/Archive hidden; `/new` shows a permission card.
  - Viewer on `/sales/invoices/new` saved draft `INV-20261012-0001`. After: `createCommercialDocument` still requires `sales.invoices.write`; UI uses `accessByLabel === 'write'` (missing/read is not write); archive/restore/delete documents also require write.
- Existing behaviour that must remain correct: Owner/Admin/Sales still create customers and invoice drafts. Cashier still has POS write without invoice create. Viewer still reads lists and Control Room stays denied. BUG-0001 cash-sale 4000 mapping unchanged.
- Actual changed paths: `packages/auth/src/permissions/resolve.ts`, `packages/auth/test/resolve.test.ts`, `apps/web/src/lib/access.ts`, `apps/web/src/app/actions/workspace.ts`, `apps/web/src/app/actions/parties.ts`, `apps/web/src/app/actions/commercial-docs.ts`, invoice/customer/vendor pages, `party-list.tsx`, `commercial-document-list.tsx`, `bookone-shell.tsx`.
- Business rule/profile/scenario IDs: BUG-0003, BUG-0004, BUG-0002 follow-up. Viewer template is read-only (`docs/ACCESS_CONTROL_DESIGN.md`).
- Accounting, stock/rental, tenant/access and customer-data effects: Viewer cannot insert or archive party/document rows. No schema change. No ledger/stock path in this change.
- Migrations: none.
- Dependencies, settings/flags, deployment: none. Wait for **Docker web image** green, then Portainer Update Re-pull ON.
- Independent review: prior invoice UI used `accessByLabel !== 'read'`, so a missing label looked like write. Access-load failure granted write on every writeable screen. Party actions had no `assertPermission`. Fallback full-access treated empty/`member` as owner when `rbac_enforced` is false.
- Checks: `pnpm --dir packages/auth test` — 6 passed (Viewer denials, rbac-off fallback, Sales writes). Browser retest after GHCR image is pulled.
- Next exact action: owner waits for Docker web image, Portainer Update Re-pull ON; QA retests Viewer customer create and invoice Save draft.
