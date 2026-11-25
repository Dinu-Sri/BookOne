# CHG-20261125-coa-links-additive-push — company CoA names, per-host links, additive schema push (v2.17.6)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-25
- Product version (`VERSION` file) and base SHA / branch/PR: 2.17.6 pushed directly to `master` (owner-approved) from `6c870c6` / v2.17.5
- QA repository revision and companion PR/change ID: independent staging QA pending

## 1. Company chart of accounts kept personal names

- Before: web sign-up seeds every tenant with the personal pack (`packages/auth/src/session.ts` `ensureBookOneUser`). Onboarding as Company only inserted missing codes, so 8 shared codes kept personal names: 1100 Bank Account, 6100 Rent & Housing, 6200 Utilities, 6300 Food & Household, 6400 Transport, 6500 Healthcare, 6600 Education, 6700 Insurance. Postings resolve by code, so on staging a ZZ-TEST Pvt Ltd company's "Office supplies" Simple Entry debited "6500 - Healthcare" and its P&L listed Healthcare/Food & Household/Education.
- After: `coaRenamesForEntity()` (`packages/accounting/src/coa-packs.ts`) returns renames to the target pack name for accounts that still carry a seeded name for that code and have no journal lines. `completeEntityOnboarding` applies them. Migration `052_company_coa_names.sql` repairs existing company tenants with the same rule (idempotent, runs each start). User-renamed or posted accounts never change; journal lines reference `account_id`, so history is unaffected.
- Tests: `packages/accounting/test/coa-packs.test.ts` (7) incl. a lock that the SQL VALUES equal the computed clashes.
- Not changed: the category inferrer still targets company-pack codes, so a personal/sole workspace typing "office supplies" still lands on its 6500 "Healthcare". Separate follow-up.

## 2. Absolute links used AUTH_URL host

- Before: on `staging.clossyan.com`, team invite links, document print QR/public links, the purchase-inbox logged-out redirect, and the docs "Open app" link pointed at `bookone.clossyan.com` (different cookie, so a signed-in user looked signed out).
- After: `publicOrigin()` (`apps/web/src/lib/public-origin.ts`, pure core in `public-origin-core.ts`) returns the request host only when it matches a configured origin (`AUTH_URL`, `BETTER_AUTH_URL`, `APP_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`), with the configured https scheme; otherwise the primary origin. Unknown Host headers are never trusted (no forged invite domains). Docs "Open app" is relative `/` (docs are served by the same app).
- Tests: `packages/auth/test/public-origin.test.ts` (6), incl. a source lock that the four builders no longer read `AUTH_URL` directly.
- Unchanged on purpose: AgentBridge OAuth issuer/metadata keep `AGENT_BRIDGE_PUBLIC_URL`/`AUTH_URL` (one stable issuer).

## 3. Startup push rebuilt RLS, policies, indexes every boot

- Finding (staging, `drizzle-kit push --verbose --strict` in the web container, answered "No, abort"; nothing applied): every start `push --force` ran 92 `DROP POLICY … CASCADE`, 92 `ALTER TABLE … DISABLE ROW LEVEL SECURITY`, 91 `DROP INDEX`, 35 `DROP CONSTRAINT`, 33 `ADD CONSTRAINT … FOREIGN KEY`. drizzle-kit 0.31 diffs RLS/policies/indexes that live only in SQL migrations; step [2/3] then recreated them. Violates "schema changes are additive only"; a failed migration would leave RLS disabled.
- After: `db:migrate` runs `packages/db/scripts/push-additive.ts`: drizzle-kit `pushSchema()` (node-postgres driver, because the API reads `.rows`) + `filterAdditive()` (`packages/db/src/push-filter.ts`). Applies only CREATE TABLE/TYPE/SCHEMA/SEQUENCE/INDEX, ADD COLUMN, ADD VALUE, and constraints on tables created in the same run. Logs a count of skipped statements by kind. Refuses to run if introspection looks empty while `tenants` exists. Output keeps "Changes applied"/"No changes" for the entrypoint. Manual full diff: `pnpm --filter @bookone/db db:push:full` (strict, prompts).
- Dependency: `pg` + `@types/pg` added to `@bookone/db`.
- Tests: `packages/auth/test/push-filter.test.ts` (4) incl. lock that `db:migrate` never uses `--force`.

## Common

- Accounting, stock/rental, tenant/access and customer-data effects: CoA renames on unposted, unrenamed accounts of company tenants only. RLS/policies are no longer dropped at startup.
- Migrations: new `052_company_coa_names.sql` (idempotent UPDATE). No schema change.
- Checks executed (local, Windows 11, Node 22): `pnpm typecheck` exit 0; `pnpm test` 693 passed (accounting 284, auth 183 + 5 skipped, agent-bridge 158, statement-import 44, commerce 24); push script loads under tsx and typechecks.
- Not run locally: push-additive against a real database (no local Postgres). Verify on staging: entrypoint `[1/3]` shows `[push-additive] skipped N …` and "No changes"; `pg_policies` count unchanged across a restart; a new company sign-up gets company names.
- Rollback: revert this commit; `052` only renamed unposted accounts.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS.
- Next exact action: redeploy staging and verify the three items above.

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.

## UI/UX impact and existing-design compatibility

No components or CSS changed. Visible effect: account names on Chart of Accounts/P&L for company tenants, and link hosts. Existing screens render the new names unchanged.

## Follow-up v2.17.7 — entrypoint still called drizzle-kit directly

Staging v2.17.6 log `[1/3]` still showed `No config path provided, using default 'drizzle.config.ts'` and no `[push-additive]` lines: `docker/entrypoint.sh` calls `pnpm --dir packages/db exec drizzle-kit push --force` directly, not `db:migrate`. v2.17.7 switches the entrypoint to `pnpm --dir packages/db exec tsx scripts/push-additive.ts` and `packages/auth/test/push-filter.test.ts` now locks the entrypoint command. Migration 052 and the link changes were already live in v2.17.6. `scripts/coreguard/run.ts` keeps a full push (throwaway test database).
