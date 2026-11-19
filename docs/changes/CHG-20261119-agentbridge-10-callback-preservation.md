# CHG-20261119-agentbridge-10-callback-preservation — persist Codex’s exact loopback callback through Next.js URL parsing

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-19
- Product version (`VERSION` file) and base SHA / branch/PR: 2.11.3 on `fix/v2113-agentbridge-10-callback-preservation` from origin/master `45d1f2f880ea2d56941e7a5f549430be9a1a2a0f` (v2.11.2)
- QA repository revision and companion PR/change ID: independent live Codex/Claude pending after owner deploy. Handoff CODING-AGENTBRIDGE-10-EXACT-CALLBACK-PRESERVATION.md. No bookone-qa companion opened in this change. Keep existing company Inbox ON for the synthetic company that already granted consent, draft-only OFF / posting-stop ON as last observed. Preserve the saved Codex `bookone` entry and the original Permission-granted row. Do not replay consumed authorization codes, including request `4b22d15c`.
- Intended before/after behaviour with a concrete example: v2.11.2 live token exchange returned `redirect_mismatch` for request `4b22d15c` after Codex 0.167 requested `http://127.0.0.1:<port>/callback/<id>`. BookOne had stored `localhost` with the same port and path. Next.js 15.5.19 `NextURL.parseURL` rewrites nested `127.0.0.1` in the authorize query to `localhost`. After this change, authorize GET reads `redirect_uri` from the Fetch Request URL, renders that exact value in the consent form, persists it on Allow, and token exchange still requires `stored === presented`. A code stored for `127.0.0.1` still refuses `localhost`.
- Existing behaviour that must remain correct: AB-07 public OAuth/MCP discovery, `/authorize` alias, loopback `/callback/<id>`, RFC 9207 `iss`, exact redirect equality, PKCE S256, public client ids `bookone-codex` / `bookone-claude`, generate-once signing, FILE-wins PEM, HMAC unset, Inbox/posting flags unchanged, UI-NAV-01 list clipping, tiles removed, dashboard DB-01, AB-08 Company AgentBridge two prompts, AB-09 branded consent, honest lifecycle labels, sanitized last-attempt diagnostics
- Actual changed paths/symbols/routes: `oauthRequestUrl` / `oauthSearchParams` / `oauthSignInFromTarget` / `loginCallbackFromSearch`; `/api/agent-bridge/oauth/authorize` GET query parse and `/login?from=`; `/login` reads `window.location.search` for `from`; CoreGuard `ab-10`
- Business rule/profile/scenario IDs: AgentBridge AB-10 exact callback preservation. Live v2.11.2 `redirect_mismatch` request `4b22d15c`
- Accounting, stock/rental, tenant/access and customer-data effects: none. No new posting. Existing company flags unchanged. Consent still never grants post
- Migrations, schema/history compatibility and recovery implications: none. Schema protocol stays `ab-06.1`. CoreGuard version `ab-10`
- Dependencies, settings/flags, deployment and external-service changes: none. `skipMiddlewareUrlNormalize` is not enabled; NextURL still rewrites `nextUrl`, so authorize does not read `req.nextUrl.searchParams`. Owner Portainer Re-pull ON after Docker web image green. Do not set `AGENT_BRIDGE_ALLOW_HMAC`. Do not paste the private key. Do not enable posting. Do not recreate the saved Codex entry
- Independent diff/impact review and uncertainties: the coding environment cannot complete official Codex 0.167.0-alpha.4.1 consent against staging. Framework/HTTP regressions use installed Next.js 15.5.19 `NextRequest` plus an HTTP authorize GET → form → POST → persist → token path. This is not a live-tested Codex login. Consumed request `4b22d15c` is not replayed
- Checks executed: `@bookone/agent-bridge` 28 files / 139 passed (oauth-callback-preservation 7, ab10-acceptance 4, oauth-redeem 10, oauth-codex-login 6, oauth-connect-workflow 4, coreguard 2). `@bookone/auth` tenant-archive + permissions + ui-nav-01 39 passed. Playwright `e2e/agent-bridge-connect.spec.ts` 5 passed; `e2e/agent-bridge-consent.spec.ts` 3 passed. AgentBridge `tsc --noEmit` passed. Installed Next.js 15.5.19 NextRequest reproduction included in oauth-callback-preservation.
- Failed/skipped/flaky/blocked/not-run checks and reasons: live Codex/Claude, OCR, production IdP, GitHub branch protection stay BLOCKED. Consumed codes are not replayed
- New QA assertions or outstanding work; changed expectations and owner decision: after deploy, independent `codex mcp login bookone` on the saved entry with a new authorization code. Do not treat this candidate as live Codex authentication until that retry completes initialize/tools/list and read-only capabilities
- Created staging records/cleanup, if any: none. Existing live Codex connection row is preserved
- Documentation updated: `docs/AGENT_BRIDGE.md`, `docs/AGENT_BRIDGE_CODEX.md`, this CHG, TASK_LOG, PROJECT_STATUS, `docs/qa/ab10/ACCEPTANCE.md`
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys. Independent Codex login retry on the saved entry with a new code. Do not enable AgentBridge posting

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them: consent HTML and Company AgentBridge screens are unchanged. Login still uses `/login?from=`
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: signed-in authorize GET for `redirect_uri=http://127.0.0.1:61241/callback/id` renders that host in the hidden field and stores it. Token POST with `localhost` is `invalid_grant` / `redirect_mismatch`
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/api/agent-bridge/oauth/authorize`, `/login`, `/api/agent-bridge/oauth/token`
- Preserved field/line/source identity, money/stock/history/print and server permissions: posting and documents unchanged
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: no consent restyle
- Exact and adjacent regressions; actual engineering checks and missing layers: AgentBridge CoreGuard suites retained plus NextRequest/HTTP callback preservation. Dashboard DB-01 retained. Exact redirect tests retained
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live Codex authentication
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert the VERSION 2.11.3 commit. No schema change
- QA companion change/run and independent review link (or pending): pending live Codex login after deploy
