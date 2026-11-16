# CHG-20261116-agentbridge-03 — AgentBridge authorization, reconciliation, restore (v2.7.3)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-11-16.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.7.3 on `fix/v273-agentbridge-03` from origin/master `29675262eaa2dc36f7e4d6a19730aa517295b352` / v2.7.2. UI-NAV-01 list clipping stays; tiles stay removed.
- QA repository revision and companion PR/change ID: CODING-AGENTBRIDGE-03 / AB-03. Independent review `reviews/REVIEW-20261116-agentbridge-v272.md`. Evidence draft https://github.com/Dinu-Sri/bookone-qa/pull/122. Do not replay CONT11, POS 118, or Mission2 money. Keep existing company Inbox OFF, draft-only ON, posting-stop ON.
- Intended before/after behaviour with a concrete example: a Viewer with a valid old post-scoped token is refused at commit and creates zero bills; a lost-response operation that already exists in ERP returns posted and moves the inbox document to posted without a second bill; restored AgentBridge blob keys keep the same path UUID as the document storageKey so `getOwnedAttachment` returns the original bytes.
- Existing behaviour that must remain correct: AB-02 gates, claim, finite tokens, human-only approval, OCR HTTP adapter, flags default off, list clipping, purchase UI.
- Actual changed paths/symbols/routes: `authorizeAgentConnection` (token∩live grants, fail closed, unknown connection), `AgentBridgeService.authorizeActor` on every operation, `reconcileExisting` document sync, archive storage-pointer `key`, REST/MCP `resolveActorFromAuthorization`, restore safety flags/approvals.
- Business rule/profile/scenario IDs: AB-08 / AB-DB-05, AB-09 / AB-DB-06, AB-10 / AB-REC-02 from REVIEW-20261116-agentbridge-v272; UX companion `024f8c35223a28c0662d469b71cd96579d4ee24d`.
- Accounting, stock/rental, tenant/access and customer-data effects: posting still uses `createCommercialDocumentWithUser` for unpaid service bills only. Viewer stale tokens cannot post. Restored approvals are revoked; restored settings keep posting stopped. Connections stay excluded.
- Migrations, schema/history compatibility and recovery implications: no new migration. Archive remap applies the shared tenant-prefix rule to blob `key`. Recovery LAST into an empty target.
- Dependencies, settings/flags, deployment and external-service changes: REST/MCP now call the RS256/JWKS verifier when the bearer token is not an `ab1.*` fixture. Production IdP still unregistered until `AGENT_BRIDGE_OAUTH_ISSUER` / JWKS are set. Flags stay off.
- Independent diff/impact review and uncertainties: GitHub master protection is documented, not applied. Isolated Next+seed browser against a fresh synthetic company stays skipped unless `AGENT_BRIDGE_E2E_BASE_URL` is set. Tile navigation remains owner-scheduled separately.
- Checks executed: `@bookone/agent-bridge` vitest 14 files / 44 passed (AB-02 6, AB-03 3, OAuth JWKS 2). `@bookone/auth` tenant-archive + permissions + release-gate 34 passed. Playwright inbox + UI-NAV-01 10 passed / 1 skipped. AgentBridge `tsc --noEmit` passed. GitHub API 2026-11-16: `master` Branch not protected.
- Failed/skipped/flaky/blocked/not-run checks and reasons: live OCR remote smoke, production IdP client, external MCP client, Portainer webhook, GitHub branch-protection enforcement, and isolated Next+Postgres browser stay BLOCKED/skipped until owner configuration. Mixed-TENDER split not claimed.
- New QA assertions or outstanding work: independent Medium review of the new SHA; keep posting disabled until qualification. Retest uses a new clock and fixtures.
- Created staging records/cleanup, if any: none. Flag off.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, docs/AGENT_BRIDGE.md, docs/AGENT_BRIDGE_BRANCH_PROTECTION.md.
- Next exact action and responsible role: Fast-forward master so Docker web image runs. Owner Portainer Re-pull ON. Leave Inbox/posting off. Recovery LAST. BookOne is not customer-ready.

Final product/QA SHAs belong in PR metadata after commit.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references: `docs/UI_UX_CHANGE_GUIDE.md`, Purchase suite nav via `NAV_SUITES`.
- Exact external QA commit: `024f8c35223a28c0662d469b71cd96579d4ee24d`.
- Before/after: Inbox still shows human approver identity. Commit remains an explicit button. No new screens.
- Direct screens: `/purchase/inbox`, `/purchase/inbox/[id]`. Transitive: `/api/agent-bridge/v1/*`, `/api/agent-bridge/mcp`.
- Desktop/narrow/keyboard: existing tokens.
- Small rollout: revert commit; restored archives taken on this SHA keep aligned blob keys.
- QA companion: https://github.com/Dinu-Sri/bookone-qa/pull/122.
