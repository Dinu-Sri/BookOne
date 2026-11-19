# CHG-20261119-agentbridge-09-token-diagnose — trace Codex invalid_grant before another login guess

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-19
- Product version (`VERSION` file) and base SHA / branch/PR: 2.11.2 on `fix/v2112-agentbridge-09-token-diagnose` from origin/master `b7e7499afcc7a302c16ded935efb6e81ada49fa0` (v2.11.1)
- QA repository revision and companion PR/change ID: independent live Codex/Claude pending after owner deploy. Handoff AGENTBRIDGE-AB09-RETEST-V2111.md. No bookone-qa companion opened in this change. Keep existing company Inbox ON for the synthetic company that already granted consent, draft-only OFF / posting-stop ON as last observed. Preserve the saved Codex `bookone` entry and the original Permission-granted row. Do not replay consumed authorization codes.
- Intended before/after behaviour with a concrete example: v2.11.1 still returned generic `invalid_grant` after official Windows Codex 0.167.0-alpha.4.1 completed authorize and loopback callback. After this change, authorize and token share a server-generated request id. Company → AgentBridge shows a sanitized last-attempt reason (`missing_tenant_binding`, `row_missing_or_rls_hidden`, `used_code`, `client_mismatch`, `redirect_mismatch`, `expired`, `pkce_mismatch`) with boolean comparisons (hosts equal, ports equal, client matches, tenant GUC matches). Public token JSON stays `{ "error": "invalid_grant" }`. Tenant-bound codes win over `AGENT_BRIDGE_OAUTH_TENANT_HINT` / `tenant_id`. Exact redirect matching is unchanged (`127.0.0.1` is not `localhost`).
- Existing behaviour that must remain correct: AB-07 public OAuth/MCP discovery, `/authorize` alias, loopback `/callback/<id>`, RFC 9207 `iss`, exact redirect equality, PKCE S256, public client ids `bookone-codex` / `bookone-claude`, generate-once signing, FILE-wins PEM, HMAC unset, Inbox/posting flags unchanged by this diagnostic, UI-NAV-01 list clipping, tiles removed, dashboard DB-01, AB-08 Company AgentBridge two prompts, AB-09 branded consent and honest lifecycle labels
- Actual changed paths/symbols/routes: `resolveOauthRedemptionTenant`, `compareRedirectUris`, `recordOauthRedeemDiagnostic`, `/api/agent-bridge/oauth/token` request-id header, `/api/agent-bridge/oauth/authorize` request-id stamp, Company AgentBridge last-attempt line, additive `048`
- Business rule/profile/scenario IDs: AgentBridge AB-09 live retest v2.11.1. Codex 0.167.0-alpha.4.1 token exchange `invalid_grant`
- Accounting, stock/rental, tenant/access and customer-data effects: none. No new posting. Existing company flags unchanged. Consent still never grants post
- Migrations, schema/history compatibility and recovery implications: additive `048_agent_bridge_oauth_redeem_diag.sql` (`request_id` on codes; `last_oauth_*` on connections). Existing consent rows stay permission-granted. Schema protocol stays `ab-06.1`. CoreGuard version `ab-09`
- Dependencies, settings/flags, deployment and external-service changes: none. Owner Portainer Re-pull ON after Docker web image green. Do not set `AGENT_BRIDGE_ALLOW_HMAC`. Do not paste the private key. Do not enable posting. Do not recreate the saved Codex entry
- Independent diff/impact review and uncertainties: the coding environment cannot query staging Postgres or container token logs, so this is a precise diagnostic path plus one source-proven tenant-hint override fix. It is not a live-tested Codex login fix. `127.0.0.1` vs `localhost` remains observed and unproven; exact match stays. Codex 0.167 `handle_callback_with_issuer` posts `grant_type`, `code`, `redirect_uri`, `code_verifier`, `client_id`, and RFC 8707 `resource` as form body; extra `resource` is ignored
- Checks executed: `@bookone/agent-bridge` 26 files / 128 passed (oauth-redeem 10, ab09-acceptance 5, connection-lifecycle 5, oauth-codex-login 6). `@bookone/auth` tenant-archive + permissions + ui-nav-01 39 passed. Playwright `e2e/agent-bridge-connect.spec.ts` 5 passed; `e2e/agent-bridge-consent.spec.ts` 3 passed. AgentBridge and db `tsc --noEmit` passed. Web `tsc --noEmit` leftover `.next/types` cashbook PageProps mismatches pre-existed and are not in this diff.
- Failed/skipped/flaky/blocked/not-run checks and reasons: live Codex/Claude, OCR, production IdP, GitHub branch protection stay BLOCKED. Consumed codes are not replayed
- New QA assertions or outstanding work; changed expectations and owner decision: after deploy, independent `codex mcp login bookone` on the saved entry. Capture Company → AgentBridge last-attempt reason and request id. Do not treat a diagnostic-only candidate as authentication success
- Created staging records/cleanup, if any: none. Existing live Codex connection row is preserved
- Documentation updated: `docs/AGENT_BRIDGE.md`, `docs/AGENT_BRIDGE_CODEX.md`, `docs/AGENT_BRIDGE_CLAUDE.md`, this CHG, TASK_LOG, PROJECT_STATUS, `docs/qa/ab09/ACCEPTANCE.md`
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys. Independent Codex login retry on the saved entry. Read the sanitized reason before another repair. Do not enable AgentBridge posting

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them: Company AgentBridge still uses `.ab-company-page` / `.ab-panel` / `.ab-clients-table`. Added muted `.ab-oauth-diag` under Status for the operator diagnostic line
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: a consent-only Codex row still reads Permission granted / Never used. After a failed token attempt it also shows `Last token attempt refused: <reason>` and an 8-character request id
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/company/agent-bridge`, `/api/agent-bridge/oauth/authorize`, `/api/agent-bridge/oauth/token`
- Preserved field/line/source identity, money/stock/history/print and server permissions: posting and documents unchanged
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: no consent restyle. Diagnostic line uses existing muted 12px copy
- Exact and adjacent regressions; actual engineering checks and missing layers: AgentBridge CoreGuard suites retained. Exact redirect tests retained
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live Codex authentication
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert the VERSION 2.11.2 commit. `last_oauth_*` columns may remain unused
- QA companion change/run and independent review link (or pending): pending live Codex login after deploy
