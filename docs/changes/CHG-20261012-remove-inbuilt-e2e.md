# CHG-20261012-remove-inbuilt-e2e — remove inbuilt E2E runner from BookOne

Status: implementing (Wave 0 + Wave 1a complete; Wave 1b product deletion on this branch; not merged to `master`).

- Author/agent and date: Grok coding agent, 2026-10-12, requested by repository owner.
- Product base SHA and branch/PR: `bdff296bd3f0dae6470b15be74cfee8b71567501`, branch `chore/remove-inbuilt-e2e` (Wave 0 commit `f048c9ed2c1a411b50111cc83fb60bcca8224073`). QA unit pin remains product `d35ed9209852af3fbcfe140176f2f8e74cae15f7`. `bdff296` is documentation-only on top of `d35ed92` (no test-path diff).
- QA repository revision and companion PR/change ID: bookone-qa branch `qa/chg-20261012-e2e-denial` at `0ed11956634f4bb6117807ad8c1aebe18a357777` ([CHG-20261012-remove-inbuilt-e2e](https://github.com/Dinu-Sri/bookone-qa/blob/qa/chg-20261012-e2e-denial/changes/CHG-20261012-remove-inbuilt-e2e.md)). Parent was `b9e13bcc1a6222aedd0356c19336e141cd08c9b0`.
- Intended before/after behaviour with a concrete example:
  - Before: unauthenticated `/e2e` console and `POST /api/e2e/runs` can start Playwright against the ERP with submitted credentials. Tests, catalog, and runner live in BookOne.
  - After (Wave 1b on this branch): those URLs have no page/API. Unauthenticated GET `/e2e` and POST `/api/e2e/runs` hit middleware login redirect (307) or Next 404 once authenticated. Tests live in https://github.com/Dinu-Sri/bookone-qa.
  - Wave 0 did not change runtime behaviour. Wave 1b does.
- Existing behaviour that must remain correct: login, docs, navigation, sales/purchase/inventory/rental/accounting, Control Room health-check, company reset, install/demo seeds, RLS, backups, `/ops/logs`, `/api/ops`, operational health. No schema or data changes.
- Actual changed paths/symbols/routes (Wave 1b): entire `apps/e2e-runner/` deleted; `apps/web/src/app/e2e/page.tsx`; `apps/web/src/app/api/e2e/**`; `apps/web/src/lib/e2e-runner.ts`, `e2e-report.ts`; public `/e2e` and `/api/e2e` plus e2e-host diagnostic/redirect in `middleware.ts`; `/e2e` in `access.ts`; `docker/Dockerfile.e2e`; staging `e2e` service; `E2E_PUBLIC_URL` / `NEXT_PUBLIC_E2E_URL` / `E2E_HOST` from compose and `.env.example`; catalog export/rebuild-e2e scripts; root `test:e2e` / `agent:browse` scripts; lockfile importer. Docs E2E_* replaced with stubs. Keep `/ops/logs`, `/api/ops`, health-check, company reset, seeds, migrations, MinIO, package unit tests.
- Business rule/profile/scenario IDs: catalog 747 IDs, last `S-0760`. Wave 1a revised S-0031, S-0032, S-0033, S-0578 and S-0462 to assert denial. Preserve S-NNNN IDs.
- Accounting, stock/rental, tenant/access and customer-data effects: no posting/stock/schema changes. Removing public `/api/e2e` is access hardening (unauthenticated Playwright launch is gone).
- Migrations, schema/history compatibility and recovery implications: none. Do not drop `019_health_check_staging.sql` or any applied migration. Rollback is git revert. Never delete databases/volumes/MinIO.
- Dependencies, settings/flags, deployment and external-service changes: Playwright workspace package removed from lockfile (`pnpm install`; 76 packages dropped). Product `E2E_HOST` / `E2E_PUBLIC_URL` / `NEXT_PUBLIC_E2E_URL` / `E2E_EMAIL` removed from `.env.example` and compose. Operator must stop `bookone-staging-e2e` and remove Cloudflare `bookone-e2e.clossyan.com` separately. VPS leftover `E2E_*` env is inert after the new web image.
- Independent diff/impact review and uncertainties: tables below. Blockers at the end.
- Checks executed: see Wave 0, Wave 1a, and Wave 1b sections.
- Failed/skipped/flaky/blocked/not-run checks: 4 skipped bank-fixture unit tests (inherited). `pnpm --dir apps/web typecheck` fails on pre-existing errors (document-print, cashbook, docs PageData, etc.) with no e2e-lib diagnostics. Docker CLI not installed on this Windows machine — compose parsed by inspection/grep (no `e2e` service left). Browser denial not executed against a deployed cleaned SHA. Graph `search_graph` timed out; grep used.
- New QA assertions or outstanding work: Wave 1a denial tests exist (`0ed1195`). Execute them against this candidate after it is deployed. HTTP runner unpublished. QA merge/deploy gate still advisory.
- Created staging records/cleanup: none. Operator still must stop the old e2e container/tunnel.
- Documentation updated: this CHG; TASK_LOG; PROJECT_STATUS; E2E_* stubs; AGENTS; Portainer/deploy docs; QA_CHANGE_CONTRACT; REMOVE_INBUILT_E2E.
- Next exact action and responsible role: do not merge to `master` until reviewed. After deploy, run bookone-qa S-0031–S-0033/S-0578 against the cleaned host. Operator: stop `bookone-staging-e2e` and remove `bookone-e2e.clossyan.com`.

Final product/QA SHAs belong in PR metadata and external run manifests after commit.

---

## Wave 0 provenance

| Item | Value |
|---|---|
| BookOne branch | `chore/remove-inbuilt-e2e` |
| BookOne HEAD | `bdff296bd3f0dae6470b15be74cfee8b71567501` |
| Inventory source commit | `d35ed9209852af3fbcfe140176f2f8e74cae15f7` |
| QA clone | gitignored `.local/bookone-qa` (not committed) |
| QA HEAD (Wave 0) | `b9e13bcc1a6222aedd0356c19336e141cd08c9b0` |
| QA HEAD (Wave 1a) | `0ed11956634f4bb6117807ad8c1aebe18a357777` (`qa/chg-20261012-e2e-denial`) |
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
| `/e2e` denial tests | Wave 1a `0ed1195` | Written. Discovery 770. Not executed against live staging (still hosts the console). |

QA `--ignore-workspace` was required because the clone sits under BookOne's `pnpm-workspace.yaml`.

---

## Wave 1a (bookone-qa `0ed1195`)

Denial tests now live in QA. Historical S-NNNN IDs preserved (747, last S-0760). Extra dedicated test `S-e2e console public at /e2e` dropped; discovery 771 → 770.

| Location | Behaviour after Wave 1a |
|---|---|
| `tests/02-public.spec.ts` S-0031 / S-0032 / S-0033 | Console gone; POST cannot start a run; artifacts not exposed. |
| Catalog S-0031 / S-0032 / S-0033 / S-0578 | Same IDs; expectation is removal. S-0578 title still `Route smoke /e2e`. |
| `src/runner/execute.ts` | `expectE2ePageGone` / `expectE2eApiGone`. |
| `src/helpers/nav.ts` | `/e2e` removed from `PUBLIC_SMOKE_ROUTES`. |
| `tests/10-edges-security.spec.ts` S-0462 | Opens `/e2e`; forbids embedded password **and** console UI. |
| `scripts/agent-browse.mjs` + login-smoke / rental-ops | Ported. `pnpm agent:browse`. |
| HTTP `server.ts` / `public/index.html` | Still unpublished (not in QA). |

QA checks: `catalog:sync` 747/747; `check` pass; unit **94 passed, 4 skipped** on pin `d35ed92`; `test:e2e:list` **770 tests in 29 files**. Browser denial not executed (staging still serves the console until Wave 1b).

---

## Wave 1b (this branch)

Product inbuilt runner removed. Git rollback: `git revert` of the Wave 1b commit. Never delete databases/volumes/MinIO.

Kept: Control Room health-check (incl. migration `019`), company reset, `scripts/seed-demo-*`, `packages/accounting/test/` and `packages/statement-import/test/`, `/ops/logs`, `/api/ops`.

### Wave 1b checks

| Check | Command / environment | Result |
|---|---|---|
| Lockfile | `pnpm install` after deleting workspace package | Workspace 10 projects; lockfile −650 lines; no `apps/e2e-runner` importer |
| Product unit | `pnpm --filter @bookone/accounting test`; `pnpm --filter @bookone/statement-import test` | Accounting **60 passed**. Statement-import **26 passed, 4 skipped** |
| Web typecheck | `pnpm --dir apps/web typecheck` | **Fails** on pre-existing errors (no `@/lib/e2e-runner` / `/api/e2e` diagnostics) |
| Compose | `docker compose … config` | **Blocked**: Docker CLI not on this Windows machine. Grep: no `e2e` service, no `Dockerfile.e2e`, no `E2E_PUBLIC_URL` in `docker/` |
| Remaining product callers | grep `@/lib/e2e`, `/api/e2e`, `apps/e2e-runner` under `apps/web` | **None** |
| Browser denial vs cleaned host | bookone-qa S-0031–S-0033 | **Not-run** — candidate not deployed (branch is not `master`) |

## Blockers remaining (do not declare cleanup complete)

1. This branch is not merged to `master`. Staging still runs the old image until Portainer pulls a merged commit.
2. No staging browser denial run on a named deployed SHA/image/schema.
3. 717 of 747 assertion-depth reviews still pending (does not block public-console removal).
4. Branch protection / deploy promotion still advisory; product CI `production-check.yml` uses `continue-on-error` for lint/build/test.
5. Operator must stop `bookone-staging-e2e` / Cloudflare `bookone-e2e.clossyan.com`; not in Git.

Wave 0 inventory, Wave 1a QA companion, and Wave 1b product deletion are on this branch. Do not merge to `master` until reviewed. Denial evidence belongs to the deployed cleaned candidate.
