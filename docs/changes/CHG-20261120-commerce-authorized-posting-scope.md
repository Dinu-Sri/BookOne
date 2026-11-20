# CHG-20261120-commerce-authorized-posting-scope — Commerce alreadyAuthorized posting uses the connection owner scope (v2.16.1)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-20
- Product version (`VERSION` file) and base SHA / branch/PR: 2.16.1 on `fix/v2161-commerce-authorized-posting-scope` from origin/master `0a1c6f0cea7f1b21aceec4a372801a7e29bbc0bc` / v2.16.0. Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`
- QA repository revision and companion PR/change ID: independent staging QA pending. C4 supervised store pilot is later
- Intended before/after behaviour with a concrete example: CoreGuard HTTP last-unit on v2.16.0 returned 202 `needs_review` because `createCommercialDocumentWithUser` read the browser session for location scope and the headless client has no cookies. After this change the same paid SKU-1 last unit posts through the connection owner, stores a document id, and remaining qty is 0
- Existing behaviour that must remain correct: UI invoice posting still uses the logged-in session scope. Viewer cannot post. AgentBridge AB-11, CATALOG_VERSION 2, company flags, Codex grant
- Actual changed paths/symbols/routes: `dimensionScopeForUser`, `createCommercialDocumentWithUser` alreadyAuthorized dimension path, CoreGuard commerce spec reviewReason, commerce-gate
- Business rule/profile/scenario IDs: CODING-COMMERCE-UI-AND-OPERATIONS-REPAIR CoreGuard HTTP last-unit posted + document + remaining 0
- Accounting, stock/rental, tenant/access and customer-data effects: posting still uses `createCommercialDocumentWithUser(..., { alreadyAuthorized: true })`. HTTP 2xx is not accounting acceptance
- Migrations, schema/history compatibility and recovery implications: none. Rollback is revert of this VERSION commit
- Dependencies, settings/flags, deployment and external-service changes: Owner Portainer Re-pull ON after Docker web image green. Do not enable AgentBridge posting
- Independent diff/impact review and uncertainties: Woo live checkout remains not-run
- Checks executed: recorded in TASK_LOG
- Failed/skipped/flaky/blocked/not-run checks: live Woo checkout, Shopify, reservation contention, live Codex/Claude stay BLOCKED or not-run. Encrypted restore LAST
- New QA assertions or outstanding work; changed expectations and owner decision: CoreGuard HTTP last-unit must be posted with a document and zero remaining stock
- Created staging records/cleanup, if any: none. CoreGuard uses disposable `bookone_test`
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys

## UI/UX impact and existing-design compatibility

Not applicable. No user-visible control, layout, or copy change. Company Commerce UI from v2.16.0 is unchanged.
