# CHG-20261120-commerce-ui-sync-followup — Commerce layout, setup evidence and stock fan-out (v2.16.4)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-20
- Product version (`VERSION` file) and base SHA / branch/PR: 2.16.4 on `feat/v2164-commerce-ui-sync-followup` from origin/master `a67a86e033344c14b418e9d747191e91b869d371` / v2.16.3. Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`
- QA repository revision and companion PR/change ID: independent staging QA pending. C4 supervised store pilot is later
- Intended before/after behaviour with a concrete example: A live store that occupied a full-height left rail now uses a compact store selector above Connections, Mapping and Activity. Create connection is its own view with Cancel and Create. Empty catalog offers Open Products. Publish with zero mappings is refused and does not set a publication timestamp. A paid last-unit on one mapped connection writes a zero-quantity inventory event onto the other mapped connection at the same location
- Existing behaviour that must remain correct: one-time key dialog, mapping preview-then-apply, claim-before-post, authorized HTTP last-unit posted + remaining 0, AgentBridge AB-11, CATALOG_VERSION 2
- Actual changed paths/symbols/routes: `/company/commerce` CompanyCommerce layout, FormShell fillViewport, publishStock, emitStock fan-out, catalog load failure, CoreGuard Viewer locators
- Business rule/profile/scenario IDs: CODING-COMMERCE-V2163-UI-AND-SYNC-FOLLOWUP
- Accounting, stock/rental, tenant/access and customer-data effects: stock change events fan out to eligible mapped connections at the same location. HTTP 2xx is not accounting acceptance. Settlement stays not_configured until a payment account is configured
- Migrations, schema/history compatibility and recovery implications: none. Rollback is revert of this VERSION commit
- Dependencies, settings/flags, deployment and external-service changes: Owner Portainer Re-pull ON after Docker web image green. Do not enable AgentBridge posting
- Independent diff/impact review and uncertainties: live signed-in screenshot verification of the new layout was not available in this coding session. Woo live checkout remains not-run. POS and manual inventory changes are not advertised on the commerce emit path
- Checks executed: recorded in TASK_LOG
- Failed/skipped/flaky/blocked/not-run checks: live Woo checkout, Shopify, reservation contention stay not-run. Encrypted restore LAST
- New QA assertions or outstanding work; changed expectations and owner decision: setup complete requires mapping plus a non-zero publish. Last mapping change replaces Catalog read. Review queue is the primary Activity work list
- Created staging records/cleanup, if any: none
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references: FormShell wide fillViewport, SelectField, TextField, SearchField, ConfirmDialog, Button, Badge, compact `party-tab active`
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: Owner with one store sees a compact selector and Continue setup in the first viewport. Viewer keeps Issue scoped key disabled when a store exists
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/company/commerce` only
- Preserved field/line/source identity, money/stock/history/print and server permissions: catalog v2. Owner write, Viewer read
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: CoreGuard Playwright commerce at 1440 then 390, keyboard tabs, mapping preview invalidation. Owner screenshots of v2.16.3 were the overlapping/left-rail baseline
- Exact and adjacent regressions; actual engineering checks and missing layers: custom-bank Viewer session also opens Commerce
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live-store commerce acceptance
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert this VERSION 2.16.4 commit
- QA companion change/run and independent review link (or pending): pending independent staging review after deploy
