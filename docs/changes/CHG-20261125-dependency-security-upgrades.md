# CHG-20261125-dependency-security-upgrades — patch vulnerable dependencies (v2.17.3)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-25
- Product version (`VERSION` file) and base SHA / branch/PR: 2.17.3 on `fix/v2173-dependency-security-upgrades` from origin/master `05bdd7c87f3bae3bd7f812cef6dac934c27a019e` / v2.17.2
- QA repository revision and companion PR/change ID: independent staging QA pending
- Intended before/after behaviour with a concrete example: `pnpm audit` reported 68 advisories (7 critical, 28 high), including unauthenticated RCE in the Next.js image optimizer (`next` 15.5.19), "OAuth state can be used as a Magic Link to sign in as another user" and OAuth-proxy account takeover in `better-auth` 1.6.20 (Google sign-in is enabled), SQL identifier injection in `drizzle-orm` < 0.45.2, and prototype pollution / ReDoS in `xlsx` 0.18.5 used to parse uploaded bank statements. After this change `pnpm audit` reports 2 (1 moderate dev-only esbuild via drizzle-kit's `@esbuild-kit`, 1 low `fast-xml-parser` via AWS SDK). No user-visible behaviour change is intended
- Existing behaviour that must remain correct: email/password login, Google sign-in, verification/reset email, sign-out, AgentBridge OAuth authorize/token/MCP, tenant switching, all Drizzle reads/writes and postings, bank statement XLSX/CSV import, product photo upload (sharp), `/docs` site
- Actual changed paths/symbols/routes: dependency manifests only — `package.json` (root deps + new `pnpm.overrides` + root `vite` devDependency), `apps/web/package.json`, `packages/auth/package.json`, `packages/db/package.json` (+ `@types/node` devDependency), `packages/statement-import/package.json`, `packages/{accounting,agent-bridge,commerce}/package.json` (vitest), `pnpm-lock.yaml`. No source files changed
- Business rule/profile/scenario IDs: none (security maintenance)
- Accounting, stock/rental, tenant/access and customer-data effects: none intended. Auth library minor bump (1.6 → 1.7) touches every session; drizzle-orm 0.33 → 0.45 touches every query
- Migrations, schema/history compatibility and recovery implications: no new migration. `drizzle-kit` 0.24 → 0.31 runs as `drizzle-kit push --force` in `docker/entrypoint.sh` on every web start. Its success strings ("Changes applied", "No changes", "No config path") are still present in 0.31.11, but the push diff against a real database was NOT observed locally (Docker unavailable). Deploy to staging first and inspect the `[1/3]` entrypoint log for unexpected ALTER/DROP before production. Rollback is revert of this VERSION 2.17.3 commit and redeploy
- Dependencies, settings/flags, deployment and external-service changes:
  - `next` ^15.0.0 (15.5.19) → ^15.5.29
  - `better-auth` ^1.6.20 → ^1.7.28 (root, apps/web, packages/auth)
  - `drizzle-orm` ^0.33.0 → ^0.45.4; `drizzle-kit` ^0.24.0 → ^0.31.11
  - `xlsx` ^0.18.5 (npm, unmaintained) → `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (official SheetJS distribution). Docker/CI builds now need outbound access to `cdn.sheetjs.com`
  - `vitest` ^2.1.0 → ^4.1.12 (test only); `sharp` ^0.35.3 → ^0.35.5; `zod` ^4.4.3 → ^4.6.7
  - `pnpm.overrides`: postcss ^8.5.33, nanoid ^3.3.20, js-yaml ^4.3.1, image-size ^2.0.3, source-map-js ^1.2.2, zod ^4.6.7, postcss-selector-parser ^6.1.6 / ^7.2.1, vite ^7.3.8
  - Better Auth 1.7 warns at build time when no base URL is set; prod/staging compose already sets `BETTER_AUTH_URL`
- Independent diff/impact review and uncertainties: no independent review yet. Highest risk: drizzle-kit push diff on live schema, Better Auth 1.7 session/OAuth behaviour, Next.js postcss override (Next pins 8.4.31 internally)
- Checks executed (Windows 11, Node 22, pnpm 9.0.0, local, no database):
  - `pnpm typecheck` — exit 0, all workspaces
  - `pnpm test` — accounting 277, auth 170 (+5 skipped), agent-bridge 158, statement-import 44, commerce 24: 673 passed, 0 failed
  - `pnpm --filter @bookone/web build` — exit 0, compiled successfully
  - `pnpm audit` — 2 advisories (1 moderate, 1 low), down from 68
- Failed/skipped/flaky/blocked/not-run checks and reasons: no app run against Postgres (Docker Desktop not running); no live login, Google OAuth, AgentBridge OAuth, XLSX statement import, or drizzle-kit push observed. Playwright/QA suites in bookone-qa not run. LIVE-UNVERIFIED
- New QA assertions or outstanding work; changed expectations and owner decision: staging smoke — login/logout, Google sign-in, password reset email, company switch, post one Simple Entry and one invoice, import an XLSX bank statement, upload a product photo, AgentBridge connect. Remaining audit items: esbuild (drizzle-kit dev tooling) and fast-xml-parser (AWS SDK) await upstream releases
- Created staging records/cleanup, if any: none
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: reviewable PR, CI green, Owner deploys to staging with Re-pull ON and checks entrypoint migration log, then runs the staging smoke above before production

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.

## UI/UX impact and existing-design compatibility

Not applicable: the diff changes only dependency manifests and the lockfile. No components, CSS, or routes changed.
