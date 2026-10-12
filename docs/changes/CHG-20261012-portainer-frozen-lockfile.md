# CHG-20261012-portainer-frozen-lockfile — Portainer web image install

Status: implementing (hotfix on `master` after Wave 1b merge).

- Author/agent and date: Grok coding agent, 2026-10-12, requested by repository owner after Portainer stack pull failed.
- Product base SHA and branch/PR: `2bbc33477118fba56dbc1255874228d123359cc3` (`master`, merge of Wave 1b).
- QA repository revision and companion PR/change ID: none required. Install-only Docker change. Denial tests still wait for a successful web image.
- Intended before/after behaviour with a concrete example:
  - Before: Portainer “pull and redeploy” fails at `pnpm install --frozen-lockfile --ignore-scripts` (exit 1). ERP image does not rebuild.
  - After: that install step matches the lockfile workspace (web, docs, workers, packages) and pinned pnpm 9.0.0.
- Existing behaviour that must remain correct: web runtime, MinIO (`pull_policy: never`), postgres/redis, `/ops/logs`, health-check, no e2e runner republish.
- Actual changed paths/symbols/routes: `pnpm-workspace.yaml` (explicit app packages, no `apps/*` glob); `.npmrc` (multi-OS/libc optional deps); `docker/Dockerfile.web` (corepack pnpm@9.0.0, copy docs/workers manifests and `.npmrc`).
- Business rule/profile/scenario IDs: none.
- Accounting, stock/rental, tenant/access and customer-data effects: none.
- Migrations, schema/history compatibility and recovery implications: none. Rollback is git revert. Never delete volumes/MinIO.
- Dependencies, settings/flags, deployment and external-service changes: pnpm in the web image is pinned to 9.0.0 (was floating `pnpm@9`). No new env vars.
- Independent diff/impact review and uncertainties: GitHub Actions `pnpm install --frozen-lockfile` on ubuntu already succeeded for `2bbc334`. Failure is the Portainer Alpine deps stage. Docker CLI is not on this Windows machine, so the Alpine image itself is not rebuilt here.
- Checks executed: `pnpm install --frozen-lockfile --ignore-scripts` on this workspace — lockfile up to date, 10 projects. `pnpm install --ignore-scripts` — no lockfile diff.
- Failed/skipped/flaky/blocked/not-run checks: Docker/Portainer rebuild not-run until this commit is on `master` and the owner pulls the stack. Alpine image not built locally.
- New QA assertions or outstanding work: none. After the new image is live, run bookone-qa S-0031–S-0033/S-0578.
- Created staging records/cleanup: none.
- Documentation updated: this CHG; `docs/KNOWN_ERRORS.md`; TASK_LOG; PROJECT_STATUS.
- Next exact action and responsible role: push to `master`; owner Portainer pull/redeploy **web only** (do not re-pull MinIO). If it still fails, paste the build log lines above the `pnpm install` exit.

Final product SHA belongs in PR metadata after commit.
