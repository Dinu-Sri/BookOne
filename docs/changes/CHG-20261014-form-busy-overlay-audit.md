# CHG-20261014-form-busy-overlay-audit — Stop overlay from auto-arming on every submit (v2.5.3)

Status: shipping on master.

- Author/agent and date: Grok coding agent, 2026-10-14.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.5.3 on `master` after `e703c34`.
- QA repository revision and companion PR/change ID: follow-up to [CHG-20261014-form-busy-overlay-stuck](CHG-20261014-form-busy-overlay-stuck.md).
- Intended before/after behaviour with a concrete example:
  - Before: `FormBusyGuard` listened to every document `submit`. GET filters (Transactions search, same pathname), convert-to-invoice raw buttons, reset-password, Control Room save, and ops-log unlock could leave **Working… please wait** up until 45s or a real route change.
  - After: Overlay turns on only from `withFormPending` or shared `Button type="submit"` `useFormStatus`. Safety-clear still at 45s and on pathname change. Agents must follow AGENTS.md **Form busy overlay**.
- Existing behaviour that must remain correct: backup/restore, reverse, login, posting, RLS. POS / rental / recon / statement-import wizards keep their local spinners (they never armed the global overlay).
- Actual changed paths/symbols/routes: `withFormPending` in `form-busy.tsx` (document `submit` listener removed); client writes wrapped in backup, login, reset-password, simple-entry, cashbook home/settings, receive-payments, pay-vendors, recon compare, period-close, Control Room company form, onboarding, ops log gate; convert-document menu uses shared `Button`.
- Business rule/profile/scenario IDs: overlay is client pending UX. Filter GET forms must stay instant.
- Accounting, stock/rental, tenant/access and customer-data effects: none.
- Migrations, schema/history compatibility and recovery implications: none.
- Dependencies, settings/flags, deployment and external-service changes: Portainer Re-pull ON after Docker web image. Quote `v2.5.3 · <sha7>`.
- Independent diff/impact review and uncertainties: ~70 `<form>` sites audited. Server-action forms with shared `Button` still show overlay via `useFormStatus`. Raw POS search buttons stay local.
- Checks executed: 2026-10-14 local Windows. `pnpm --dir apps/web lint` (tsc) green.
- Failed/skipped/flaky/blocked/not-run checks and reasons: live overlay check waits for GHCR + Portainer Re-pull ON (v2.5.2 image may still be running).
- New QA assertions or outstanding work: overlay disappears after backup, reverse, login, invoice save, transactions filter. Convert-to-invoice still works from the row menu.
- Created staging records/cleanup, if any: none.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, AGENTS.md Form busy overlay, `.claude/CLAUDE.md`.
- Next exact action and responsible role: Docker web image, Portainer Update Re-pull ON; confirm `v2.5.3 · <sha7>`.
