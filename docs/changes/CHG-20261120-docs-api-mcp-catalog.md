# CHG-20261120-docs-api-mcp-catalog — Public developer docs, AgentBridge mapping tools, BookOne-first catalog (v2.17.0)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-20
- Product version (`VERSION` file) and base SHA / branch/PR: 2.17.0 on `feat/v2170-docs-api-mcp-catalog` from origin/master `e6df41c706442a5f0547ed4cdff6082b4835a046` / v2.16.4. Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`
- QA repository revision and companion PR/change ID: independent staging QA pending. C4 supervised store pilot is later
- Intended before/after behaviour with a concrete example: Public `/docs` now has **Developers & Integrations** (Custom Website API, WooCommerce, AgentBridge/MCP, errors, compatibility) without a session. An Owner can grant **Allow catalog mapping** on an AgentBridge connection so Codex can preview SKU links; Apply stays on Company → Commerce Integrations. An empty store is queued with **Publish from BookOne**, then Woo 1.2.0 creates drafts and acknowledges IDs. GET `/products` stays mapped-only
- Existing behaviour that must remain correct: purchase-only AgentBridge tokens, consent `read upload draft`, CoreGuard locators (heading Commerce Integrations, Issue scoped key, BookOne product, Preview/Apply mapping), HTTP last-unit posted + remaining 0, CATALOG_VERSION 2, AB-11
- Actual changed paths/symbols/routes: public MDX `apps/web/content/docs/developers/*`; Commerce OpenAPI 3.1 + `/catalog/candidates` + `/catalog/acknowledge`; AgentBridge `commerce_read`/`commerce_propose` tools; migration 051; Woo plugin 1.2.0 `Publish from BookOne`; Company Commerce Link existing / Publish from BookOne / Agent mapping proposals
- Business rule/profile/scenario IDs: CODING-BOOKONE-DOCS-API-MCP-AND-CATALOG
- Accounting, stock/rental, tenant/access and customer-data effects: mapping tools cannot change stock, prices, posting or permissions. Acknowledge writes durable BookOne↔external IDs. HTTP 2xx is not accounting acceptance. Settlement stays not_configured until a payment account is configured
- Migrations, schema/history compatibility and recovery implications: additive `051_commerce_catalog.sql` with RLS. Rollback is DROP of `commerce_mapping_proposals` and `commerce_publish_claims`. CATALOG_VERSION stays 2 because uncustomized Owner/Admin jobs pick up new keys via `allKeys()`
- Dependencies, settings/flags, deployment and external-service changes: plugin ZIP `connectors/woocommerce/release/bookone-commerce-1.2.0.zip` sha256 `0972fa26ea35bad6212b94b69eb2a7e8c681aa7806bfb07e3d02656f32aed6bc`. Owner Portainer Re-pull ON after Docker web image green. Do not enable AgentBridge posting
- Independent diff/impact review and uncertainties: Woo ZIP e2e on a disposable empty store is not-run. Real Codex/Claude mapping discovery is LIVE-UNVERIFIED. Live tenant CoA acceptance is independent
- Checks executed: recorded in TASK_LOG
- Failed/skipped/flaky/blocked/not-run checks: live Woo checkout, Shopify, reservation contention, Codex/Claude live mapping discovery stay not-run. Encrypted restore LAST
- New QA assertions or outstanding work; changed expectations and owner decision: public docs must list Developers nav and serve OpenAPI without a session. Purchase tokens must not list mapping tools. Viewer must not receive mapping action keys
- Created staging records/cleanup, if any: none
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, public `/docs`, `docs/commerce/*`, `docs/AGENT_BRIDGE.md`
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references: FormShell, SelectField, TextField, Button, compact `party-tab active`. Mapping apply still uses Preview then Apply. Publish from BookOne is a separate fieldset from the CoreGuard **BookOne product** combobox
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: Viewer on Commerce still sees Issue scoped key disabled or count 0. Existing Codex `tools/list` stays purchase-only until Allow catalog mapping is saved
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/docs`, `/company/commerce`, `/company/agent-bridge`, `/api/commerce/v1/catalog/*`, `/api/agent-bridge/mcp`
- Preserved field/line/source identity, money/stock/history/print and server permissions: catalog v2. Owner write, Viewer read. Accountant/Purchasing lack mapping keys
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: CoreGuard Playwright commerce locators unchanged. Public docs verified via standalone `apps/docs/build.mjs` and unauthenticated `/docs` + `/api/search`
- Exact and adjacent regressions; actual engineering checks and missing layers: custom-bank Viewer session also opens Commerce
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live-store commerce acceptance or live Codex mapping discovery
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert this VERSION 2.17.0 commit; DROP 051 tables if rolling back schema
- QA companion change/run and independent review link (or pending): pending independent staging review after deploy
