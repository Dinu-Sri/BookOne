# CHG-20261013-viewer-hard-deny — Viewer writes denied even with extra grants

Status: ready for QA retest on identified GHCR image.

- Author/agent and date: Grok coding agent, 2026-10-13.
- Product base SHA and branch/PR: follows `85bb2f3` on `master`.
- QA repository revision and companion PR/change ID: bookone-qa [PR #5](https://github.com/Dinu-Sri/bookone-qa/pull/5). Retests [RUN-20261012-viewer-permission-retest-02](https://github.com/Dinu-Sri/bookone-qa/blob/qa/retest-viewer-permissions-20261012/runs/RUN-20261012-viewer-permission-retest-02.md) and [retest-03](https://github.com/Dinu-Sri/bookone-qa/blob/qa/retest-viewer-permissions-20261012/runs/RUN-20261012-viewer-permission-retest-03.md) still created customers and drafts `INV-20261012-0002` / `INV-20261012-0003` as Viewer. BUG-0003 and BUG-0004 remain open. Deployed identity was unknown on those runs.
- Intended before/after behaviour with a concrete example:
  - Viewer (primary job) could still Save customer / Save draft after `85bb2f3` if extra-job grants, copied write rows, or allow-overrides were present, and QA could not name the image.
  - After: `isReadOnlyJob` (primary/slug/legacy `viewer`) returns no writes; extra jobs are not merged into grants; `/parties/customers/new` and `/sales/invoices/new` stay on the permission card. Login and sidebar show `build <sha7>` from `NEXT_PUBLIC_BOOKONE_BUILD`.
- Existing behaviour that must remain correct: Owner/Admin/Sales still create customers and invoice drafts. Cashier POS walk-in (`ensureParty`) unchanged. Viewer still reads lists.
- Actual changed paths: `packages/auth/src/permissions/resolve.ts`, `load.ts`, `packages/auth/test/resolve.test.ts`, `apps/web/src/lib/access.ts`, `apps/web/src/app/actions/workspace.ts`, `apps/web/src/lib/build-id.ts`, login, shell, layout, `docker/Dockerfile.web`.
- Business rule/profile/scenario IDs: BUG-0003, BUG-0004, QA PR #5.
- Accounting, stock/rental, tenant/access and customer-data effects: Viewer cannot insert/archive party or document rows. No schema change. The LKR 100 archived-draft vs customer-balance observation is recorded, not changed here.
- Migrations: none.
- Dependencies, settings/flags, deployment: Docker build-arg `BUILD_DATE` is now `NEXT_PUBLIC_BOOKONE_BUILD` so the SHA is visible. Wait for **Docker web image** green, then Portainer Update Re-pull ON. Confirm login page shows a 7-char SHA, not `build dev`.
- Independent review: Team list shows primary job only plus “Also helps with”; extra Sales on a Viewer would explain invoice+customer writes. Hard deny ignores extra/overrides for a Viewer primary.
- Checks: `pnpm --dir packages/auth test`. Browser retest after GHCR pull; record the `build` stamp in the run.
- Next exact action: owner waits for Docker web image, Portainer Update Re-pull ON; QA records `build <sha>` then retries Viewer customer create and invoice Save draft.
