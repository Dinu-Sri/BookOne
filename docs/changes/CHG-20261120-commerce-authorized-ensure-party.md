# CHG-20261120-commerce-authorized-ensure-party — Authorized commerce posting ensures the customer without a browser session (v2.16.2)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-20
- Product version (`VERSION` file) and base SHA / branch/PR: 2.16.2 on `fix/v2162-commerce-authorized-ensure-party` from origin/master `2771a1e4a52ab2ff3360d521193e7425d64c381b` / v2.16.1. Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`
- QA repository revision and companion PR/change ID: independent staging QA pending
- Intended before/after behaviour with a concrete example: CoreGuard HTTP last-unit on v2.16.1 still returned 202 `needs_review` with `No authenticated session with tenant context` because `ensureParty` read cookies. After this change `createCommercialDocumentWithUser` passes the connection owner into `ensureParty`, so the paid last unit posts
- Existing behaviour that must remain correct: UI invoice posting still uses the logged-in session when `ensureParty` is called without an actor. Viewer cannot post. AgentBridge AB-11, CATALOG_VERSION 2
- Actual changed paths/symbols/routes: `ensureParty(input, actor?)`, `createCommercialDocumentWithUser` party ensure, commerce-gate
- Business rule/profile/scenario IDs: CODING-COMMERCE-UI-AND-OPERATIONS-REPAIR CoreGuard HTTP last-unit posted + document + remaining 0
- Accounting, stock/rental, tenant/access and customer-data effects: posting still uses `createCommercialDocumentWithUser(..., { alreadyAuthorized: true })`. HTTP 2xx is not accounting acceptance
- Migrations, schema/history compatibility and recovery implications: none. Rollback is revert of this VERSION commit
- Dependencies, settings/flags, deployment and external-service changes: Owner Portainer Re-pull ON after Docker web image green. Do not enable AgentBridge posting
- Independent diff/impact review and uncertainties: Woo live checkout remains not-run
- Checks executed: recorded in TASK_LOG
- Failed/skipped/flaky/blocked/not-run checks: live Woo checkout stays not-run. Encrypted restore LAST
- New QA assertions or outstanding work; changed expectations and owner decision: CoreGuard HTTP last-unit must be posted with a document and zero remaining stock
- Created staging records/cleanup, if any: none
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys

## UI/UX impact and existing-design compatibility

Not applicable. No user-visible control, layout, or copy change.
