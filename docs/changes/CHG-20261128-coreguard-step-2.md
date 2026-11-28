# CHG-20261128-coreguard-step-2 — CoreGuard Step 2: database guards

Status: blocked on owner actions before merge (staging preflight, B4). Code complete; PR open.

- Author/agent and date: Claude Code (Opus 5.5), 2026-11-28.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.35.3 → **2.36.0** (minor: new Closed months screen); base `69690ad`; branch `coreguard/step-2-guards`; one PR per step (guide §1.1).
- QA repository revision and companion PR/change ID: BR-6 ("a closed month can be reopened only with a reason, and the reopening is logged", guide §6.11) is to be added in bookone-qa with a RULE_CHANGE record — **not done in this session** (see "Not done").
- Intended before/after behaviour with a concrete example:
  - Before: the books were protected only by app code. An entry of Dr 100.00 / Cr 99.99 written by any code path, a DELETE of a journal line, or a posting dated in a locked month could be stored.
  - After: PostgreSQL refuses all three and rolls the whole transaction back (G01, G04, G05). The user sees "This entry doesn't balance, so nothing was saved." / "Posted entries can't be changed. Post a reversal instead." / "This month is closed. Reopen it (with a reason) or use an open date.", and `/ops/logs` gets the original message with status `COREGUARD Gxx`.
  - New screen **Accounts → Closed months** (`/accounts/months`): close a month; reopen a closed month only with a reason.
- Existing behaviour that must remain correct: every correct posting still posts (Step 1 made the writers atomic and exact); reversals (`reversed_by` set once); period close is idempotent; archive restore into an empty company; tenant isolation (RLS) unchanged.
- Actual changed paths/symbols/routes: listed per guide item below.
- Business rule/profile/scenario IDs: BR-6 (guide §6.11).
- Accounting, stock/rental, tenant/access and customer-data effects: guards refuse inconsistent writes; no existing data is changed by the migrations. `061` creates two unique indexes that fail if duplicates already exist, hence the preflight.
- Migrations, schema/history compatibility and recovery implications: `060`–`063` are additive and safe to re-run (applied twice in every test run). Archive restore now needs `MAINTENANCE_DATABASE_URL` (owner action B4); until it is set, data restore shows "Restoring a backup is not set up on this server yet. Ask the platform administrator."
- Dependencies, settings/flags, deployment and external-service changes: new env `MAINTENANCE_DATABASE_URL` (compose staging/prod, `.env.example`); new workspace package `@bookone/coreguard` (vitest, postgres).
- Codebase Memory MCP: not available in this session; discovery used grep.

## Guide Step 2 files — what was done

