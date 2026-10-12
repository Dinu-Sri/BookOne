# Coding-agent instructions: remove inbuilt testing after external QA migration

Owner direction, 2026-10-11: use https://github.com/Dinu-Sri/bookone-qa as the canonical testing system and clean test-only environments, code, interfaces and deployment wiring from BookOne.

**Status 2026-10-12:** Wave 0 inventory and Wave 1a QA denial tests are done. Wave 1b on branch `chore/remove-inbuilt-e2e` removes the product runner, `/e2e`, `/api/e2e/**`, e2e Docker, and inbuilt catalog. Operator still must stop `bookone-staging-e2e` and the `bookone-e2e.clossyan.com` tunnel. Do not merge to `master` until the cleaned candidate is reviewed. See [CHG-20261012-remove-inbuilt-e2e](changes/CHG-20261012-remove-inbuilt-e2e.md).

## Desired final state

BookOne ships ERP behaviour and operational readiness, with a small external-QA integration contract. The QA repository owns browser/unit/integration tests, scenario catalogs, fixtures, runner tooling, bug history and run evidence. BookOne must not host the old public E2E console, run APIs or test-result downloads after the cleanup is accepted.

Read AGENTS.md and docs/QA_CHANGE_CONTRACT.md. Create a CHG record for cleanup. Work on a branch and inspect the current revision; this inventory was taken at `d35ed9209852af3fbcfe140176f2f8e74cae15f7` and can become stale.

## 1. Prove preservation before deleting

- Inspect the QA repository's `migration/source-inventory.json`, imported tests/catalog, `STATUS.md`, and latest validation run. Record exact QA and product SHAs.
- Account for all existing test files, assertions, fixtures, scenario IDs, scripts and useful reports. The initial extraction deliberately excludes the public HTTP runner and several machine-specific/browser audit scripts from active execution; their original paths and source hashes remain in the inventory. Port needed behaviour or record a reviewed retirement decision before deleting its only usable implementation.
- Confirm external unit tests exercise a pinned product checkout; external browser tests target the matching application build. Test discovery is not execution.
- Resolve E2E scenarios that currently expect `/e2e` and `/api/e2e`: revise them to assert removal/denial where appropriate and test external tooling separately. Preserve old historical results rather than rewriting them as new passes.
- Do not drop financial/access assertions to achieve a green migration. Existing weak assertions are coverage gaps, not acceptable replacements for deep checks.

## 2. Candidate removals (trace references first)

| Surface | Paths at inventory revision | Required action |
|---|---|---|
| Embedded runner | `apps/e2e-runner/` | Remove once preservation and external execution requirements are met; remove HTTP console/server rather than republishing it in ERP |
| ERP test page | `apps/web/src/app/e2e/page.tsx` | Remove page/redirect; verify no navbar/docs links point to it |
| Runner APIs | `apps/web/src/app/api/e2e/**` | Remove start/status/buckets/report/log/download/failure routes; verify unauthenticated and authenticated requests cannot launch or retrieve tests |
| App test libraries | `apps/web/src/lib/e2e-runner.ts`, `e2e-report.ts` | Remove after caller discovery; retain unrelated helpers only if genuinely shared |
| Middleware/access exceptions | `apps/web/src/middleware.ts`, `apps/web/src/lib/access.ts` | Remove only E2E bypass, host diagnostic and redirect branches; retain unrelated auth/docs/static routing |
| Deployment | `docker/Dockerfile.e2e`, staging compose `e2e` service/profile/router | Remove E2E-only builds, ports, mounts, credentials, router/hostname references; keep ERP/docs/database/storage services |
| Environment | `.env.example`, compose, deployment templates | Remove obsolete `E2E_*`/`NEXT_PUBLIC_E2E_URL` from the product only where no longer used; record operator cleanup separately |
| Workspace/scripts | root package scripts, lockfile, workspace/build config, `.dockerignore`, `scripts/export-e2e-catalog.mjs`, `generate-e2e-scenario-catalog.mjs`, `rebuild-e2e-only.sh`, `smart-deploy.sh` | Remove test-only references/dependencies; regenerate lockfile with pinned package manager, review diff; do not delete shared build tools blindly |
| Unit tests | `packages/accounting/test/`, `packages/statement-import/test/` | Remove only after corresponding external tests run against product source; preserve accounting/parser implementation and production dependencies |
| QA documentation | `docs/E2E_*`, old agent commands and deployment docs | Replace with a short external-QA pointer; preserve authoritative product docs and the development change contract |

