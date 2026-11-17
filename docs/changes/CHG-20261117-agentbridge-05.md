# CHG-20261117-agentbridge-05 — AgentBridge v1 unpaid service bill workflow (v2.8.0)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-11-17.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.8.0 on `fix/v280-agentbridge-05` from origin/master `9eb13dabc3bd988bec2ed9e6bb2d17ded05db767` / tree `aa7ff89b146d8f2532dd5a5ef350a0e530e21d6b` (v2.7.4). UI-NAV-01 list clipping stays; tiles stay removed.
- QA repository revision and companion PR/change ID: CODING-AGENTBRIDGE-05-FULL. Independent remaining-only mission `docs/qa/CODING-AGENTBRIDGE-05-QA.md`. Do not replay CONT11, POS 118, Mission2, or consumed v2.7.3/v2.7.4 clocks. Keep existing company Inbox OFF, draft-only ON, posting-stop ON. Staging remains unchanged until the owner deploys.
- Intended before/after behaviour with a concrete example: a connected Codex or Claude client (or a browser user) uploads a domestic unpaid supplier service invoice. With no BookOne OCR configured the document is stored as awaiting-facts, not a dead-end failure. The agent or human submits facts against the stored original, hash and revision. BookOne calculates preview (net 1000 + VAT 180 = gross 1180; Dr6800=1000, Dr2300=180, Cr2100=1180). A trusted human approves in the UI. Commit posts one bill through the existing ERP path. Unsupported paid/stock/FX writes are refused.
- Existing behaviour that must remain correct: AB-02/AB-03/AB-04 gates, token∩live grants, Viewer read-only, purchase module ceiling, list clipping, purchase UI, flags default off, fixture extraction in tests, lost-response reconcile, blob key remapping.
- Actual changed paths/symbols/routes: `@bookone/agent-bridge` schema `ab-05.1`, `awaiting_facts`, `submitExtractedFacts`, upload sessions, batch manifest, lookup tools, strict MCP schemas, protocol version negotiate, HMAC fail-closed in production, OAuth discovery/PKCE consent, `/purchase/inbox` facts+recovery, `/purchase/inbox/connections`, Jobs controlled form, backup DB-backed blob classification, migration `046_agent_bridge_facts.sql`.
- Business rule/profile/scenario IDs: AB-05 Full v1; AB05-UI-01/02/03 from QA PR125. UX companion `024f8c35223a28c0662d469b71cd96579d4ee24d`.
- Accounting, stock/rental, tenant/access and customer-data effects: posting still uses `createCommercialDocumentWithUser` for unpaid service/expense bills only. No stock, payments, FX, arbitrary journals, posted overwrite, or autonomous posting. Existing companies stay Inbox off.
- Migrations, schema/history compatibility and recovery implications: additive 046 (last_error/intake_mode, upload sessions, batches, facts keys, oauth codes, connection scopes/last_used). Rollback is code revert; data columns remain. Connections, upload sessions and oauth codes stay out of tenant archive. Recovery LAST into an empty target after functional outcomes.
- Dependencies, settings/flags, deployment and external-service changes: flags stay off. HMAC fixtures disabled when `NODE_ENV=production` unless `AGENT_BRIDGE_ALLOW_HMAC=1`. Production RS256 still needs `AGENT_BRIDGE_OAUTH_ISSUER` / JWKS. Optional OCR still `AGENT_BRIDGE_OCR_LIVE=1`. Do not enable Inbox/posting. Do not apply GitHub branch protection. Owner deploys; this candidate is not fast-forwarded to master in this request.
- Independent diff/impact review and uncertainties: live Codex and Claude surfaces were not exercised with vendor accounts in this session (LIVE-UNVERIFIED / EXTERNALLY BLOCKED). Isolated Next+Postgres browser against staging stays skipped unless `AGENT_BRIDGE_E2E_BASE_URL` is set. Independent QA PostgreSQL runtime, staging financial workflow and recovery LAST are owner/QA actions. YAML is not GitHub protection proof.
- Checks executed: `@bookone/agent-bridge` vitest 18 files / 65 passed (AB-02 6, AB-03 3, AB-04 2, AB-05 12, OAuth JWKS 2, PKCE 5, schemas 2). `@bookone/auth` tenant-archive + permissions + release-gate 47 passed in the targeted files. Playwright inbox + UI-NAV-01 10 passed / 1 skipped (`AGENT_BRIDGE_E2E_BASE_URL` unset). AgentBridge and db `tsc --noEmit` passed.
- Failed/skipped/flaky/blocked/not-run checks and reasons: live OCR remote smoke, production IdP client, real Codex surface, real Claude surface, Portainer webhook, GitHub branch-protection enforcement, isolated Next+Postgres staging browser, independent bookone-qa PostgreSQL runtime, staging financial posting, and recovery LAST stay BLOCKED/skipped until owner/QA configuration. Mixed-TENDER split not claimed.
- New QA assertions or outstanding work: independent Medium review of the new SHA; new clock; never reopen consumed v2.7.3/v2.7.4 clocks. Keep posting disabled until qualification.
- Created staging records/cleanup, if any: none. Flag off. Staging unchanged.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, docs/AGENT_BRIDGE.md, docs/AGENT_BRIDGE_CODEX.md, docs/AGENT_BRIDGE_CLAUDE.md, docs/qa/CODING-AGENTBRIDGE-05-QA.md, docs/AGENT_BRIDGE_BRANCH_PROTECTION.md.
- Next exact action and responsible role: Independent QA on this feature-branch SHA after owner deploys. Leave Inbox/posting off. Recovery LAST. BookOne is not customer-ready.

Final product/QA SHAs belong in PR metadata after commit.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references: `docs/UI_UX_CHANGE_GUIDE.md`, Jobs matrix `TeamJobsScreen`, Purchase suite nav via `NAV_SUITES`, backup `BackupClient`.
- Exact external QA commit: `024f8c35223a28c0662d469b71cd96579d4ee24d`.
- Before/after: upload without OCR becomes awaiting-facts with a facts form; failed documents show a safe reason and recovery; Jobs selects bind to the current role; backup reports DB-backed AgentBridge files as stored in company data rather than missing S3; Connections lists and revokes agent clients.
- Direct screens: `/purchase/inbox`, `/purchase/inbox/[id]`, `/purchase/inbox/connections`, `/company/team/jobs`, `/company/backup`. Transitive: `/api/agent-bridge/v1/*`, `/api/agent-bridge/mcp`, `/.well-known/oauth-*`.
- Desktop/narrow/keyboard: existing tokens. Facts form uses existing `.field` / `.input` / `Button`.
- Small rollout: revert commit; additive 046 columns remain. Flags unused after revert are harmless.
- QA companion: `docs/qa/CODING-AGENTBRIDGE-05-QA.md`.
