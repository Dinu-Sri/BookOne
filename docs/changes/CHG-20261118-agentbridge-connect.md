# CHG-20261118-agentbridge-connect — Persistent AgentBridge signing and connection screen

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-18
- Product version (`VERSION` file) and base SHA / branch/PR: 2.10.0 on `feat/v210-agentbridge-connect` from origin/master `bcac32a1d3937edae471895f962802e8bbccb882` (v2.9.0)
- QA repository revision and companion PR/change ID: independent staging QA pending; no bookone-qa companion opened in this change
- Intended before/after behaviour with a concrete example: after the usual Portainer Re-pull of the new web image, `GET /api/agent-bridge/oauth/jwks` returns a nonempty RSA `keys` array without a host PEM file. A signed-in user opens `/purchase/inbox/connections`, copies the public MCP URL and `bookone-codex` / `bookone-claude`, and a supported client can complete login → consent (read/upload/draft) → `tools/list` → unpaid service invoice facts/preview. Agents still cannot mint approval. Posting stays company-flag gated.
- Existing behaviour that must remain correct: FILE wins over env PEM; missing FILE does not fall back to env PEM; HMAC stays unset; AUTH_SECRET and entrypoint unchanged; Inbox OFF / draft-only ON / posting-stop ON on the live company; UI-NAV-01 list clipping; tiles remain removed; dashboard DB-01 unchanged
- Actual changed paths/symbols/routes: `ensureOauthSigningPem` / `oauthIssuer` / `publicConnectionDetails`; JWKS and token routes; authorize login `from=`; `/purchase/inbox/connections`; Purchase settings link; staging/prod Compose named volume `agent_bridge_signing`; `docker/Dockerfile.web` secrets dir; tests `oauth-jwks`, `oauth-connect-workflow`, `agent-bridge-signing-compose`, Playwright `e2e/agent-bridge-connect.spec.ts`
- Business rule/profile/scenario IDs: AgentBridge AB-06.1 connect / login / consent / tools.list / unpaid service invoice
- Accounting, stock/rental, tenant/access and customer-data effects: no posting engine change. Consent still grants read/upload/draft only. Human approval required before commit.
- Migrations, schema/history compatibility and recovery implications: none. Signing key lives in the Docker volume, not Git. Restored tenants still reauthorize clients.
- Dependencies, settings/flags, deployment and external-service changes: owner Portainer Re-pull ON after Docker web image green. No host PEM required. Do not set `AGENT_BRIDGE_ALLOW_HMAC`. Do not enable Inbox/posting on the existing live company.
- Independent diff/impact review and uncertainties: Medium review still applies. Live Codex/Claude remain LIVE-UNVERIFIED until independent client sessions pass against this SHA.
- Checks executed: `@bookone/agent-bridge` 20 files / 88 passed. `@bookone/auth` targeted 13 passed. Playwright connect+inbox 7 passed / 1 skipped. AgentBridge `tsc --noEmit` passed.
- Failed/skipped/flaky/blocked/not-run checks and reasons: live Codex/Claude, OCR, production IdP, GitHub branch protection stay BLOCKED. Isolated Next+seed browser against a live tenant is not this gate.
- New QA assertions or outstanding work; changed expectations and owner decision: public JWKS nonempty after Portainer update; connection screen copy fields; login uses `from=`; do not replay CONT11/POS 118/Mission1/2
- Created staging records/cleanup, if any: none
- Documentation updated: `docs/AGENT_BRIDGE.md`, `docs/AGENT_BRIDGE_SIGNING_STAGING.md`, `docs/AGENT_BRIDGE_CODEX.md`, `docs/AGENT_BRIDGE_CLAUDE.md`, this CHG, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master per owner overlay. Owner deploys. Independent QA on staging.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them: BookOne tokens in `globals.css`, party-form-shell, BookOneShell, Button. No new UI framework.
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not used
- Before/after behaviour; independent expected/unchanged example: connections page previously listed connections only and redirected when Inbox was off. It now shows public URL, issuer, JWKS, MCP URL, Codex/Claude client ids and copy-paste setup, and stays reachable from Purchase settings.
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/purchase/inbox/connections`, `/company/purchase`, `/login?from=`, `/api/agent-bridge/oauth/*`, `/.well-known/jwks.json`
- Preserved field/line/source identity, money/stock/history/print and server permissions: posting and documents unchanged
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: Playwright connection screen at 375px plus labelled copy fields
- Exact and adjacent regressions; actual engineering checks and missing layers: AgentBridge CoreGuard suites retained. Dashboard DB-01 retained.
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: none
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert the VERSION 2.10.0 commit. Named volume `agent_bridge_signing` remains until an operator removes it.
- QA companion change/run and independent review link (or pending): pending
