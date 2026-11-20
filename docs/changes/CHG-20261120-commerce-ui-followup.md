# CHG-20261120-commerce-ui-followup — Commerce first-visit, setup steps and connected layout (v2.16.3)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-20
- Product version (`VERSION` file) and base SHA / branch/PR: 2.16.3 on `feat/v2163-commerce-live-ui` from origin/master `3fdd9f761b58cdd857fdfb9826719ba3c486b25a` / v2.16.2. Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`
- QA repository revision and companion PR/change ID: independent staging QA pending. C4 supervised store pilot is later
- Intended before/after behaviour with a concrete example: A company with no stores sees the heading **Commerce Integrations**, the sentence “Connect your website so BookOne can share stock levels and receive orders.”, three setup stages, and one **New connection** button. The form opens after that click, with Cancel. After create, the selected store shows a compact header, credential and posting sections, and a checklist that does not treat issuing a key as a successful connection
- Existing behaviour that must remain correct: one-time key dialog, mapping preview-then-apply, claim-before-post, authorized HTTP last-unit posted + remaining 0, AgentBridge AB-11, CATALOG_VERSION 2
- Actual changed paths/symbols/routes: `/company/commerce` CompanyCommerce, commerce CSS, issue scopes, apply mapping revalidation, CoreGuard commerce heading/keyboard/preview, Viewer commerce checks in the custom-bank session
- Business rule/profile/scenario IDs: CODING-COMMERCE-LIVE-UI-FOLLOWUP
- Accounting, stock/rental, tenant/access and customer-data effects: none. HTTP 2xx is not accounting acceptance
- Migrations, schema/history compatibility and recovery implications: none. Rollback is revert of this VERSION commit
- Dependencies, settings/flags, deployment and external-service changes: Owner Portainer Re-pull ON after Docker web image green. Do not enable AgentBridge posting
- Independent diff/impact review and uncertainties: live signed-in empty Commerce screen was not available in this coding session. Woo live checkout remains not-run
- Checks executed: recorded in TASK_LOG
- Failed/skipped/flaky/blocked/not-run checks: live Woo checkout, Shopify, reservation contention stay not-run. Encrypted restore LAST
- New QA assertions or outstanding work; changed expectations and owner decision: first visit uses an explicit New connection action. Preview means review incoming orders before they are posted
- Created staging records/cleanup, if any: none
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references: FormShell wide, SelectField, TextField, SearchField, ConfirmDialog, Button, Badge, compact `party-tab active`
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: Viewer opens `/company/commerce` and Issue scoped key is disabled. Owner with no stores sees one New connection button. Owner with stores sees Issue scoped key
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/company/commerce` only
- Preserved field/line/source identity, money/stock/history/print and server permissions: catalog v2. Owner write, Viewer read
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: CoreGuard Playwright commerce at 1440 default then 390, keyboard tabs, mapping preview invalidation
- Exact and adjacent regressions; actual engineering checks and missing layers: custom-bank Viewer session also opens Commerce
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live-store commerce acceptance
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert this VERSION 2.16.3 commit
- QA companion change/run and independent review link (or pending): pending independent staging review after deploy
