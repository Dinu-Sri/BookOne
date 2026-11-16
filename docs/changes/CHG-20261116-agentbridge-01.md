# CHG-20261116-agentbridge-01 — AgentBridge Foundation (v2.7.0)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-11-16.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.7.0 on `feat/v270-agentbridge-01` from origin/master `aa3e1015f93058181792dc91b68681b4eab045f3` / tree `c9157cb77fe38a3441133fba6c8a023f619b35e7` (v2.6.1). UI-NAV-01 list clipping and docs isolation stay; tiles already removed in v2.6.1.
- QA repository revision and companion PR/change ID: CODING-AGENTBRIDGE-01 / AB-01 Build1. Scoped CoreGuard AgentBridge only (not all-module CG-01). Do not replay CONT11, POS 118, or Mission2 money.
- Intended before/after behaviour with a concrete example: with the company AgentBridge flag ON, an Owner uploads a domestic unpaid supplier service invoice to Document Inbox. Extraction proposes facts; BookOne asks plain questions when needed; a server-calculated preview shows net/VAT/gross/AP; human approval binds the revision; commit posts one purchase bill through the existing commercial posting path. Flag defaults OFF; posting stays disabled until the owner flips the stop switch.
- Existing behaviour that must remain correct: purchase UI create/approve, list clipping, docs new-tab, permissions, period locks, VAT posting, duplicate supplier-invoice checks.
- Actual changed paths/symbols/routes: `@bookone/agent-bridge`, migration `044_agent_bridge.sql`, `/purchase/inbox`, `/api/agent-bridge/v1/*`, `/api/agent-bridge/mcp`, permission keys `purchase.inbox.*` / `agent_bridge.approve` / `agent_bridge.post`, Docker CoreGuard job.
- Business rule/profile/scenario IDs: AB-01A–E; UX companion `024f8c35223a28c0662d469b71cd96579d4ee24d`.
- Accounting, stock/rental, tenant/access and customer-data effects: posting uses existing `createCommercialDocument` for unpaid service/expense bills only. No stock, payments, FX, or autonomous posting.
- Migrations, schema/history compatibility and recovery implications: additive 044; rollback is drop new tables (no live rows expected while flag is off).
- Dependencies, settings/flags, deployment and external-service changes: `AGENT_BRIDGE_TOKEN_SECRET` for MCP tokens; extraction provider env (`AGENT_BRIDGE_OCR_ENDPOINT` / key) optional. Missing provider/IdP remains BLOCKED. Feature flags default off.
- Independent diff/impact review and uncertainties: live OCR and production OAuth registration are owner configuration blockers.
- Checks executed: `@bookone/agent-bridge` vitest 10 files / 29 passed. `@bookone/auth` 13 files / 109 passed. `@bookone/accounting` 18 files / 237 passed. AgentBridge and db `tsc --noEmit` passed. Playwright inbox + UI-NAV-01 9 passed.
- Failed/skipped/flaky/blocked/not-run checks and reasons: live OCR, production IdP, external MCP client, Portainer webhook, and GitHub branch-protection enforcement stay BLOCKED. Isolated staging browser not-run. Mixed-TENDER split not claimed.
- New QA assertions or outstanding work: independent Medium review; live provider smoke BLOCKED; production IdP BLOCKED.
- Created staging records/cleanup, if any: none. Flag off.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, docs/AGENT_BRIDGE.md.
- Next exact action and responsible role: Fast-forward master so Docker web image runs. Owner Portainer Re-pull ON, then decide whether to enable AgentBridge per company. Recovery LAST. BookOne is not customer-ready.

Final product/QA SHAs belong in PR metadata after commit.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references: `docs/UI_UX_CHANGE_GUIDE.md`, `globals.css` `--brand` / `.workspace` / `Button` from `bookone-ui`, Purchase suite nav via `NAV_SUITES` + `filterVisibleSuites`.
- Exact external QA commit: `024f8c35223a28c0662d469b71cd96579d4ee24d`.
- Before/after: Document Inbox appears only when the company flag is on and the job has `purchase.inbox.read`. Accounting list clipping unchanged.
- Direct screens: `/purchase/inbox`, `/purchase/inbox/[id]`. Transitive: Purchase suite nav, `/company/purchase` flag copy.
- Preserved field/line/source identity and server permissions: commit goes through existing bill posting.
- Desktop/narrow/keyboard: inbox list and review form use existing tokens; file input labelled; approval is an explicit button.
- Exact and adjacent regressions: UI-NAV-01 clipping tests remain.
- Conflict/exception: none.
- Small rollout: revert commit + unused tables; flags unused after revert are harmless.
- QA companion: pending product PR.
