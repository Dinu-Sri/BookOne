# CHG-20261119-agentbridge-11-mcp-negotiation — accept Codex MCP protocol 2025-06-18

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-19
- Product version (`VERSION` file) and base SHA / branch/PR: 2.11.4 on `fix/v2114-agentbridge-11-mcp-negotiation` from origin/master `2edf47391cab2d8f786c324e21f2e28d418c4f45` (v2.11.3)
- QA repository revision and companion PR/change ID: independent live Codex/Claude pending after owner deploy. Handoff CODING-AGENTBRIDGE-11-MCP-NEGOTIATION.md. No bookone-qa companion opened in this change. Keep existing company Inbox ON for the synthetic company that already granted consent, draft-only OFF / posting-stop ON as last observed. Preserve the saved Codex `bookone` entry and the original Permission-granted row. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`.
- Intended before/after behaviour with a concrete example: v2.11.3 live Codex 0.167.0-alpha.4.1 `initialize` requested `protocolVersion: 2025-06-18` and BookOne returned JSON-RPC `-32602 UNSUPPORTED_PROTOCOL` (`Supported: 2025-03-26, 2024-11-05`). After this change, that initialize returns `protocolVersion: 2025-06-18`, `serverInfo.name: bookone-agent-bridge`, and tools-only capabilities. `notifications/initialized` is HTTP 202 with no body. `tools/list` and read-only `get_capabilities` / `get_policy_context` succeed. An unknown requested version returns `2025-06-18` instead of an error. An unsupported `MCP-Protocol-Version` header is HTTP 400.
- Existing behaviour that must remain correct: AB-10 exact callback preservation, AB-09 atomic redemption and branded consent, AB-07 public OAuth/MCP discovery, `/authorize` alias, loopback `/callback/<id>`, RFC 9207 `iss`, exact redirect equality, PKCE S256, public client ids `bookone-codex` / `bookone-claude`, generate-once signing, FILE-wins PEM, HMAC unset, Inbox/posting flags unchanged, UI-NAV-01 list clipping, tiles removed, dashboard DB-01, AB-08 Company AgentBridge two prompts. Consent still never grants post. Every tool still intersects token scopes with live grants.
- Actual changed paths/symbols/routes: `MCP_PROTOCOL_VERSION` / `MCP_SUPPORTED_PROTOCOL_VERSIONS`; `negotiateProtocolVersion`; `handleMcpHttpPost`; `readMcpProtocolVersionHeader`; `/api/agent-bridge/mcp` POST/GET; CoreGuard `ab-11`
- Business rule/profile/scenario IDs: AgentBridge AB-11 MCP protocol negotiation. Live v2.11.3 `UNSUPPORTED_PROTOCOL` for `2025-06-18`
- Accounting, stock/rental, tenant/access and customer-data effects: none. No new posting. Existing company flags unchanged. Consent still never grants post
- Migrations, schema/history compatibility and recovery implications: none. Schema protocol stays `ab-06.1`. CoreGuard version `ab-11`
- Dependencies, settings/flags, deployment and external-service changes: none. Owner Portainer Re-pull ON after Docker web image green. Do not set `AGENT_BRIDGE_ALLOW_HMAC`. Do not paste the private key. Do not enable posting. Do not recreate the saved Codex entry. Do not expand scopes for discovery
- Independent diff/impact review and uncertainties: the coding environment cannot complete official Codex 0.167.0-alpha.4.1 `mcpServerStatus/list` against staging. HTTP regressions use installed Next.js 15.5.19 `NextRequest` plus a node HTTP POST of the live initialize payload through `handleMcpHttpPost` (the function the MCP route calls). This is not a live-tested Codex tool inventory
- Checks executed: `@bookone/agent-bridge` 30 files / 152 passed (mcp-http-negotiation 9, ab11-acceptance 4, ab05 12, mcp 3, oauth-callback-preservation 7, ab10-acceptance 4, coreguard 2). `@bookone/auth` tenant-archive + permissions + ui-nav-01 52 passed. Playwright agent-bridge-01 4 passed / 1 skipped, connect 5 passed, consent 3 passed, ui-nav-01 6 passed. AgentBridge `tsc --noEmit` passed. Installed Next.js 15.5.19 NextRequest HTTP initialize included in mcp-http-negotiation.
- Failed/skipped/flaky/blocked/not-run checks and reasons: live Codex/Claude, OCR, production IdP, GitHub branch protection stay BLOCKED. Consumed codes are not replayed. Actual Codex `get_capabilities` / `get_policy_context` pending independent QA after deploy
- New QA assertions or outstanding work; changed expectations and owner decision: after deploy, independent QA retries initialize on the existing authorized connector before requesting another login. Do not treat this candidate as a complete live Codex feature until official Codex 0.167.0-alpha.4.1 (or newer) completes initialize / tools/list and read-only capabilities
- Created staging records/cleanup, if any: none. Existing live Codex connection row is preserved
- Documentation updated: `docs/AGENT_BRIDGE.md`, `docs/AGENT_BRIDGE_CODEX.md`, `docs/AGENT_BRIDGE_CLAUDE.md`, this CHG, TASK_LOG, PROJECT_STATUS, `docs/qa/ab11/ACCEPTANCE.md`
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys. Independent Codex initialize retry on the saved authorized connector. Do not enable AgentBridge posting

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them: no UI change. Company AgentBridge and consent HTML are unchanged
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: authenticated MCP initialize with `protocolVersion: 2025-06-18` returns that version and tools-only capabilities instead of `-32602 UNSUPPORTED_PROTOCOL`
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/api/agent-bridge/mcp`
- Preserved field/line/source identity, money/stock/history/print and server permissions: posting and documents unchanged
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: no UI restyle
- Exact and adjacent regressions; actual engineering checks and missing layers: AgentBridge CoreGuard suites retained plus HTTP initialize 2025-06-18. Dashboard DB-01 retained. Exact redirect tests retained
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live Codex tool discovery
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert the VERSION 2.11.4 commit. No schema change
- QA companion change/run and independent review link (or pending): pending live Codex initialize after deploy
