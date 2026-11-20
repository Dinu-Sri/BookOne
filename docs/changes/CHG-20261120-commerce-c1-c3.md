# CHG-20261120-commerce-c1-c3 — Commerce API, order intake, Woo plugin and HTTP client (v2.15.0)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-20
- Product version (`VERSION` file) and base SHA / branch/PR: 2.15.0 on `feat/v2150-commerce-c1-c3` from origin/master `d66d0b5452bac01b30a5b08a0e8bc25ce20063d1` / v2.14.4. Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`
- QA repository revision and companion PR/change ID: independent staging QA pending. C4 supervised store pilot is later. Shopify install is later
- Intended before/after behaviour with a concrete example: BookOne had no commerce API. Company → Commerce Integrations now issues scoped `bkc_` keys, maps SKUs, publishes absolute stock, and accepts durable store orders. A paid last-unit HTTP submit with Idempotency-Key returns 202, posts at most one sales invoice through `createCommercialDocumentWithUser`, and a replay recovers the original document. A competing claim is `needs_review` with no negative stock
- Existing behaviour that must remain correct: sales/inventory/tax/payment/return posting paths, AgentBridge AB-11, CATALOG_VERSION 2, CoreGuard custom-bank and bank-recon, company flags, Codex grant
- Actual changed paths/symbols/routes: migration `050_commerce.sql`; `packages/commerce`; `packages/db/src/schema/commerce.ts`; `apps/web/src/app/api/commerce/v1/[...path]/route.ts`; `apps/web/src/lib/commerce-runtime.ts`; `apps/web/src/app/company/commerce`; `apps/web/src/components/commerce/company-commerce.tsx`; `connectors/woocommerce/bookone-commerce`; `scripts/commerce`; CoreGuard seed/run/playwright; `packages/auth` catalog keys `company.commerce.read/write`
- Business rule/profile/scenario IDs: BOOKONE-COMMERCE-FULL-BUILD-PROMPT C1 C2 C3
- Accounting, stock/rental, tenant/access and customer-data effects: posting uses the existing commercial document operation with `alreadyAuthorized: true`. Default posting mode is preview. Oversell policy is review. Reservation mode is disabled. HTTP 2xx is not accounting acceptance
- Migrations, schema/history compatibility and recovery implications: additive 050 + RLS + `bookone_commerce_lookup_credential`. Rollback drops `commerce_*`. Restore LAST
- Dependencies, settings/flags, deployment and external-service changes: new workspace package `@bookone/commerce`. Owner Portainer Re-pull ON after Docker web image green. Do not enable AgentBridge posting
- Independent diff/impact review and uncertainties: Woo live checkout against disposable WordPress is not-run in this candidate. Plugin ZIP, HPOS declaration, worker and independent HTTP client are shipped. CoreGuard requires HTTP last-unit 202
- Checks executed: recorded in TASK_LOG. CI evidence is Docker web image quality plus unmasked CoreGuard **Pilot custom-bank** (now includes commerce)
- Failed/skipped/flaky/blocked/not-run checks: live Woo checkout, Shopify, reservation contention, live Codex/Claude, OCR, production IdP stay BLOCKED or not-run. Encrypted restore LAST
- New QA assertions or outstanding work; changed expectations and owner decision: owner Portainer Re-pull ON after GHCR latest is this SHA. Independent C4 store pilot after mappings are reviewed
- Created staging records/cleanup, if any: none. CoreGuard uses disposable `bookone_test`
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, `docs/commerce/{QUICKSTART,OPS,MATRIX,openapi.yaml}`
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them (new or changed UI must name [UI_CONTROL_REGISTRY](../UI_CONTROL_REGISTRY.md) primitives): Company Commerce uses FormShell, SelectField, TextField, Button. No native select or date on the new screen
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: Viewer opens `/company/commerce` and Issue scoped key is disabled. Owner issues a key that is shown once
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/company/commerce`, Company nav item Commerce Integrations
- Preserved field/line/source identity, money/stock/history/print and server permissions: catalog v2. Owner `allKeys()` receives write. Viewer receives `.read` only
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: CoreGuard Playwright commerce checks the company screen at 1440 and 390
- Exact and adjacent regressions; actual engineering checks and missing layers: custom-bank and bank-recon Playwright stay in the same CoreGuard lane
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live-store commerce acceptance
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert this VERSION 2.15.0 commit. Drop 050 if rolling back a migrated database
- QA companion change/run and independent review link (or pending): pending independent staging review after deploy
