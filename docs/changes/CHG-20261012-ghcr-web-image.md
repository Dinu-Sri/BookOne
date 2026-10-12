# CHG-20261012-ghcr-web-image — GitHub Actions publishes web image; VPS only pulls

Status: implementing.

- Author/agent and date: Grok coding agent, 2026-10-12.
- Product base SHA and branch/PR: `7b1794f` on `master`.
- QA repository revision and companion PR/change ID: none. Infra-only; no product behaviour change.
- Intended before/after behaviour with a concrete example:
  - Before: Portainer Update compiled `docker/Dockerfile.web` on the 4c/8G VPS (often 10–20 minutes) even with Re-pull OFF, because staging/prod `web` used `build:` and no registry image.
  - After: GitHub Action **Docker web image** builds and pushes `ghcr.io/dinu-sri/bookone-web:latest` (and `sha-<short>`). Staging and prod compose set `image:` + `pull_policy: always` and have no `build:` on `web`. Update pulls the image; Next.js compile stays on `ubuntu-latest`.
- Existing behaviour that must remain correct: postgres/redis/minio/traefik/cloudflared stay up; `pull_policy: missing` on infra so Re-pull ON does not replace MinIO. Entrypoint still runs `drizzle-kit push --force` then `init-db.ts` after the new container starts. Docs nginx still builds locally if the docs profile/service is enabled.
- Actual changed paths: `.github/workflows/docker-web.yml`, `docker/docker-compose.staging.yml`, `docker/docker-compose.prod.yml`, `docker/Dockerfile.web` (comment), deploy docs, this record.
- Business rule/profile/scenario IDs: none.
- Accounting, stock/rental, tenant/access and customer-data effects: none. No schema change. No volume wipe.
- Migrations, schema/history compatibility and recovery implications: none. First GHCR pull still runs the existing entrypoint schema apply.
- Dependencies, settings/flags, deployment and external-service changes:
  - Hardcoded image `ghcr.io/dinu-sri/bookone-web:latest` (no new env var).
  - Workflow needs `packages: write` (GITHUB_TOKEN).
  - First package may be private; Portainer pull 401 → set package Public or add `ghcr.io` registry with a `read:packages` PAT.
  - Do not Portainer Update until the Action is green (image must exist before pull).
  - Optional repo secret `PORTAINER_WEBHOOK_URL` redeploys after push.
- Independent diff/impact review and uncertainties: GHCR publish was added in `c478ec9` and reverted in `d0778d0`. This re-wires `docker-web.yml` instead of a second workflow, and does not restore `BOOKONE_WEB_IMAGE`. Public git repo does not guarantee anonymous GHCR pull until the package is Public or a PAT is set.
- Checks executed: workflow and compose YAML edited locally. Docker CLI not on this Windows machine; first proof is the GitHub Action after push.
- Failed/skipped/flaky/blocked/not-run checks: image build/push not-run until this commit is on `master`. Staging pull not-run until owner Update after green.
- New QA assertions or outstanding work: none. QA BUG-0001/BUG-0002 still need a staging pull of this image.
- Created staging records/cleanup, if any: none.
- Documentation updated: `DEPLOYMENT_WORKFLOW.md`, `PORTAINER_SETUP.md`, `DEPLOY_SELECTIVE_BUILDS.md`, `PROJECT_STATUS.md`, `TASK_LOG.md`, `KNOWN_ERRORS.md`, `AGENTS.md`.
- Next exact action and responsible role: owner waits for **Docker web image** green, then Portainer Update with Re-pull ON. If 401, make `bookone-web` Public or add GHCR registry credentials.
