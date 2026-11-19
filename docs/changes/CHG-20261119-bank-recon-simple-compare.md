# CHG-20261119-bank-recon-simple-compare — Bank statement compare and ISO import

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-19
- Product version (`VERSION` file) and base SHA / branch/PR: 2.14.0 on `feat/v2140-bank-recon-simple-compare` from origin/master `274050fa94349faba35c696575d69e7902b8d19b` (v2.13.4)
- QA repository revision and companion PR/change ID: independent staging QA pending. Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`
- Intended before/after behaviour with a concrete example: ISO CSV `2026-11-03` stages four bank lines. Compare shows Bank statement on the left and BookOne on the right. Confirm match links existing records. Finish stays hidden until BookOne 1,460 − waiting 60 = bank 1,400
- Existing behaviour that must remain correct: Studio stages bank lines only; matching does not post journals; create uses `recordEntry`; custom-bank 1101 CoreGuard; CATALOG_VERSION 2; CoreGuard version `ab-11`
- Actual changed paths/symbols/routes: `packages/statement-import` ISO workbook + `finishEligibility`; `apps/web/src/components/bank-import-studio/studio-wizard.tsx`; `apps/web/src/components/reconciliation/reconciliation-compare.tsx`; `apps/web/src/app/actions/bank-reconciliation.ts`; CoreGuard `bank-recon.v1` oracle/postgres/Playwright inside `pnpm coreguard:pilot`
- Business rule/profile/scenario IDs: CODING-BANK-RECONCILIATION-SIMPLE-COMPARE. Seeded Pilot fixture opening 1,000, matching +500/−200/+125, BookOne-only +60, fee −25 created in the isolated run
- Accounting, stock/rental, tenant/access and customer-data effects: matching existing records creates no journals. Creating the fee posts one cashbook journal. Waiting items explain timing. Finish does not lock the period
- Migrations, schema/history compatibility and recovery implications: none. Additive application code only
- Dependencies, settings/flags, deployment and external-service changes: none. Owner deploys after Docker web image green
- Independent diff/impact review and uncertainties: difference formula is `bankClose − bookClose + outstandingNet` so a 60 deposit waiting to clear explains 1,460 vs 1,400. Guided first paint uses a dedicated loaded flag
- Checks executed: recorded in TASK_LOG. CI evidence is the unmasked CoreGuard **Pilot custom-bank** step, now including bank-recon
- Failed/skipped/flaky/blocked/not-run checks: Encrypted restore LAST. Live Codex/Claude stay BLOCKED. POS/rental/sales settlement stay not-run. Ambiguous same-amount pairs, concurrent stale confirmation, and laptop/narrow screenshots are still independent QA
- New QA assertions or outstanding work; changed expectations and owner decision: owner Portainer Re-pull ON after GHCR latest is this SHA
- Created staging records/cleanup, if any: none
- Documentation updated: this CHG, TASK_LOG, PROJECT_STATUS, `docs/coreguard/coverage-matrix.md`, `docs/coreguard/README.md`
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them (new or changed UI must name [UI_CONTROL_REGISTRY](../UI_CONTROL_REGISTRY.md) primitives): compare create category uses `SelectField`; BookOne search uses `TextField`; Review & finish and create preview use `ConfirmDialog`; actions use `Button`
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: ISO file dates stay `YYYY-MM-DD`. Confirm match does not post. Finish is offered only when the difference is explained
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/cashbook/import`, `/cashbook/recon/[sessionId]`, `/reconciliation/session/[sessionId]`, guided and classic workbench
- Preserved field/line/source identity, money/stock/history/print and server permissions: Studio still does not write journals. Server recomputes finish eligibility
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: CoreGuard Playwright bank-recon spec; mobile stacks bank then BookOne for each row
- Exact and adjacent regressions; actual engineering checks and missing layers: custom-bank amounts stay 300 then 200/100. ISO, serial, and invalid CSV unit tests
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live-tenant reconciliation acceptance
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert the VERSION 2.14.0 commit. No schema change
- QA companion change/run and independent review link (or pending): pending independent staging review after deploy
