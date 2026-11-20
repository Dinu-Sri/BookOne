# CHG-20261120-coreguard-commerce-ui-cleanup — Unique Commerce Integrations locator and journal cleanup (v2.15.3)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-20
- Product version (`VERSION` file) and base SHA / branch/PR: 2.15.3 on `fix/v2153-coreguard-commerce-ui-cleanup` from origin/master `c333f9d783bd8ed69d556dbf6c0ab25a8eef9ef1` / v2.15.2. Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`
- QA repository revision and companion PR/change ID: independent staging QA pending. This is a CoreGuard Playwright follow-up; commerce C1–C3 product behaviour is unchanged
- Intended before/after behaviour with a concrete example: Docker web image `44721171311` Pilot Playwright matched `Commerce Integrations` in both nav and the form title (strict-mode fail). HTTP last-unit passed in 156ms with 202. Cleanup then hit `journal_entries_location_id_locations_id_fk`. After this change the title is scoped to `main`, and recon/journals/transactions delete before locations
- Existing behaviour that must remain correct: Commerce API v1, Woo plugin ZIP, independent HTTP client, custom-bank, bank-recon, CATALOG_VERSION 2, CoreGuard version `ab-11`
- Actual changed paths/symbols/routes: `apps/web/e2e/coreguard-commerce.spec.ts`; `scripts/coreguard/seed.ts` `cleanupPilotSeed`; `packages/auth/test/commerce-gate.test.ts`. No route or schema change
- Business rule/profile/scenario IDs: BOOKONE-COMMERCE-FULL-BUILD-PROMPT CoreGuard wiring
- Accounting, stock/rental, tenant/access and customer-data effects: none. Disposable `bookone_test` cleanup only
- Migrations, schema/history compatibility and recovery implications: none. Restore LAST
- Dependencies, settings/flags, deployment and external-service changes: none. Owner Portainer Re-pull ON after Docker web image green. Do not enable AgentBridge posting
- Independent diff/impact review and uncertainties: v2.15.1 Production Check succeeded. Quality on that SHA succeeded. HTTP last-unit 202 is proven on Linux
- Checks executed: recorded in TASK_LOG. CI evidence is Production Check plus unmasked CoreGuard **Pilot custom-bank**
- Failed/skipped/flaky/blocked/not-run checks: Woo live checkout remains not-run. Live Codex/Claude, OCR, production IdP stay BLOCKED. Encrypted restore LAST. C4 supervised store pilot is later
- New QA assertions or outstanding work; changed expectations and owner decision: owner Portainer Re-pull ON after GHCR latest is this SHA
- Created staging records/cleanup, if any: none
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them: no product UI change
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: Company Commerce Integrations still issues a scoped key once. HTTP last-unit still returns 202
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: CoreGuard disposable companies only
- Preserved field/line/source identity, money/stock/history/print and server permissions: catalog v2
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: CoreGuard Playwright commerce still checks 1440 and 390
- Exact and adjacent regressions; actual engineering checks and missing layers: custom-bank and bank-recon stay in the same Playwright `testMatch`
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live-store commerce acceptance
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert this VERSION 2.15.3 commit. No schema change
- QA companion change/run and independent review link (or pending): pending independent staging review after deploy
