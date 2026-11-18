# CHG-20261118-ci-web-build — Unblock Production Check and Docker web image after v2.9.0/v2.10.0

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-18
- Product version (`VERSION` file) and base SHA / branch/PR: 2.10.1 on `fix/v2101-ci-web-build` from origin/master `f3a3b8dbf7f5b250ca3305a7200c25e32fedbd1f` (v2.10.0)
- QA repository revision and companion PR/change ID: GitHub Production Check `44283681621` and Docker web image `44283681653` failed on v2.10.0; Production Check `44279665094` failed on v2.9.0. Independent staging QA pending; no bookone-qa companion opened in this change
- Intended before/after behaviour with a concrete example: `pnpm build` collects `/dashboard` and `/purchase/inbox/connections` without a `"use server"` object-export error or webpack `node:crypto` UnhandledSchemeError. CoreGuard Dashboard DB-01 postgres isolation sees tenant-b in-period 4000 credit as the fixture 9999 while tenant-a net sales still match `independentExpected()`. Production Check `pnpm test` receives `DATABASE_URL` through turbo.
- Existing behaviour that must remain correct: generate-once AgentBridge signing on named volume `agent_bridge_signing`; connection screen copy fields; FILE-wins PEM; HMAC unset; Inbox OFF / draft-only ON / posting-stop ON on the live company; UI-NAV-01 list clipping; tiles remain removed; dashboard metric contracts unchanged
- Actual changed paths/symbols/routes: `apps/web/src/app/actions/dashboard.ts` removes unused `export const` objects; `apps/web/src/components/agent-bridge/connection-setup.tsx` stops importing `@bookone/agent-bridge`; `apps/web/src/app/purchase/inbox/connections/page.tsx` passes precomputed Codex/Claude strings; `turbo.json` `globalPassThroughEnv` / test `passThroughEnv` include `DATABASE_URL`; `packages/auth/test/dashboard-db01-postgres.test.ts` isolation expected value; gate + Playwright source assertions
- Business rule/profile/scenario IDs: GitHub Production Check and Docker web image publication follow-up after v2.9.0 / v2.10.0
- Accounting, stock/rental, tenant/access and customer-data effects: none. Isolation SQL still filters tenant-a aggregates; tenant-b poison 9999 stays out of tenant-a totals
- Migrations, schema/history compatibility and recovery implications: none
- Dependencies, settings/flags, deployment and external-service changes: none. Flags stay off. Owner Portainer Re-pull ON after Docker web image green. Do not set `AGENT_BRIDGE_ALLOW_HMAC`
- Independent diff/impact review and uncertainties: Medium review still applies. Live Codex/Claude remain LIVE-UNVERIFIED. This change does not claim a green GitHub run until Actions finish on the published SHA
- Checks executed: `@bookone/auth` dashboard-db01-gate + postgres 7 passed / 1 skipped (SQL path skipped without local `DATABASE_URL`). `@bookone/accounting` dashboard-metrics 18 passed. `@bookone/agent-bridge` oauth-connect-workflow 4 passed. Playwright `e2e/agent-bridge-connect.spec.ts` 3 passed. `pnpm --filter @bookone/web build` compiled successfully (Next.js 15.5.19, 139 routes including `/dashboard` and `/purchase/inbox/connections`).
- Failed/skipped/flaky/blocked/not-run checks and reasons: live Codex/Claude, OCR, production IdP, GitHub branch protection stay BLOCKED. Isolated Next+seed browser against a live tenant is not this gate. Postgres SQL path runs when `DATABASE_URL` is set
- New QA assertions or outstanding work; changed expectations and owner decision: tenant-b isolation expected value is the in-period fixture sales (9999), not 0; connection client module must not import the Node AgentBridge package; `'use server'` dashboard action must not export objects
- Created staging records/cleanup, if any: none
- Documentation updated: this CHG, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master per owner overlay. Owner deploys after Docker web image green. Independent QA on staging.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them: connection screen tokens and copy fields unchanged. Dashboard overview unchanged.
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not used
- Before/after behaviour; independent expected/unchanged example: Codex CLI and Claude connector text still render from the same `codexSetupCommand` / `claudeConnectorSteps` strings; they are computed on the server page instead of in the client bundle
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/purchase/inbox/connections`, `/dashboard` collect, GitHub Actions quality/CoreGuard
- Preserved field/line/source identity, money/stock/history/print and server permissions: posting and documents unchanged
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: Playwright connection screen source + HTML fixture retained
- Exact and adjacent regressions; actual engineering checks and missing layers: AgentBridge CoreGuard suites retained. Dashboard DB-01 retained.
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: none
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert the VERSION 2.10.1 commit. v2.10.0 remains in git history.
- QA companion change/run and independent review link (or pending): pending
