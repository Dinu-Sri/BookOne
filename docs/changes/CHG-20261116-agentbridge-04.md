# CHG-20261116-agentbridge-04 — AgentBridge approve/post permission keys (v2.7.4)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-11-16.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.7.4 on `fix/v274-agentbridge-04` from origin/master `382f0d8f7e242817d046b20c0f16fa05a0a3153a` / v2.7.3. UI-NAV-01 list clipping stays; tiles stay removed.
- QA repository revision and companion PR/change ID: CODING-AGENTBRIDGE-04 / AB-11. Independent review `reviews/REVIEW-20261116-agentbridge-v273.md`. Evidence https://github.com/Dinu-Sri/bookone-qa/pull/123. Do not replay CONT11, POS 118, or Mission2 money. Keep existing company Inbox OFF, draft-only ON, posting-stop ON. Staging remains unchanged.
- Intended before/after behaviour with a concrete example: a standard Owner (also Accountant and Purchasing) whose job grants `agent_bridge.approve` and `agent_bridge.post` passes `allows(..., 'write')` and can approve then post. A Viewer with those grants copied still cannot. A persisted `agent_bridge.approve.write` alias is the same grant. Unknown keys stay denied.
- Existing behaviour that must remain correct: AB-02/AB-03 gates, token∩live grants, Viewer read-only, deny overrides, purchase module ceiling, list clipping, purchase UI, flags default off.
- Actual changed paths/symbols/routes: `allows`/`resolveLevel` explicit-key lookup, `permissionGrantAliases`/`canonicalPermissionKey`, `grantsFromTemplateKey`, job-matrix persist of action keys, `parseScopes` `.write` aliases, `moduleOfKey('agent_bridge')` → purchase ceiling.
- Business rule/profile/scenario IDs: AB-11 from REVIEW-20261116-agentbridge-v273; blocked AB-DB-04/05/06 prerequisites. UX companion `024f8c35223a28c0662d469b71cd96579d4ee24d`.
- Accounting, stock/rental, tenant/access and customer-data effects: no posting path change. Standard Owner/Accountant/Purchasing write checks now match catalog grants. Viewer remains read-only. Purchase-off ceiling still denies AgentBridge write. Restore attachment-key fix retained.
- Migrations, schema/history compatibility and recovery implications: no new migration. Saved `agent_bridge.approve` and `agent_bridge.approve.write` map to the same grant. Job Save now persists the two action keys instead of dropping them. Catalog keys stay `agent_bridge.approve` / `agent_bridge.post` (CATALOG_VERSION 2). Recovery LAST into an empty target.
- Dependencies, settings/flags, deployment and external-service changes: flags stay off. Do not enable Inbox/posting. Do not apply GitHub branch protection. Owner deploys; this candidate is not fast-forwarded to master in this request.
- Independent diff/impact review and uncertainties: GitHub master protection is documented, not applied. Isolated Next+Postgres browser against a fresh synthetic company stays skipped unless `AGENT_BRIDGE_E2E_BASE_URL` is set; that skip is not a missing Owner grant. Independent QA PostgreSQL runtime (upload/approve/post/viewer-deny/reconcile/restore) is the posting/recovery lane and must be re-run on this SHA. Tile navigation remains owner-scheduled separately.
- Checks executed: `@bookone/agent-bridge` vitest 15 files / 46 passed (AB-02 6, AB-03 3, AB-04 2, OAuth JWKS 2). `@bookone/auth` ab04-permissions 13 passed; resolve + catalog + archive + release-gate + UI-NAV + POS register 94 passed in the targeted files. Playwright inbox + UI-NAV-01 10 passed / 1 skipped. AgentBridge and auth `tsc --noEmit` passed.
- Failed/skipped/flaky/blocked/not-run checks and reasons: live OCR remote smoke, production IdP client, external MCP client, Portainer webhook, GitHub branch-protection enforcement, isolated Next+Postgres browser, and the independent bookone-qa PostgreSQL runtime stay BLOCKED/skipped until owner/QA configuration. Mixed-TENDER split not claimed.
- New QA assertions or outstanding work: independent Medium review of the new SHA; retest uses a new clock and fixtures. Never reopen the consumed v2.7.3 retest. Keep posting disabled until qualification.
- Created staging records/cleanup, if any: none. Flag off. Staging unchanged.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, docs/AGENT_BRIDGE.md, docs/AGENT_BRIDGE_BRANCH_PROTECTION.md.
- Next exact action and responsible role: Independent QA retest of this SHA. Owner deploys only after qualification. Leave Inbox/posting off. Recovery LAST. BookOne is not customer-ready.

Final product/QA SHAs belong in PR metadata after commit.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references: `docs/UI_UX_CHANGE_GUIDE.md`, Jobs matrix `TeamJobsScreen`, Purchase suite nav via `NAV_SUITES`.
- Exact external QA commit: `024f8c35223a28c0662d469b71cd96579d4ee24d`.
- Before/after: Jobs matrix now shows Approve inbox proposals and Post approved inbox bills under purchase. Inbox Approve/Commit buttons use the same `assertPermission` keys, which now resolve for standard Owner/Accountant/Purchasing.
- Direct screens: `/company/team/jobs`, `/purchase/inbox`, `/purchase/inbox/[id]`. Transitive: `/api/agent-bridge/v1/*`, `/api/agent-bridge/mcp`.
- Desktop/narrow/keyboard: existing tokens. Two extra job-matrix rows use the existing select control.
- Small rollout: revert commit; saved job rows keep both key forms.
- QA companion: https://github.com/Dinu-Sri/bookone-qa/pull/123.
