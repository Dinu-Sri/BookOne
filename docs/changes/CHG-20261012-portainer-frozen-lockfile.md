# CHG-20261012-portainer-frozen-lockfile — Portainer web image install

Status: implementing (second hotfix on `master`; first Alpine/corepack hotfix still failed Portainer).

- Author/agent and date: Grok coding agent, 2026-10-12, requested by repository owner after Portainer stack pull failed.
- Product base SHA and branch/PR: `2bbc33477118fba56dbc1255874228d123359cc3` (`master`, merge of Wave 1b).
- QA repository revision and companion PR/change ID: none required. Install-only Docker change. Denial tests still wait for a successful web image.
- Intended before/after behaviour with a concrete example:
  - Before: Portainer “pull and redeploy” fails at `pnpm install --frozen-lockfile --ignore-scripts` (exit 1). ERP image does not rebuild.
  - After: Portainer web image uses `node:22-bookworm-slim` (glibc, same family as GitHub Actions ubuntu) and a full `apps/`+`packages/` copy, then `pnpm@9.0.0` via `npm install -g` (the path that deployed before Wave 1b).
- Existing behaviour that must remain correct: web runtime, MinIO (`pull_policy: never`), postgres/redis, `/ops/logs`, health-check, no e2e runner republish.
- Actual changed paths/symbols/routes: `docker/Dockerfile.web` (Debian slim, full workspace copy, `npm install -g pnpm@9.0.0`); `.npmrc` (strict flags only); `pnpm-workspace.yaml` (explicit packages, no `apps/*`).
- Business rule/profile/scenario IDs: none.
- Accounting, stock/rental, tenant/access and customer-data effects: none.
- Migrations, schema/history compatibility and recovery implications: none. Rollback is git revert. Never delete volumes/MinIO.
- Dependencies, settings/flags, deployment and external-service changes: pnpm in the web image is pinned to 9.0.0 (was floating `pnpm@9`). No new env vars.
- Independent diff/impact review and uncertainties: Production Check #248/`2bbc334` and #249/`d990572` both **succeeded** `pnpm install --frozen-lockfile` on ubuntu-latest. That workflow never builds `Dockerfile.web` (GHCR publish was added in `c478ec9` and reverted in `d0778d0`). Portainer still compiles Alpine locally, so a green Action does not mean the stack image built. Docker CLI is not on this Windows machine.
- Checks executed: `pnpm install --frozen-lockfile --ignore-scripts` on this workspace — lockfile up to date, 10 projects. `pnpm install --ignore-scripts` — no lockfile diff.
- Failed/skipped/flaky/blocked/not-run checks: Docker/Portainer rebuild not-run until this commit is on `master` and the owner pulls the stack. Alpine image not built locally.
- New QA assertions or outstanding work: none. After the new image is live, run bookone-qa S-0031–S-0033/S-0578.
- Created staging records/cleanup: none.
- Documentation updated: this CHG; `docs/KNOWN_ERRORS.md`; TASK_LOG; PROJECT_STATUS.
- Next exact action and responsible role: push to `master`; owner Portainer pull/redeploy **web only** (do not re-pull MinIO). If it still fails, paste the build log lines above the `pnpm install` exit.

Final product SHA belongs in PR metadata after commit.
