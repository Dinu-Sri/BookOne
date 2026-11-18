# CHG-20261118-agentbridge-signing — Staging AgentBridge signing file + compose forwarding (v2.8.3)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-11-18.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.8.3 on `fix/v283-agentbridge-signing` from origin/master `e9160f3967c6833baaa4892cabf0bfbf27150a3f` / tree `adc6ad171bf4159f2587c805d5711e8ee99fc652` (v2.8.2). UI-NAV-01 list clipping stays; tiles stay removed.
- QA repository revision and companion PR/change ID: SETUP-AGENTBRIDGE-SIGNING. Independent remaining-only AgentBridge mission stays `docs/qa/CODING-AGENTBRIDGE-06-QA.md`. Keep existing company Inbox OFF, draft-only ON, posting-stop ON. Do not replay CONT11, POS 118, Mission2, or consumed v2.7.3/v2.7.4/v2.8.0 clocks.
- Intended before/after behaviour with a concrete example: Portainer stack env `AGENT_BRIDGE_PUBLIC_URL` / `OAUTH_ISSUER` / `OAUTH_KID` reach the web container. A host PKCS8 file at `/opt/bookone/secrets/agent_bridge_oauth_signing.pem` is mounted read-only at `/run/secrets/agent_bridge_oauth_signing.pem` (UID 1001). `oauthSigningPem` reads that file. After owner deploy, `GET /api/agent-bridge/oauth/jwks` returns a nonempty RSA `keys` array with `use: sig`, `alg: RS256`, and the configured kid, with no private fields.
- Existing behaviour that must remain correct: AB-06 gates, unpaid-service v1, flags default off, HMAC fail-closed in production, multiline `AGENT_BRIDGE_OAUTH_SIGNING_PEM` still works when `_FILE` is unset. AUTH_SECRET unchanged. Entrypoint unchanged. Volumes not deleted.
- Actual changed paths/symbols/routes: `oauthSigningPem` / `readSigningPemFile`; `docker/docker-compose.staging.yml` and `docker/docker-compose.prod.yml` env + bind mount; `docs/AGENT_BRIDGE_SIGNING_STAGING.md`; tests `oauth-jwks.test.ts` and `agent-bridge-signing-compose.test.ts`.
- Business rule/profile/scenario IDs: AgentBridge BookOne-as-AS staging signing setup. Not OCR. Not posting enablement.
- Accounting, stock/rental, tenant/access and customer-data effects: none. Token signing configuration only. Existing companies stay Inbox off.
- Migrations, schema/history compatibility and recovery implications: none.
- Dependencies, settings/flags, deployment and external-service changes: new optional stack vars listed in `docs/AGENT_BRIDGE_SIGNING_STAGING.md`. Do not set `AGENT_BRIDGE_ALLOW_HMAC`. Do not put a private key in Git. Owner creates the host PEM once, then updates the stack to this image. This candidate is not fast-forwarded to master in this request. Owner deploys; do not silently redeploy.
- Independent diff/impact review and uncertainties: live JWKS on https://bookone.clossyan.com is LIVE-UNVERIFIED until the owner provisions the host file and deploys this SHA. Real Codex/Claude sessions stay LIVE-UNVERIFIED until independent client runs pass. Isolated Next+Postgres browser skipped unless `AGENT_BRIDGE_E2E_BASE_URL` is set.
- Checks executed: `@bookone/agent-bridge` vitest 19 files / 79 passed (oauth-jwks 5 including PEM_FILE + public-only JWKS token verify). `@bookone/auth` 17 files / 128 passed / 1 skipped. AgentBridge `tsc --noEmit` passed.
- Failed/skipped/flaky/blocked/not-run checks and reasons: live JWKS, real Codex/Claude, staging financial posting, recovery LAST, isolated staging browser, GitHub branch protection stay BLOCKED. Mixed-TENDER split not claimed.
- New QA assertions or outstanding work: after owner deploy, public JWKS nonempty RSA list; then independent OAuth/PKCE/refresh/revocation on a synthetic company. Do not call this real Codex/Claude acceptance.
- Created staging records/cleanup, if any: none. Flag off. Staging unchanged until the owner deploys.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, AGENT_BRIDGE.md, AGENT_BRIDGE_CODEX.md, AGENT_BRIDGE_CLAUDE.md, AGENT_BRIDGE_SIGNING_STAGING.md, `.env.example`.
- Next exact action and responsible role: Reviewable feature-branch PR. Owner creates the host PEM, sets the three non-secret stack vars, waits for Docker web image green after merge, then Portainer Update with Re-pull ON. Leave Inbox/posting off. Recovery LAST. BookOne is not customer-ready.

Final product/QA SHAs belong in PR metadata after commit.

## UI/UX impact and existing-design compatibility

- Not applicable: no UI, layout, or design-token change. Signing configuration and compose forwarding only.
- Direct screens: `GET /api/agent-bridge/oauth/jwks` and `/.well-known/jwks.json` after owner deploy.
- Small rollout: revert this commit; remove the host PEM if unused. No migration.
- QA companion: `docs/AGENT_BRIDGE_SIGNING_STAGING.md` and remaining-only `docs/qa/CODING-AGENTBRIDGE-06-QA.md`.
