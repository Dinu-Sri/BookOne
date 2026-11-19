# CHG-20261119-pilot-coreguard-linux-select — Linux SelectField pick for custom-bank opening

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-19
- Product version (`VERSION` file) and base SHA / branch/PR: 2.13.4 on `fix/v2134-pilot-coreguard-linux-select` from origin/master `1c0b00807e2cb1d5fdaa9f0e811d3e87579df2e5` (v2.13.3). Production Check `44563210513` succeeded. Docker web image `44563210797` failed CoreGuard **Pilot custom-bank**.
- QA repository revision and companion PR/change ID: independent staging QA pending. Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`.
- Intended before/after behaviour with a concrete example: opening Account line 2 is 3000 after pick. Linux Chromium on v2.13.3 left the combobox on `2500 · Personal Loans Payable`.
- Existing behaviour that must remain correct: custom-bank 1101 create, opening 300, transfer 100, Viewer read-only, 11xx Simple Entry tenders, CATALOG_VERSION 2
- Actual changed paths/symbols/routes: `apps/web/e2e/coreguard-custom-bank.spec.ts` `pickSelect`
- Business rule/profile/scenario IDs: Pilot CoreGuard workstream 1 custom-bank browser. Rulebook SHA is recorded by independent QA from bookone-qa at review time
- Accounting, stock/rental, tenant/access and customer-data effects: none. Locator-only
- Migrations, schema/history compatibility and recovery implications: none
- Dependencies, settings/flags, deployment and external-service changes: none
- Independent diff/impact review and uncertainties: Playwright force-click on a portaled SelectField option did not apply `onClick` on Linux. Native `HTMLButtonElement.click()` after filtering by code prefix is the pick. Isolated live Owner UI remains independent QA
- Checks executed: recorded in TASK_LOG. CI evidence is the unmasked CoreGuard **Pilot custom-bank** step
- Failed/skipped/flaky/blocked/not-run checks: Docker web image `44563210797` first failure preserved. Encrypted restore LAST. Live Codex/Claude stay BLOCKED
- New QA assertions or outstanding work; changed expectations and owner decision: owner Portainer Re-pull ON after GHCR latest is this SHA
- Created staging records/cleanup, if any: none
- Documentation updated: this CHG, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them (new or changed UI must name [UI_CONTROL_REGISTRY](../UI_CONTROL_REGISTRY.md) primitives): no product UI change. SelectField search + option click stay
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: opening line 2 shows `3000` after pick
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/accounts/opening` CoreGuard browser only
- Preserved field/line/source identity, money/stock/history/print and server permissions: unchanged
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: CI Playwright custom-bank spec
- Exact and adjacent regressions; actual engineering checks and missing layers: custom-bank amounts stay 300 then 200/100
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live CoA UI acceptance
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert the VERSION 2.13.4 commit. No schema change
- QA companion change/run and independent review link (or pending): pending independent staging review after deploy
