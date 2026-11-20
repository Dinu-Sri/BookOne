# CHG-20261120-commerce-ui-operations-repair — Commerce credential dialog, money integrity, UI and Woo queue (v2.16.0)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-20
- Product version (`VERSION` file) and base SHA / branch/PR: 2.16.0 on `feat/v2160-commerce-ui-operations-repair` from origin/master `c4d36555b8c592878fbd4d30d543fc53590fdaf6` / v2.15.3. Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`
- QA repository revision and companion PR/change ID: independent staging QA pending. C4 supervised store pilot is later. Shopify install is later
- Intended before/after behaviour with a concrete example: Issued commerce keys no longer appear in `?issued=` URLs; the one-time secret returns to an accessible dialog. Paid orders with line discounts and shipping post those facts through `createCommercialDocumentWithUser` and store the real document number. A restock refund of one unit on a two-line order restocks only that unit. Invoice posting happens after a durable order row exists. Company Commerce uses compact `active` tabs, a connection list, Preview mapping then Apply mapping, and an activity review queue
- Existing behaviour that must remain correct: sales/inventory/tax/payment/return posting paths, AgentBridge AB-11, CATALOG_VERSION 2, CoreGuard custom-bank and bank-recon, company flags, Codex grant, last-unit idempotent replay, oversell review, reservation disabled
- Actual changed paths/symbols/routes: `packages/commerce` service/store/runtime types; `apps/web` commerce actions, page, `company-commerce.tsx`, `commerce-runtime.ts`, CoreGuard spec; Woo plugin worker/orders/admin; plugin ZIP 1.1.0; docs/commerce
- Business rule/profile/scenario IDs: CODING-COMMERCE-UI-AND-OPERATIONS-REPAIR P0 P1 P2
- Accounting, stock/rental, tenant/access and customer-data effects: posting still uses `createCommercialDocumentWithUser(..., { alreadyAuthorized: true })`. Default posting mode stays preview. Non-zero store tax that BookOne cannot represent is staged. Physical restock requires original line references. HTTP 2xx is not accounting acceptance
- Migrations, schema/history compatibility and recovery implications: no new migration. Existing 050 columns (`status`, `result_json`, `document_id`, unique outbox revision) are used. Rollback is revert of this VERSION commit
- Dependencies, settings/flags, deployment and external-service changes: plugin ZIP `connectors/woocommerce/release/bookone-commerce-1.1.0.zip` sha256 `64de7bcc3dcd95f77a0514f31752f15685dbd7b99dd2b10ecca0370df1a7d785`. Owner Portainer Re-pull ON after Docker web image green. Do not enable AgentBridge posting
- Independent diff/impact review and uncertainties: disposable WordPress/Woo HPOS live checkout remains not-run. CoreGuard HTTP last-unit now requires posted + document + zero sellable qty
- Checks executed: recorded in TASK_LOG
- Failed/skipped/flaky/blocked/not-run checks: live Woo checkout, Shopify, reservation contention, live Codex/Claude, OCR, production IdP stay BLOCKED or not-run. Encrypted restore LAST
- New QA assertions or outstanding work; changed expectations and owner decision: keys issued before 2.16.0 via query string must be rotated. Owner Portainer Re-pull ON after GHCR latest is this SHA
- Created staging records/cleanup, if any: none. CoreGuard uses disposable `bookone_test`
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, `docs/commerce/{QUICKSTART,OPS,MATRIX}`
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them (new or changed UI must name [UI_CONTROL_REGISTRY](../UI_CONTROL_REGISTRY.md) primitives): Company Commerce uses FormShell, FormBackLink, SelectField, TextField, SearchField, Button, ConfirmDialog. Tab class is `active`. No native select or date on the changed screen. `.commerce-workspace` overrides `.party-tabs` flex and `.party-tab-panel` inner scroll so the page uses normal scrolling
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: Viewer opens `/company/commerce` and Issue scoped key is disabled. Owner issues a key that is shown once in a dialog, never in the URL. Switching two connections with opposite pause/posting values does not copy fields
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/company/commerce` only. Other FormShell consumers keep `.party-tab.active` and inner-scroll panels
- Preserved field/line/source identity, money/stock/history/print and server permissions: catalog v2. Owner `allKeys()` receives write. Viewer receives `.read` only
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: CoreGuard Playwright commerce checks the company screen at 1440 and 390
- Exact and adjacent regressions; actual engineering checks and missing layers: custom-bank and bank-recon Playwright stay in the same CoreGuard lane
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live-store commerce acceptance
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert this VERSION 2.16.0 commit
- QA companion change/run and independent review link (or pending): pending independent staging review after deploy
