# CHG-20261012-remove-inbuilt-e2e — remove inbuilt E2E runner from BookOne

Status: implementing (Wave 0 preservation complete; no runtime deletion yet).

- Author/agent and date: Grok coding agent, 2026-10-12, requested by repository owner.
- Product base SHA and branch/PR: `bdff296bd3f0dae6470b15be74cfee8b71567501`, branch `chore/remove-inbuilt-e2e`. QA unit pin remains product `d35ed9209852af3fbcfe140176f2f8e74cae15f7`. `bdff296` is documentation-only on top of `d35ed92` (no test-path diff).
- QA repository revision and companion PR/change ID: bookone-qa `b9e13bcc1a6222aedd0356c19336e141cd08c9b0` (`qa: update sanitized status with manual findings`). Wave 1a companion not started.
- Intended before/after behaviour with a concrete example:
  - Before: unauthenticated `/e2e` console and `POST /api/e2e/runs` can start Playwright against the ERP with submitted credentials. Tests, catalog, and runner live in BookOne.
  - After (Wave 1b): those URLs cannot start runs or expose artifacts; tests live in https://github.com/Dinu-Sri/bookone-qa.
  - Wave 0 does not change runtime behaviour.
- Existing behaviour that must remain correct: login, docs, navigation, sales/purchase/inventory/rental/accounting, Control Room health-check, company reset, install/demo seeds, RLS, backups, `/ops/logs`, `/api/ops`, operational health. No schema or data changes.
- Actual changed paths/symbols/routes (Wave 0): `docs/changes/CHG-20261012-remove-inbuilt-e2e.md`, `docs/TASK_LOG.md`, `docs/PROJECT_STATUS.md`. No runner/API/page deleted.
- Business rule/profile/scenario IDs: catalog 747 IDs, last `S-0760`, identical ID set in product and QA. Wave 1a must revise S-0031, S-0032, S-0033, S-0578, plus tests `02-public.spec.ts` (`S-e2e console public at /e2e`) and `10-edges-security.spec.ts` (S-0462) to assert denial. Preserve S-NNNN IDs.
- Accounting, stock/rental, tenant/access and customer-data effects: none in Wave 0. Later removal of public `/api/e2e` is access hardening. No posting/stock changes.
- Migrations, schema/history compatibility and recovery implications: none. Do not drop `019_health_check_staging.sql` or any applied migration. Rollback is git revert. Never delete databases/volumes/MinIO.
- Dependencies, settings/flags, deployment and external-service changes: none in Wave 0. Later: drop e2e Docker profile and product `E2E_PUBLIC_URL` / `NEXT_PUBLIC_E2E_URL` / `E2E_HOST`. Operator must stop `bookone-staging-e2e` separately.
- Independent diff/impact review and uncertainties: tables below. Blockers at the end.
- Checks executed: see Wave 0 checks.
- Failed/skipped/flaky/blocked/not-run checks: 4 skipped bank-fixture unit tests (optional local files, inherited). Browser execution not run (discovery only). Staging deployed SHA/image/schema still unverified in QA STATUS. Graph `search_graph` timed out; grep used.
- New QA assertions or outstanding work: Wave 1a denial tests; port `agent-browse`; retire HTTP runner (already excluded from QA). Owner has not wired QA as a required merge/deploy gate (advisory).
- Created staging records/cleanup: none in Wave 0.
- Documentation updated: this CHG; TASK_LOG; PROJECT_STATUS.
- Next exact action and responsible role: Wave 1a in bookone-qa (denial tests + agent-browse port), then Wave 1b product deletion on this branch. Coding agent. Do not merge to `master` until Wave 1a exists.

Final product/QA SHAs belong in PR metadata and external run manifests after commit.

---

## Wave 0 provenance

| Item | Value |
|---|---|
| BookOne branch | `chore/remove-inbuilt-e2e` |
| BookOne HEAD | `bdff296bd3f0dae6470b15be74cfee8b71567501` |
| Inventory source commit | `d35ed9209852af3fbcfe140176f2f8e74cae15f7` |
| QA clone | gitignored `.local/bookone-qa` (not committed) |
| QA HEAD | `b9e13bcc1a6222aedd0356c19336e141cd08c9b0` |
| QA `product-ref.json` | `d35ed9209852af3fbcfe140176f2f8e74cae15f7` |
| Inventory | 98 entries: 84 imported (12 adapted), 14 source-reference-only |
| Product e2e-runner files missing from inventory | 0 |
| `d35ed92..HEAD` test/e2e path diff | empty (docs-only `bdff296`) |

Local Node was v20.19.0 (BookOne engines want >=22). QA engines allow >=20. Recorded, not masked.

---

## Hash comparison (84 imported)

Product working tree equals `d35ed92` blobs for all compared files (LF, no CRLF).

| Result | Count |
|---|---|
| Product live SHA matches inventory `source_sha256` | 80 |
| Product live SHA differs from inventory `source_sha256` | 4 (same files still present) |
| Product path missing | 0 |
| QA dest SHA matches inventory `imported_sha256` | 81 |
| QA dest SHA differs from inventory `imported_sha256` | 3 |
| QA dest missing | 0 |