| Guide item | Done |
| --- | --- |
| `packages/db/migrations/060`–`063` from Appendix A | Copied byte-for-byte from `coreguard-implementation-pack/sql/` after a script confirmed those files are identical to Appendix A in the guide (all 8 files `060`–`067` identical). Unchanged. |
| `packages/db/src/coreguard-tables.ts` | New: `pgSchema('coreguard')` read definitions of the `060` tables. Not exported from `src/schema/index.ts`. |
| `packages/db/src/maintenance-db.ts` | New: `maintenanceDb()` (+ `maintenanceSql()`, `closeMaintenanceDb()`), throws without `MAINTENANCE_DATABASE_URL`. Adapted: no `server-only` import, because `scripts/coreguard/seed.ts` (run with tsx) uses it. Inside `maintenanceDb().transaction`, `db()` is the maintenance transaction (Step 1 ambient transaction). |
| `packages/db/src/archive/restore.ts` | Data restore runs in `maintenanceDb().transaction`; first statement `SET LOCAL bookone.ledger_maintenance = 'archive_restore'`, then the tenant setting; the advisory lock moved onto the same transaction. Files restore is unchanged (it writes no guarded table). |
| `scripts/coreguard/seed.ts` | Cleanup is one maintenance transaction starting with `'coreguard_cleanup'`. Adapted: the pilot only targets allowlisted local test DBs whose login is a superuser (member of every role), so it uses `DATABASE_URL` as the maintenance login when `MAINTENANCE_DATABASE_URL` is unset. |
| `scripts/init-db.ts` | `boot_id` per start; each file's outcome (`applied`/`skipped`/`failed`) inserted into `coreguard.migration_runs` in its own try/catch. |
| `scripts/coreguard/run.ts` | Pilot schema step now runs `packages/db/scripts/push-additive.ts` (same as production), not `drizzle-kit push --force`. `docs/coreguard/PILOT.md` updated. |
| Period locks via `coreguard.lock_period` / `unlock_period` | `reconciliation.ts → lockPeriod` now calls `coreguard.lock_period` in `db().transaction` inside the tenant context (check-then-insert removed). New `period-close.ts → closeMonth / reopenMonth / listMonthLocks`. No other code creates or removes period locks. |
| "Reopen requires a reason field in the UI" | Adapted: the app had **no** period-close screen (the reconciliation lock card `PeriodCloseControls` was removed from the page in 7f82e23 and is unused). New `/accounts/months` screen (linked from Accounts → "Closed months"): close a month (confirm dialog), reopen with a required reason (`askText`, 3–500 characters, enforced on the server and by `unlock_period`). |
| Remove app period checks that duplicate G05 | Removed: `assertOpenPeriod` in `commercial-docs.ts` (3 calls), `documents.ts` (3), `inventory.ts` (1), `rental-money.ts` (3); `assertPeriodUnlocked` in `post-balanced-journal.ts` and its callers in `advances.ts` (2) and `opening-balances.ts` (1); the two inline queries in `record-entry.ts`. Kept: `workspace.ts → isPeriodLocked()` (read-only UI hint, the Locked badge on Transactions). Adapted: `workspace.ts` had no write-path check, only the UI helper. **Kept on purpose:** the pre-check in `statement-import.ts` (creates bank entries one by one, so it prevents a half-finished import; G05 still guards each posting). |
| `apps/web/src/lib/coreguard-errors.ts` + shared handler | New `coreguard-error-map.ts` (pure, tested) and `coreguard-errors.ts → userMessageForError(error, fallback)`: guard errors → the §4.4 message and an `/ops/logs` row (`status = COREGUARD Gxx`, original message); unknown COREGUARD codes and `cg_*` unique-index violations → the generic message; other errors keep their message. Adapted: BookOne has no single shared server-action error handler, so it replaces `e instanceof Error ? e.message : '…'` in the catch blocks of every ledger-writing action file (commercial-docs 9, documents 4, inventory 4, record-entry 2, entity-lifecycle 4, rental-money 3, rental-bookings 4, advances 2, opening-balances 2, bank-reconciliation 25, statement-import 12, pos-session 6, reconciliation, period-close). |
| `docs/KNOWN_ERRORS.md` | New section listing G01–G11 + generic, meaning and user message. |
| `packages/coreguard/` skeleton + `guards.postgres.test.ts` + `flows.postgres.test.ts` | New package `@bookone/coreguard` 2.0.0. Each suite creates its own scratch DB (`cg_guards_test`, `cg_flows_test`), loads `test/fixtures/base_real.sql` (copied from the pack) and `060`–`063` **twice**, creates non-superuser logins `cg_test_app` and `cg_test_maint` (in `coreguard_maintenance`), and runs each case on a fresh connection like `psql -c`. 49 Part 1 cases + C1 + 5 A5 = **55 cases**, expected values exactly as `run_guards.sh` / `run_flows.sh`. Runs when `COREGUARD_REQUIRE_POSTGRES=1` or in GitHub Actions with `DATABASE_URL`. Adapted (A5 timeout case): the reference sends the timeout and the error recording as one `psql -c` string, which the timeout aborts; the port runs the worker's protocol (§6.8.2) one statement at a time on one connection, and also asserts that the timeout happened and outcome `error` was recorded. Expected outcome unchanged ("open\|true", still red). First CI run (27af645): 55/56 passed (guards 50/50 incl. the count check; flows 5/6); this case failed in the harness (postgres.js `begin()` rejected after the caught timeout), fixed in the test, not in SQL. |
| `scripts/coreguard/preflight-062.sql` | New (from the pack; same query as the guide). |
| `scripts/coreguard/backfill-fingerprints.sql` | New (from the pack; same as the guide). |
| Compose + `.env.example` | `MAINTENANCE_DATABASE_URL=${MAINTENANCE_DATABASE_URL:-}` on the web service in `docker/docker-compose.staging.yml` and `docker/docker-compose.prod.yml`; placeholder in `.env.example`. |
| `scripts/coreguard/create-db-logins.sql` | New: the §6.9 commands verbatim with `<password>` placeholders and a header for the operator. |

Other changes needed by the above:
- `packages/db/drizzle.config.ts`: `tablesFilter` excludes `ledger_operations` (SQL-only table created by `060` in `public`), so push-additive never treats it as extra.
- `packages/auth/test/drizzle-push-table-filter.test.ts`: the SQL-table scan now skips non-`public` schemas (it read `coreguard.bypass_log` as a table named `coreguard`; drizzle-kit pulls only `public`). The check itself is unchanged.
- `scripts/coreguard/ledger.ts` (pilot): `postBalanced` wrote transaction, entry and lines as separate autocommitted statements — G07/G09 would refuse that. Now one `sql.begin` transaction, exact cents. (App fix per guide §1.4, not a guard change.)
- `.github/workflows/docker-web.yml`: new step "CoreGuard database guards and flows (Step 2, 55 cases)" in the CoreGuard job. The PR's Production Check "Tests" job also runs them (GitHub Actions + `DATABASE_URL`).
- `packages/auth/test/coreguard-errors.test.ts`: the error contract (5 tests).

