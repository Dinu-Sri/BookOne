# CHG-20261119-pilot-coreguard-custom-bank — Pilot CoreGuard custom-bank integrated lane

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-19
- Product version (`VERSION` file) and base SHA / branch/PR: 2.13.3 on `feat/v2133-pilot-coreguard-custom-bank` from origin/master `5a96baf6691809fcbced7c246bdc25307d379fb7` (v2.13.2). Production Check `44537263806` and Docker web image `44537263906` succeeded on that baseline.
- QA repository revision and companion PR/change ID: independent staging QA pending. Handoff CODING-NEXT-BOOKONE-PILOT-COREGUARD.md. No bookone-qa companion opened in this change. Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`.
- Intended before/after behaviour with a concrete example: CoreGuard publication now runs `pnpm coreguard:pilot` against disposable `bookone_test`. The slice creates custom bank 1101 (Pilot HNB), confirms 0.00, posts a balanced opening of 300 against equity 3000 on 2026-01-15, then transfers 100 to 1100 on 2026-01-16. Independent expected values: 1101=200, 1100=100, spendable cash 300, external transfer flow 0. Viewer remains read-only. Simple Entry From/To lists custom 11xx banks.
- Existing behaviour that must remain correct: COA-01 journals, openings, advances, spendable cash 10xx+11xx, CATALOG_VERSION 2, AgentBridge AB-11, UI-02, UI-NAV-01, DB-01/DB-02, company flags, `needs: [quality, coreguard]`, quality job unmasked
- Actual changed paths/symbols/routes: `scripts/coreguard/*`; `docs/coreguard/*`; `apps/web/e2e/coreguard-custom-bank.spec.ts`; `apps/web/playwright.coreguard.config.ts`; Simple Entry `isLiquidTenderCode` tender filter; CoreGuard registry `pilot-custom-bank`; Docker web image CoreGuard step **Pilot custom-bank**; invoice-intake and setup-order fixtures
- Business rule/profile/scenario IDs: Pilot CoreGuard workstream 1 custom-bank; workstream 2 setup-order rehearsal (CSV/opening); workstream 3 unpaid domestic LKR service/expense bill fixture. Recovery LAST. Rulebook SHA is recorded by independent QA from bookone-qa at review time
- Accounting, stock/rental, tenant/access and customer-data effects: no live-tenant journals. Synthetic companies only. Opening fingerprint still blocks repeats. Viewer cannot write accounts or Simple Entry. 1300 remains available for invoice/bill settlement. No change to real company flags
- Migrations, schema/history compatibility and recovery implications: none. CoreGuard version stays `ab-11`. Schema protocol stays `ab-06.1` plus 049. Encrypted restore is not executed
- Dependencies, settings/flags, deployment and external-service changes: root `better-auth` for the pilot hasher. Owner Portainer Re-pull ON after Docker web image green. Do not change AgentBridge flags or signing material. Do not recreate the saved Codex entry. Local command refuses DATABASE_URL database name `bookone`
- Independent diff/impact review and uncertainties: fixture JSON is the oracle (integer cents). Production `spendableCashFromRows` / `classifyCashJournal` are agreement checks, not expected-value generators. Dashboard default period is the current month; January totals are proven via DB/readback. Isolated live Owner UI and financial replay remain independent QA. This is not live-tenant CoA/dashboard/Codex acceptance
- Checks executed: accounting oracle+setup-order 5 passed; auth allowlist+contract 7 passed; postgres custom-bank 1 passed under `COREGUARD_PILOT=1`; agent-bridge coreguard+invoice-intake 4 passed; `pnpm coreguard:pilot` with browser PASS (Playwright 2 passed). CI evidence is the unmasked CoreGuard **Pilot custom-bank** step
- Failed/skipped/flaky/blocked/not-run checks: postgres slice skipped unless `COREGUARD_PILOT=1` or `COREGUARD_REQUIRE_POSTGRES=1` (quality job has DATABASE_URL without migrate). Browser skipped unless `COREGUARD_PILOT_BROWSER=1` or GitHub Actions. Live Codex/Claude, OCR, production IdP, GitHub branch protection stay BLOCKED. Encrypted restore LAST not executed. POS/rental/sales settlement/returns/stock/recon/partial payment remain not-run in the coverage matrix
- New QA assertions or outstanding work; changed expectations and owner decision: owner Portainer Re-pull ON after GHCR latest is this SHA. Independent QA reviews custom-bank cash on a disposable company. Do not replay CONT11/POS 118/consumed OAuth codes
- Created staging records/cleanup, if any: none. Pilot seed deletes its companies after the run
- Documentation updated: `docs/coreguard/README.md`, coverage-matrix, setup-order, fixtures, `docs/qa/coreguard/ACCEPTANCE.md`, this CHG, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys. Independent QA on staging

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them (new or changed UI must name [UI_CONTROL_REGISTRY](../UI_CONTROL_REGISTRY.md) primitives): Simple Entry native From/To selects stay. The liquid-account filter now uses `isLiquidTenderCode` from accounting so custom 11xx banks appear next to 1000/1100/1200; 1300 stays for invoice/bill settlement. No new screen or control
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: Move Money From/To includes 1101 Pilot HNB. Opening/CoA/Accounts shared controls stay
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: Simple Entry Move Money. CoA wizard, opening, Viewer CoA. Other payment pickers that already used `isLiquidTenderCode` stay
- Preserved field/line/source identity, money/stock/history/print and server permissions: opening preview-then-post; Viewer write still denied; 11xx spendable cash unchanged from COA-01
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: browser proof is the CoreGuard Playwright custom-bank spec against a disposable company, not live staging screenshots
- Exact and adjacent regressions; actual engineering checks and missing layers: AgentBridge CoreGuard suites retained. COA-01 and UI-02 retained. Signing PEM_FILE preserved
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live CoA UI acceptance from source-only checks
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert the VERSION 2.13.3 commit. No schema change
- QA companion change/run and independent review link (or pending): pending independent staging review after deploy
