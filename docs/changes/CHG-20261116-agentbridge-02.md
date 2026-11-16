# CHG-20261116-agentbridge-02 — AgentBridge grouped repair (v2.7.1)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-11-16.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.7.1 on `fix/v271-agentbridge-02` from origin/master `ab54e3493dfbc6cb91d7c9991ae58f2e44610591` / tree `889026fabbae55df0ede71c7efb85dfc6e823773` (v2.7.0). UI-NAV-01 list clipping and docs isolation stay; tiles stay removed.
- QA repository revision and companion PR/change ID: CODING-AGENTBRIDGE-02 / AB-02. Independent review `reviews/REVIEW-20261116-agentbridge-ab54.md`. Evidence draft https://github.com/Dinu-Sri/bookone-qa/pull/121. Do not replay CONT11, POS 118, or Mission2 money. Keep existing company Inbox OFF, draft-only ON, posting-stop ON.
- Intended before/after behaviour with a concrete example: an unsupported paid invoice can no longer obtain approval or reach the posting port; two concurrent idempotency keys for one approved proposal create one bill; a validly signed token without finite expiry is rejected; an agent connection cannot mint human approval; configured OCR forwards bytes instead of throwing the blocked stub; store methods re-enter tenant scope; tenant archive dumps AgentBridge documents and blobs.
- Existing behaviour that must remain correct: purchase UI create/approve, list clipping, docs new-tab, permissions, period locks, VAT posting, duplicate supplier-invoice checks, AgentBridge flags default off.
- Actual changed paths/symbols/routes: `@bookone/agent-bridge` service/authz/extraction/store/jobs/mcp, `045_agent_bridge_claim.sql`, archive dump/restore lists, `/purchase/inbox/[id]` approver identity, runtime tenant wrapping and tenant policy, CoreGuard independent acceptance, branch-protection handoff doc.
- Business rule/profile/scenario IDs: AB-01–AB-07 from REVIEW-20261116-agentbridge-ab54; UX companion `024f8c35223a28c0662d469b71cd96579d4ee24d`.
- Accounting, stock/rental, tenant/access and customer-data effects: posting still uses `createCommercialDocumentWithUser` for unpaid service/expense bills only. No stock, payments, FX, or autonomous posting. Human approval cannot be minted by an agent token.
- Migrations, schema/history compatibility and recovery implications: additive 045 unique claim index on in-flight/posted/unknown operations. Archive now includes AgentBridge tables except connections (reauthorize after restore). Rollback drops the new index; flags unused after revert stay harmless.
- Dependencies, settings/flags, deployment and external-service changes: live OCR opt-in via `AGENT_BRIDGE_OCR_ENDPOINT` / `AGENT_BRIDGE_OCR_KEY` (adapter implemented; remote smoke still owner-gated). Production OAuth via `AGENT_BRIDGE_OAUTH_ISSUER` / JWKS. Local HMAC `ab1.*` remains a labelled fixture. No development-secret fallback. Feature flags default off.
- Independent diff/impact review and uncertainties: GitHub master branch protection is documented, not applied by this change. Isolated staging browser against a fresh synthetic company stays not-run here. Tile navigation remains owner-scheduled separately.
- Checks executed: `@bookone/agent-bridge` vitest 12 files / 39 passed (AB-02 independent acceptance 6 passed, OCR HTTP 2 passed). `@bookone/auth` tenant-archive + AgentBridge permissions + release-gate 33 passed. Playwright `e2e/agent-bridge-01.spec.ts` + `e2e/ui-nav-01.spec.ts` 10 passed / 1 skipped (deployed Next URL unset). AgentBridge `tsc --noEmit` passed.
- Failed/skipped/flaky/blocked/not-run checks and reasons: live OCR remote smoke, production IdP client, external MCP client, Portainer webhook, and GitHub branch-protection enforcement stay BLOCKED until owner configuration. Isolated staging browser not-run. Mixed-TENDER split not claimed.
- New QA assertions or outstanding work: independent Medium review of the new SHA; keep posting disabled until qualification.
- Created staging records/cleanup, if any: none. Flag off.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, docs/AGENT_BRIDGE.md, docs/AGENT_BRIDGE_BRANCH_PROTECTION.md.
- Next exact action and responsible role: Fast-forward master so Docker web image runs. Owner Portainer Re-pull ON. Leave Inbox/posting off. Recovery LAST. BookOne is not customer-ready.

Final product/QA SHAs belong in PR metadata after commit.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references: `docs/UI_UX_CHANGE_GUIDE.md`, `globals.css` `--brand` / `.workspace` / `Button` from `bookone-ui`, Purchase suite nav via `NAV_SUITES`.
- Exact external QA commit: `024f8c35223a28c0662d469b71cd96579d4ee24d`.
- Before/after: Document Inbox review shows the human approver identity after a trusted session grant. Blocking issues stay visible. Commit remains an explicit button.
- Direct screens: `/purchase/inbox`, `/purchase/inbox/[id]`. Transitive: Purchase suite nav, `/company/purchase` flag copy.
- Preserved field/line/source identity and server permissions: commit still goes through existing bill posting.
- Desktop/narrow/keyboard: existing tokens; file input labelled; approval is an explicit button.
- Exact and adjacent regressions: UI-NAV-01 clipping tests remain.
- Conflict/exception: tile-navigation from UI-NAV-01 remains open and owner-scheduled separately.
- Small rollout: revert commit + unused 045 index; flags unused after revert are harmless.
- QA companion: https://github.com/Dinu-Sri/bookone-qa/pull/121.