Product vs inventory source-hash drift (bytes differ; catalog IDs do not):

| Path | Note |
|---|---|
| `apps/e2e-runner/src/catalog/scenarios.json` | JSON **equal** to QA (747 IDs, last S-0760). Inventory hash taken from a different serialization of the same objects. |
| `apps/e2e-runner/src/catalog/coverage.generated.json` | Regenerated companion of the catalog sync in `d35ed92` (S-0760). |
| `docs/E2E_COVERAGE.md` | Same. |
| `apps/e2e-runner/tests/29-team-rbac.spec.ts` | Product blob is `d35ed92`. QA later adapted this file (team-suite discovery fix). |

QA dest drift vs inventory imported hash:

| Path | Decision |
|---|---|
| `apps/e2e-runner/fixtures/bank-recon-demo/README.md` | QA edited after import. Fixtures themselves still match. Keep QA copy. |
| `apps/e2e-runner/playwright.config.ts` | Marked adapted at import; QA changed again. Keep QA copy. |
| `apps/e2e-runner/tests/29-team-rbac.spec.ts` | QA adapted (STATUS: full discovery 771 including team suite). Keep QA copy. Product original remains until Wave 1b delete. |

Preservation conclusion: every inventoried test/catalog/fixture file still exists in BookOne. QA holds executable copies plus later adaptations. Safe to proceed to Wave 1a (QA tests first), then Wave 1b (product delete). Not complete cleanup until denial tests exist.

---

## Source-reference-only (14 files) — port or retire

All 14 still exist in BookOne; live SHA matches inventory.

| Path | Wave 1 decision |
|---|---|
| `apps/e2e-runner/scripts/agent-browse.mjs` | **Port to QA** — coding-agent click-through driver. |
| `apps/e2e-runner/scripts/agent-scenarios/login-smoke.json` | **Port to QA** with agent-browse. |
| `apps/e2e-runner/scripts/agent-scenarios/rental-ops.json` | **Port to QA** with agent-browse. |
| `apps/e2e-runner/src/server.ts` | **Retire** — HTTP credential/report server. Do not republish in ERP or QA. |
| `apps/e2e-runner/public/index.html` | **Retire** with the HTTP console. |
| `apps/e2e-runner/Dockerfile` | **Retire** with product `docker/Dockerfile.e2e`. |
| `apps/e2e-runner/package.json` | **Retire** from product; QA has its own package/scripts. |
| `apps/e2e-runner/package-lock.json` | **Retire** (pnpm workspace lockfile is canonical in BookOne). |
| `apps/e2e-runner/.gitignore` | **Retire** with the package. |
| `apps/e2e-runner/scripts/e2e-bank-recon-demo.mjs` | **Retire** — fixtures already imported; not required for CLI bootstrap. |
| `apps/e2e-runner/scripts/e2e-bank-recon-journey.mjs` | **Retire** with a note in QA; fixtures remain. |
| `apps/e2e-runner/scripts/ui-audit-bank-import.mjs` | **Retire** — machine-specific UI audit. |
| `apps/e2e-runner/scripts/ui-audit-bank-recon.mjs` | **Retire**. |
| `apps/e2e-runner/scripts/ui-audit-cashbook.mjs` | **Retire**. |

---

## Removal manifest (Wave 1b, after Wave 1a)

### Remove from BookOne

| Surface | Paths |
|---|---|
| Embedded runner | entire `apps/e2e-runner/` |
| ERP test page | `apps/web/src/app/e2e/page.tsx` |
| Runner APIs | `apps/web/src/app/api/e2e/buckets/route.ts`; `runs/route.ts`; `runs/[id]/route.ts`; `runs/[id]/report/route.ts`; `runs/[id]/log/route.ts`; `runs/[id]/download/route.ts`; `runs/[id]/failures/route.ts`; `runs/[id]/buckets/[bucket]/route.ts` |
| App libraries | `apps/web/src/lib/e2e-runner.ts`, `apps/web/src/lib/e2e-report.ts` |
| Middleware/access | public `/e2e` and `/api/e2e` in `apps/web/src/middleware.ts` and `apps/web/src/lib/access.ts`; e2e-host diagnostic HTML; `/e2e` → `E2E_PUBLIC_URL` redirect. Keep `/ops/logs`, `/api/ops`, `api/auth`, static matcher exclusions. |
| Docker | `docker/Dockerfile.e2e`; staging compose `e2e` service/profile; `E2E_PUBLIC_URL` / `NEXT_PUBLIC_E2E_URL` on web in `docker-compose.staging.yml` and `docker-compose.prod.yml` |
| Scripts | `scripts/export-e2e-catalog.mjs`, `scripts/generate-e2e-scenario-catalog.mjs`, `scripts/rebuild-e2e-only.sh`; e2e branches in `scripts/smart-deploy.sh` |
| Root scripts | `test:e2e`, `test:e2e:smoke`, `e2e:runner`, `agent:browse` in root `package.json` |
| Lock/ignore | `pnpm-lock.yaml` importer `apps/e2e-runner`; `.dockerignore` `apps/e2e-runner/runs` and `reports` |
| Env | product-hosted `E2E_HOST`, `E2E_PUBLIC_URL`, `NEXT_PUBLIC_E2E_URL`. Browser-test credentials belong in QA `.env`. |
| Docs | replace `docs/E2E_AUTOMATION.md`, `E2E_COVERAGE.md`, `E2E_GOVERNANCE.md`, `E2E_RUNNER.md`, `E2E_SCENARIO_CATALOG.md` with short retired stubs pointing at bookone-qa. Update `AGENTS.md`, copilot/claude/start-session, `DEPLOY_SELECTIVE_BUILDS.md`, `PORTAINER_MULTI_SERVICE.md`. Keep this CHG, `QA_CHANGE_CONTRACT.md`, `REMOVE_INBUILT_E2E.md`. |

