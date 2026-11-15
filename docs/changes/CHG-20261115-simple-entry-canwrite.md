# CHG-20261115-simple-entry-canwrite — pass Simple Entry write from the server home page (v2.5.30)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-11-15.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.5.30 on `fix/v2530-simple-entry-canwrite` from origin/master `ba840d008051d8753b6c921ef1b674dd6478cc0b` / tree `bfcae2f1c1ff44c5aedd1c87ed4627467cf564a5` (v2.5.29). Owner asked this candidate to be pushed to master for the Docker web image Action after v2.5.29 failed compile.
- QA repository revision and companion PR/change ID: Mission1 frozen QA `24534f7b95901dba29ef933fa3c3d5045c107d05`. Follow-up to [CHG-20261115-mission1-grouped](CHG-20261115-mission1-grouped.md). Do not replay CONT11 or the original POS 118 refund.
- Intended before/after behaviour with a concrete example:
  - v2.5.29 `next build` failed: client Simple Entry imported `@/lib/access`, which uses `next/headers`.
  - Home server page now computes `jobCanWrite(tenant, 'Simple Entry')` and passes `canWrite`. Viewer still sees “Read-only — this job cannot record entries.” Owner still sees Record. Direct `recordEntry` remains permission-gated on the action.
- Existing behaviour that must remain correct: register write `company.sales_settings.write`; payment two-decimal batch; purchase VAT preview 21.60/141.60; VAT memo `18%`; QT/SO informational tax treatment; Reports VAT summary; POS linked-return 118; tenant/location predicates.
- Actual changed paths/symbols/routes:
  - `apps/web/src/app/page.tsx` — `canWrite={jobCanWrite(tenant, 'Simple Entry')}`.
  - `apps/web/src/components/simple-entry/simple-entry-screen.tsx` — `canWrite` prop, default false; no `@/lib/access` import.
  - `packages/auth/test/pos-register-write-auth.test.ts` — asserts the policy string on the server home page.
- Business rule/profile/scenario IDs: Mission1 P1 Simple Entry Record gate.
- Accounting, stock/rental, tenant/access and customer-data effects: none. UI capability only.
- Migrations, schema/history compatibility and recovery implications: **none**.
- Dependencies, settings/flags, deployment and external-service changes: none. Quote `v2.5.30 · <sha7>` after Docker web image is green and Portainer Update with Re-pull ON.
- Independent diff/impact review and uncertainties: compile-only follow-up. Isolated PostgreSQL/HTTPS of live actions still not-run.
- Checks executed: `@bookone/auth` vitest `pos-register-write-auth` 6 passed. Local `apps/web` `next build` compiled (the v2.5.29 `next/headers` error is gone). Isolated runtime and live browser not-run.
- Failed/skipped/flaky/blocked/not-run checks and reasons: live browser, isolated runtime, mixed-TENDER, backup LAST.
- New QA assertions or outstanding work: Mission2 retests Viewer Simple Entry Record omitted. Do not reopen POS 118.
- Created staging records/cleanup, if any: none.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS.
- Next exact action and responsible role: Owner deploys via Docker web image then Portainer Re-pull ON. Independent Medium review of v2.5.29+v2.5.30. Recovery LAST. BookOne is not customer-ready.

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references: Simple Entry submit bar (`entry-submit-bar`), `party-hint`. No second design system.
- Exact external QA commit and ux/workbook.json: Mission1 frozen `24534f7`. UXW-002 truthful totals/outcome.
- Before/after: Viewer Record omitted; Owner Record present. Compile succeeds.
- Direct screens: `/`.
- Preserved field/line/source identity: Simple Entry form fields unchanged.
- Desktop/narrow/keyboard/reader evidence: not run in this engineering session.
- Exact and adjacent regressions: company sales `jobCanWrite`; invoice Archive `canWrite`.
- Conflict/exception: none.
- Small rollout: revert this commit; no schema.
- QA companion: Mission2 after owner deploy.
