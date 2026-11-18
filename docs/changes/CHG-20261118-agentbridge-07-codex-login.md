# CHG-20261118-agentbridge-07-codex-login — Codex MCP login reaches BookOne consent

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-18
- Product version (`VERSION` file) and base SHA / branch/PR: 2.10.2 on `fix/v2102-agentbridge-07-codex-login` from origin/master `a12c1820554b5e88418ba775cccaf315a52174dc` (v2.10.1)
- QA repository revision and companion PR/change ID: independent live Codex login pending after owner deploy. Handoff CODING-AGENTBRIDGE-07-CODEX-LOGIN.md. No bookone-qa companion opened in this change. Keep existing company Inbox OFF, draft-only ON, posting-stop ON. Do not recreate the saved Codex `bookone` MCP entry.
- Intended before/after behaviour with a concrete example: `codex mcp login bookone` discovers `authorization_endpoint` `https://bookone.clossyan.com/api/agent-bridge/oauth/authorize` from public metadata. Unauthenticated MCP initialize returns 401 with `WWW-Authenticate` `resource_metadata`. The browser shows BookOne consent (read/upload/draft) instead of a 404 at `/authorize`. Loopback `http://127.0.0.1:<port>/callback/<id>` is accepted. Callback includes RFC 9207 `iss`.
- Existing behaviour that must remain correct: generate-once signing volume; FILE-wins PEM; HMAC unset; Inbox/posting flags; UI-NAV-01 list clipping; tiles removed; dashboard DB-01; connection screen copy fields; consent still never grants post
- Actual changed paths/symbols/routes: `apps/web/src/middleware.ts` public OAuth/MCP/well-known/`/authorize`; issuer `/authorize` alias; path-appended well-known PRM/AS; MCP nested PRM; `redirectUriAllowed` `/callback/<id>`; `followMcpOauthDiscovery`; `authorizationCallbackUrl` `iss`; `resourceAllowed`; tests `oauth-codex-login.test.ts`
- Business rule/profile/scenario IDs: AgentBridge AB-07 Codex login discovery
- Accounting, stock/rental, tenant/access and customer-data effects: none. No new posting. Existing company flags unchanged
- Migrations, schema/history compatibility and recovery implications: none. Schema stays `ab-06.1`. CoreGuard version `ab-07`
- Dependencies, settings/flags, deployment and external-service changes: none. Owner Portainer Re-pull ON after Docker web image green. Do not set `AGENT_BRIDGE_ALLOW_HMAC`. Do not paste the private key
- Independent diff/impact review and uncertainties: Medium review still applies. This change does not claim a live Codex session connected. Independent retry of `codex mcp login bookone` is required after deploy against the saved connector entry
- Checks executed: `@bookone/agent-bridge` 21 files / 94 passed (oauth-codex-login 6). AgentBridge `tsc --noEmit` passed. Playwright `e2e/agent-bridge-connect.spec.ts` 3 passed. `pnpm --filter @bookone/web build` compiled successfully (Next.js 15.5.19, 141 routes including `/authorize`).
- Failed/skipped/flaky/blocked/not-run checks and reasons: live Codex/Claude, OCR, production IdP, GitHub branch protection stay BLOCKED. Isolated Next+seed browser against a live tenant is not this gate
- New QA assertions or outstanding work; changed expectations and owner decision: unauthenticated discovery must be 401/JSON metadata, never 307 `/login`. After deploy, retry the existing Codex login without adding the server again
- Created staging records/cleanup, if any: none
- Documentation updated: `docs/AGENT_BRIDGE.md`, `docs/AGENT_BRIDGE_CODEX.md`, this CHG, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys. Independent Codex login retry on the saved entry.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them: consent HTML on the authorize route is unchanged except resource validation and `iss` on the callback
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not used
- Before/after behaviour; independent expected/unchanged example: Codex login previously opened `{issuer}/authorize` and rendered Next 404. After this change, discovery reaches `/api/agent-bridge/oauth/authorize` and `/authorize` is an alias of that handler
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/api/agent-bridge/mcp`, `/.well-known/*`, `/authorize`, `/api/agent-bridge/oauth/authorize`, `/login?from=`
- Preserved field/line/source identity, money/stock/history/print and server permissions: posting and documents unchanged
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: Playwright connection source assertions retained
- Exact and adjacent regressions; actual engineering checks and missing layers: AgentBridge CoreGuard suites retained. Dashboard DB-01 retained
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: none
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert the VERSION 2.10.2 commit
- QA companion change/run and independent review link (or pending): pending live Codex login after deploy