No navbar `href="/e2e"` exists today.

### Keep in BookOne (Wave 1)

| Surface | Why |
|---|---|
| Control Room ERP Health Check | Staging diagnostic with journal/stock asserts (`health-check.ts`, panel, page, schema, migration `019`). Uses `rental-health.ts` hire-loop helper. |
| Company reset actions/buttons | Owner-supported staging admin. Do not execute a reset as cleanup. |
| `scripts/seed-demo-*`, CoA/role seed | Install/signup initialization. |
| `packages/accounting/test/`, `packages/statement-import/test/` | Engineering `pnpm test`. QA also runs them against pinned source. |
| Historical SQL migrations / tables / MinIO | Never drop. |
| `/ops/logs`, `/api/ops` | Unrelated ops slow-log viewer. |

Review later (not Wave 1): `apps/web/src/app/api/platform/seed-rental-demo/route.ts` exposure; whether health-check stays as product ops.

### Operator follow-up (not in Git)

Stop/remove `bookone-staging-e2e` if running. Do not recreate MinIO. Remove Cloudflare tunnel `bookone-e2e.clossyan.com` when ready. Remove VPS `E2E_*` after the new web image is live. Compose path for ERP remains `docker/docker-compose.prod.yml`.

---

## Wave 0 checks

| Check | Command / environment | Result |
|---|---|---|
| QA unit vs pinned product | `.local/bookone-qa`: `pnpm --ignore-workspace install --frozen-lockfile`; `pnpm --ignore-workspace product:prepare`; `pnpm --ignore-workspace test:unit`. Node v20.19.0, pnpm 9.0.0. Product checkout `d35ed92`. | **94 passed, 4 skipped**, 10 files. Includes `qa-critical-postings.test.ts` (8 cases). JSON at QA `work/unit-results.json` (gitignored). |
| QA browser discovery | `pnpm --ignore-workspace test:e2e:list` (suite `full`) | **771 tests in 29 files**. Not executed. |
| BookOne engineering unit | `pnpm --filter @bookone/accounting test`; `pnpm --filter @bookone/statement-import test` on `bdff296` | Accounting **60 passed** (5 files). Statement-import **26 passed, 4 skipped** (4 files). 4 skips = optional bank fixtures. |
| Browser journeys on staging | not run | Blocked/not-run: Wave 0 is inventory. QA STATUS: no staging acceptance; deployed SHA unverified. |
| `/e2e` denial tests | not present in QA | Must be Wave 1a. Current tests **require** the public console. |

QA `--ignore-workspace` was required because the clone sits under BookOne's `pnpm-workspace.yaml`.

---

## Tests that still expect the inbuilt console (Wave 1a)

| Location | Behaviour today |
|---|---|
| `tests/02-public.spec.ts` `S-e2e console public at /e2e` | Logged-out `/e2e` must show E2E heading and Start run. |
| Catalog S-0031 / S-0032 / S-0033 via executor | Public console, credentials required to start, report download. |
| `src/runner/execute.ts` | `page.goto('/e2e')` for console/report scenarios. |
| `src/helpers/nav.ts` | `{ path: '/e2e', name: 'E2E console' }` public smoke. |
| `tests/10-edges-security.spec.ts` S-0462 | Opens `/e2e` and asserts password not embedded. |

Wave 1a: assert `/e2e` and `/api/e2e/**` cannot start runs or return artifacts. Preserve historical run records; do not rewrite old results as new passes.

---

## Blockers remaining (do not declare cleanup complete)

1. QA has no `/e2e` denial tests yet. Product delete before Wave 1a would fail inherited public-console tests for the wrong reason.
2. No staging browser acceptance run on a named deployed SHA/image/schema.
3. 717 of 747 assertion-depth reviews still pending (does not block Wave 1 public-console removal).
4. Branch protection / deploy promotion still advisory; product CI `production-check.yml` uses `continue-on-error` for lint/build/test. Do not treat that as the replacement gate.
5. `agent-browse` is not in QA until Wave 1a ports it.

Wave 0 itself is complete: inventory, hashes, classifications, and unit/discovery evidence are recorded. No product deletes in this wave.
