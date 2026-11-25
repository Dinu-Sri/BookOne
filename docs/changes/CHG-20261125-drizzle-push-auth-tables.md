# CHG-20261125-drizzle-push-auth-tables — stop drizzle-kit push dropping Better Auth tables (v2.17.4)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-25
- Product version (`VERSION` file) and base SHA / branch/PR: 2.17.4 pushed directly to `master` (owner-approved) from `debf4f6` / v2.17.3
- QA repository revision and companion PR/change ID: independent staging QA pending
- Intended before/after behaviour with a concrete example: **Incident.** After v2.17.3 (drizzle-kit 0.24 → 0.31) deployed to staging, `docker/entrypoint.sh` step `[1/3]` ran `drizzle-kit push --force`, which printed `[✓] Changes applied`. Step `[2/3]` then ran `005_better_auth_and_company_domains.sql`; Postgres logged `relation "company_domains" already exists` but no such notice for any `auth_*` table, i.e. they had been dropped and were recreated empty. Read-only check in the staging Postgres container: `auth_users` 0, `auth_accounts` 0, `auth_sessions` 0, `auth_members` 0, while `users` 10 and `tenants` 13. The seven Better Auth tables (`auth_users`, `auth_sessions`, `auth_accounts`, `auth_verifications`, `auth_organizations`, `auth_members`, `auth_invitations`) are created only by SQL migration 005 and are not declared in `packages/db/src/schema`, so push saw them as extra and `--force` approved dropping them. After this change `drizzle.config.ts` sets `tablesFilter: ['*', '!auth_*']`, so push neither inspects nor drops them; every Drizzle-declared table is still pushed
- Existing behaviour that must remain correct: push still creates/alters every table in `src/schema`; SQL migrations still run in `[2/3]`; Better Auth reads/writes `auth_*`; BookOne `users`/`tenants` mapping by email in `packages/auth/src/session.ts` `ensureBookOneUser`
- Actual changed paths/symbols/routes: `packages/db/drizzle.config.ts` (`tablesFilter`); new `packages/auth/test/drizzle-push-table-filter.test.ts`
- Business rule/profile/scenario IDs: none
- Accounting, stock/rental, tenant/access and customer-data effects: none from this change. The v2.17.3 incident lost staging Better Auth credentials, sessions, organization/member/invitation rows only. BookOne `users`, `tenants`, memberships and all accounting data are intact. Users regain access by signing up again (or Google sign-in) with the same email, which re-links via `ensureBookOneUser`
- Migrations, schema/history compatibility and recovery implications: no new migration. No backup of staging `auth_*` exists in the stack (no pg_dump service), so lost rows cannot be restored. Production (bookone.lk) is not deployed yet and must not receive v2.17.3 without this fix
- Dependencies, settings/flags, deployment and external-service changes: none. Owner Portainer Re-pull ON after Docker web image is green
- Independent diff/impact review and uncertainties: drizzle-kit 0.31 `tablesFilter` negation verified in its source (`Minimatch` with `negate`: a table is kept only when every matcher agrees). Why 0.24 did not drop these tables was not established. Removing `--force` from the entrypoint would be a stronger guard but changes startup behaviour; left for a separate decision
- Checks executed (Windows 11, Node 22, pnpm 9.0.0, local, no database):
  - `vitest run test/drizzle-push-table-filter.test.ts` — 3 passed; with the `tablesFilter` line removed it fails listing all 7 `auth_*` tables
  - `pnpm --filter @bookone/auth test` — 173 passed, 5 skipped
  - `pnpm --filter @bookone/db --filter @bookone/auth typecheck` — exit 0
- Failed/skipped/flaky/blocked/not-run checks and reasons: push against a real database with the filter not yet observed; verify on staging after redeploy
- New QA assertions or outstanding work; changed expectations and owner decision: after redeploy, sign up a staging account, restart the web container, confirm the account still signs in and `auth_users` count is unchanged. Consider a scheduled pg_dump for staging and removing `--force`
- Created staging records/cleanup, if any: none
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: Owner redeploys staging; agent verifies `auth_*` survive a restart

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.

## UI/UX impact and existing-design compatibility

Not applicable: config and test only. No components, CSS or routes changed.
