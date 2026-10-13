# CHG-20261013-on-screen-version — Sidebar version stamp and mandatory VERSION bumps

Status: ready for QA retest on identified GHCR image.

- Author/agent and date: Grok coding agent, 2026-10-13.
- Product version (`VERSION` file) and base SHA / branch/PR: **2.1.0** on `master` after `137f6b5`.
- QA repository revision and companion PR/change ID: none; QA must start quoting the on-screen stamp in run records (PR #5 could not name the build).
- Intended before/after behaviour with a concrete example:
  - Sidebar bottom-left was empty. After: `v2.1.0 · <sha7>` pinned to the bottom-left of the left nav (login shows the same). Local `pnpm dev` shows `v2.1.0 · dev`.
  - Coding agents had no version gate. After: AGENTS.md + docs/VERSIONING.md require a `VERSION` bump before commit.
- Existing behaviour that must remain correct: nav, jobs, Viewer denials, GHCR pull flow.
- Actual changed paths: `VERSION`, `apps/web/src/lib/build-id.ts`, `bookone-shell.tsx`, `globals.css`, `login/page.tsx`, `layout.tsx`, `next.config.mjs`, `docker/Dockerfile.web`, `scripts/bump-version.mjs`, `docs/VERSIONING.md`, `AGENTS.md`.
- Business rule/profile/scenario IDs: ops/identity for QA retests of BUG-0003/0004.
- Accounting, stock/rental, tenant/access and customer-data effects: none.
- Migrations: none.
- Dependencies, settings/flags, deployment: Docker copies `VERSION`. Wait for **Docker web image** green, Portainer Update Re-pull ON. Confirm bottom-left `v2.1.0 ·` plus a 7-char SHA, not `dev`.
- Independent review: stamp is display-only.
- Checks: VERSION file is `2.1.0`; stamp helpers unit-free. Browser after GHCR pull.
- Next exact action: owner Portainer Re-pull ON; confirm bottom-left stamp; QA records `v2.1.0 · <sha>` then retries Viewer writes.