## Step 2 "Done when" (guide §5)

| Item | Status |
| --- | --- |
| The preflight showed 0 duplicates, and the fingerprint backfill ran on staging | Preflight **done 2026-11-28** (owner allowed Portainer access): read-only transaction on `bookone-staging-postgres` → "transactions with more than one live journal entry" **0**, "months with more than one active lock" **0**; active period locks: 0 (so the backfill will insert 0 rows). Backfill: pending deploy. |
| The 55 Step 2 cases pass in CI | Pending CI on the PR (no local PostgreSQL/Docker engine on this machine). |
| `pnpm test`, `pnpm coreguard:pilot` and the Playwright lane pass | Local `pnpm test`: all packages pass except two load-dependent `@bookone/auth` timeouts (`ui-02-lint` this run) that pass alone (6/6). Pilot + Playwright: pending the "Docker web image" run on the branch. |
| Manual smoke test on staging (invoice, payment, Simple Entry + reversal, close month + refused posting, reopen with reason, archive restore into an empty company) | **Pending deploy** (after merge and the owner's B4, since restore needs `MAINTENANCE_DATABASE_URL`). |
| Any guard rejection found during this work was fixed in the app, never in the guard | So far one: the pilot's own `ledger.ts` posting was non-atomic (fixed in the app). Guards untouched. |

## Not done / open

- BR-6 RULE_CHANGE in bookone-qa (guide §6.11 says before the step): not created in this session.
- UI evidence for `/accounts/months` at 1920 / 1366×768 / 768×1024: not captured (no local database to run the app). To do on staging after deploy.

## CoreGuard impact (required when the diff touches the financial surface)
- Financial surface files touched: `packages/db/migrations/06[0-3]_coreguard_*.sql`, `packages/db/src/archive/restore.ts`, `scripts/init-db.ts`, `scripts/coreguard/**`, `packages/coreguard/**`, `apps/web/src/lib/post-balanced-journal.ts`, `apps/web/src/app/actions/{commercial-docs,documents,inventory,record-entry,entity-lifecycle,rental-money,rental-bookings,advances,opening-balances,bank-reconciliation,reconciliation,statement-import,pos-session}.ts`.
- Behaviour before → after (one example in LKR): Dr 100.00 / Cr 99.99 is refused by the database (G01); posting LKR 5.00 dated 31 January after January is closed is refused (G05).
- Guards/checks that cover this (IDs): G01, G02, G03, G04, G05, G06, G07, G09; close/reopen protocol (`lock_period`, `unlock_period`); findings bookkeeping (`record_check_result`, `tenant_status`).
- Guards/checks added or changed (ID, revision, severity), or "none — covered by: …": added G01–G07, G09 (migrations 062/063, unchanged from Appendix A). No sentinel checks yet (Step 3).
- Golden events added/changed (scenario@version, event IDs); expected values supplied by (name, date): none.
- Properties added/changed: none.
- Red evidence (lab output showing the new rule failing before the implementation): the pack's reference run (`coreguard-implementation-pack/test/result_guards.txt`, `result_flows.txt`) plus the CI run of the 55 ported cases on this branch (link in the PR). Before `060`–`063` the same cases fail (no `coreguard` schema).
- Green evidence (lab run on the final commit; certificate status): CI on the PR head; no certificate yet (Step 6).
- Waivers used (CGW-…, expiry): none.
- CoreGuard version: none → 2.0.0 (`packages/coreguard/package.json`).

## UI/UX impact and existing-design compatibility

- New screen `/accounts/months` built from the calm-screen kit (`ux-page`, `ux-head`, `ux-split`, `ux-card`, `ux-rows`, `ux-empty`, `ux-guide`) and registry controls (`SelectField`, `Button`, `Badge`, `askConfirm`, `askText`, `withFormPending`). Entry point: "Closed months" secondary link in the Accounts toolbar (next to Opening balances). No sidebar change.
- Rule book checklist: [x] one purpose sentence, one primary action (Close month) · [x] plain words ("Close month", "Reopen", "Closed", "Reopened"; no ids/enums) · [x] sentence case · [x] only applicable actions (Reopen only on closed months, close only for open months; read-only users see the list) · [x] status in words + Badge tone · [n/a] sums · [x] empty and error states say what to do · [x] nothing posted for the user · [x] no browser pop-ups (BookOne dialogs) · [ ] checked at 1920, 1366×768, 768×1024 — pending staging · [x] registry controls only.
- External QA/UX refs: none yet (pending bookone-qa companion).
