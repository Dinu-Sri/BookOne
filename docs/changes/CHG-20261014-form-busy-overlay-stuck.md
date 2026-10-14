# CHG-20261014-form-busy-overlay-stuck — Clear stuck “Working… please wait” overlay (v2.5.2)

Status: shipping on master.

- Author/agent and date: Grok coding agent, 2026-10-14.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.5.2 on `master` after `4951bce`.
- QA repository revision and companion PR/change ID: follow-up to overlay seen after Company backup on v2.5.1 (`4951bce`). Same overlay after Reverse and sometimes after Login.
- Intended before/after behaviour with a concrete example:
  - Before: Create backup finishes (pair id and download links on screen) while “Working… please wait” stays up. Reverse and login can leave the same overlay. Web container logs are clean because the server already finished. `/ops/logs` client-timing never records a stuck overlay (it only POSTs when pending turns off after ≥2s).
  - After: Overlay appears after 1.5s of real work, then clears when the action finishes, the route changes, the submit button unmounts, or 45s elapses. Backup/login/restore/simple-entry/cashbook client posts emit pending on/off themselves. Native server-action submits (Reverse) still use `useFormStatus`.
- Existing behaviour that must remain correct: backup encrypt/download, restore empty-gate, reverse journal, login/session, RLS, posting.
- Actual changed paths/symbols/routes: `FormBusyGuard` / `emitFormPending` in `apps/web/src/components/ui/form-busy.tsx`; submit `Button` unmount cleanup in `bookone-ui.tsx`; `BackupClient` / `RestoreClient` / `FilesRestoreClient`; login `handleSubmit`; simple-entry `handleSubmit`; cashbook `submit`.
- Business rule/profile/scenario IDs: overlay is client pending UX only. Backup pair already created when the overlay stuck on `/company/backup`.
- Accounting, stock/rental, tenant/access and customer-data effects: none.
- Migrations, schema/history compatibility and recovery implications: none.
- Dependencies, settings/flags, deployment and external-service changes: Portainer Re-pull ON after Docker web image. Quote `v2.5.2 · <sha7>`.
- Independent diff/impact review and uncertainties: `FormBusyGuard` lives in the root layout, so it survives `router.push`. Capture `submit` previously set pending true for `preventDefault` + fetch forms that never emitted false. Next.js intercepts server-action submits; Reverse overlay then depends on `useFormStatus` plus unmount cleanup.
- Checks executed: 2026-10-14 local Windows. `pnpm --dir apps/web lint` (tsc) green.
- Failed/skipped/flaky/blocked/not-run checks and reasons: no live staging mutation in this change. `/ops/logs` is HMAC-gated (`OPS_LOG_SECRET`); this agent cannot open it. Stuck overlay would not have appeared there on v2.5.1.
- New QA assertions or outstanding work: after Create backup, overlay disappears and download links stay usable. Reverse and Login do not leave the overlay up after the page is ready.
- Created staging records/cleanup, if any: none.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS.
- Next exact action and responsible role: Docker web image, Portainer Update Re-pull ON; confirm `v2.5.2 · <sha7>`; retry Create backup, Reverse, Login.
