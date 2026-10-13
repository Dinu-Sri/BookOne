# CHG-20261013-reserved-drizzle — reserved postgres client for Drizzle

Status: shipping on master (v2.2.4).

- Author/agent and date: Grok coding agent, 2026-10-13.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.2.4 on `master` after `0d902d5`.
- QA repository revision and companion PR/change ID: live staging report after v2.2.3 Portainer pull (empty module screens; dashboard `parsers` TypeError). Continues BUG-0014 connection pinning.
- Intended before/after behaviour with a concrete example:
  - After v2.2.3, login showed module groups (Purchase, Sales, …) with no child screens, and the web log repeated `TypeError: Cannot read properties of undefined (reading 'parsers')` on `app/page.js`. `loadAccessForUser` failed closed so every screen was `none`.
  - Cause: `postgres.js` `reserve()` returns a tagged Sql without pool `options`. `drizzle(reserved)` reads `client.options.parsers`.
  - After: the reserved client gets the pool `options` plus `begin`/`savepoint` on that same connection. Access loads, module screens return, Simple Entry runs. RLS still uses one reserved connection. No BYPASSRLS grant.
- Existing behaviour that must remain correct: F-010 named dates; B-104 signed P&L; F-008 receipt keys; RT-006 one reversal; payment denials B-007/B-011; init-db “already exists, skipping” notices.
- Actual changed paths/symbols/routes: `adaptReservedForDrizzle`, `drizzleOn`, `loadAccessForUser` error log.
- Business rule/profile/scenario IDs: BUG-0014 follow-up (dashboard/nav after reserved drizzle).
- Accounting, stock/rental, tenant/access and customer-data effects: none to journals. Access load works again so nav is not empty.
- Migrations, schema/history compatibility and recovery implications: none. `038`/`039`/`040` “already exists, skipping” is expected on a live DB.
- Dependencies, settings/flags, deployment and external-service changes: Portainer Re-pull ON after Docker web image. Quote `v2.2.4 · <sha7>`.
- Independent diff/impact review and uncertainties: `db().transaction` inside `withTenantContext` now uses reserved `BEGIN`/`COMMIT`/`ROLLBACK` instead of pool `sql.begin()`. Nested savepoints use named SAVEPOINT on the same connection.
- Checks executed: `pnpm lint` pass; `pnpm typecheck` pass; `pnpm test` pass (auth 15 including 3 reserved-drizzle, accounting 71, statement-import 30 passed / 4 skipped); `pnpm build` pass (Next.js compiled, 127 static pages).
- Failed/skipped/flaky/blocked/not-run checks and reasons: no live staging mutation from this agent.
- New QA assertions or outstanding work: confirm module children on login; dashboard without `parsers` TypeError; retest F-010, B-104, F-008, RT-002, RT-004, RT-006 on `v2.2.4`.
- Created staging records/cleanup, if any: none.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, KNOWN_ERRORS.
- Next exact action and responsible role: wait for Docker web image, Portainer Update Re-pull ON; operator confirms `v2.2.4 · <sha7>` and module screens.