Use graph search/trace first. Search string references and configuration as a fallback. Enumerate files before removal; on Windows use checked literal paths within the repository, not string-built cross-shell recursive deletes.

## 3. Review separately: test-only ERP controls

The following are candidates requiring dependency and purpose review, not blanket deletion:

- `apps/web/src/app/actions/health-check.ts`, `control-room/health-check/page.tsx`, `components/control-room/health-check-panel.tsx`, schema `health-check.ts` and navigation entries: distinguish scenario-running/data-creating diagnostics from legitimate operational health/readiness.
- `apps/web/src/app/actions/rental-health.ts`: inspect whether it validates real rental business invariants used by application behaviour. Preserve business logic; relocate only test harness code.
- Company reset controls/actions (`reset-company.ts`, `company-reset-button.tsx`, `company-master-reset-button.tsx`): distinguish disposable staging helpers from owner-supported administration. Document dependency/permission impact; do not execute a reset merely to remove its UI.
- Demo seed routes/scripts, including `api/platform/seed-rental-demo/route.ts` and `scripts/seed-demo-*`: remove exposed test/demo entry points when replaced; keep legitimate initialization/chart-of-accounts/role seeding required by real signup/install.
- Test data/tables: **do not drop historical SQL migrations, production tables, audit records or existing data** as code cleanup. Preserve `019_health_check_staging.sql` and other applied migration files. Any later archival/decommissioning is a separate reviewed migration task.
- Keep runtime readiness, backup/restore capability, useful error monitoring, authorization and financial validation. They are product safeguards, not test clutter.

Do not remove all files containing “test”, “health”, “seed”, “reset”, “audit”, or “Playwright” by keyword.

## 4. Preserve change tracking and build integration

- Keep AGENTS.md, docs/QA_CHANGE_CONTRACT.md, docs/changes records/templates, and links to external QA.
- Update `.github/copilot-instructions.md`, `.claude/CLAUDE.md`, `.github/instructions/*` and `ai/start-session.prompt.md` so no active agent guide requires removed commands.
- Keep real failing install/build/typecheck/lint checks. Replace inbuilt QA execution with the trusted external gate; never substitute `echo success` or `continue-on-error` for the removed tests.
- External acceptance must pin product SHA, QA SHA, image/build, schema/config and fixtures. A skipped/missing/neutral required test must fail the final acceptance check. Configure branch/deployment enforcement with the owner; document if still advisory.

## 5. Validate the cleanup candidate

1. Fresh dependency install and product build/typecheck/lint; inspect failures, including pre-existing ones, without masking them.
2. Parse/render Docker Compose for the relevant profiles without destroying running services or volumes. Confirm no E2E image/service/route references remain in active product configuration.
3. Check login, static assets, docs, main navigation, and sales/purchase/inventory/rental/accounting flows; browser outcomes and data assertions come from external QA on the exact candidate.
4. Confirm former E2E endpoints return an intentional unavailable/denied response and cannot start runs or expose artifacts. Verify remaining API/auth middleware still works.
5. Compare scenario inventories, execute the migrated unit tests, and execute required external critical regressions. Preserve passed/failed/skipped/blocked counts and known inherited weaknesses.
6. Confirm no schema/data changes occurred unless separately reviewed. Check startup, schema readiness and historical fixtures for unintended effects.
7. Search active documentation/config/code for obsolete command paths; approved historical references may remain with a retirement label.
8. Update change record, TASK_LOG, PROJECT_STATUS and QA migration status, including every removed/retained surface and rollback instructions.

## Definition of done

Provide a removal manifest, QA provenance/run links, product and QA SHAs, before/after build/dependency evidence, verified absence of public test endpoints, preserved business/readiness functionality, and a documented owner-controlled deployment step. Keep a Git rollback point; never delete databases/volumes as rollback or cleanup. If preservation or critical external tests are blocked, finish safe preparatory work and report the exact blocker instead of declaring cleanup complete.
