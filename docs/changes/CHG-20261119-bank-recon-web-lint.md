# CHG-20261119-bank-recon-web-lint — Type Studio save confirmation and statement difference (v2.14.1)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-19
- Product version (`VERSION` file) and base SHA / branch/PR: 2.14.1 on `fix/v2141-bank-recon-web-lint` from origin/master `2b4be31eaaa433ab7499140ee063d5359283190e` / v2.14.0 (PR https://github.com/Dinu-Sri/BookOne/pull/38 MERGED). Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`
- QA repository revision and companion PR/change ID: independent staging QA pending. This is a compile follow-up for bank-recon simple compare; import/match/finish behaviour is unchanged
- Intended before/after behaviour with a concrete example: Production Check `44571222338` and Docker web image `44571222119` failed web `tsc` at `studio-wizard.tsx` (`||` mixed with `??` in the save confirmation, and `formatRs` given `number | null`). After this change the save copy still prefers typed opening/closing then inferred then —, and a missing arithmetic difference shows —
- Existing behaviour that must remain correct: ISO/serial dates, Bank-left/BookOne-right compare, Confirm match without journals, Review & finish only when `bankClose − bookClose + outstandingNet` is zero, custom-bank 1101 CoreGuard, CATALOG_VERSION 2, CoreGuard version `ab-11`
- Actual changed paths/symbols/routes: `apps/web/src/components/bank-import-studio/studio-wizard.tsx` save confirmation and statement-equation difference. No route or schema change
- Business rule/profile/scenario IDs: CODING-BANK-RECONCILIATION-SIMPLE-COMPARE compile follow-up
- Accounting, stock/rental, tenant/access and customer-data effects: none. Types and display fallbacks only. No new journals
- Migrations, schema/history compatibility and recovery implications: none. Restore LAST
- Dependencies, settings/flags, deployment and external-service changes: none. Owner Portainer Re-pull ON after Docker web image green. Do not change AgentBridge flags or signing material. Do not recreate the saved Codex entry
- Independent diff/impact review and uncertainties: v2.14.0 image was not published from the failed lint. Pin QA to this SHA after Docker web image is green
- Checks executed: local `@bookone/web` `tsc` no longer reports `studio-wizard.tsx`. Remaining local hits are `.next/types` PageProps noise absent from a clean CI checkout. Docker web image `44571222119` CoreGuard **Pilot custom-bank** on v2.14.0 `2b4be31`: accounting oracle 6 passed (custom-bank + bank-recon), auth 9 passed including bank-recon postgres 1102=1485 / 5 journals; `next build` failed on the same wizard mix so Playwright did not run
- Failed/skipped/flaky/blocked/not-run checks: v2.14.0 Playwright bank-recon not-run because `next build` failed. live Codex/Claude, OCR, production IdP, GitHub branch protection stay BLOCKED. Encrypted restore LAST. POS/rental/sales settlement stay not-run. Ambiguous same-amount pairs, date-boundary edges, duplicate re-import, Viewer write denial, and laptop/narrow screenshots remain independent QA
- New QA assertions or outstanding work; changed expectations and owner decision: owner Portainer Re-pull ON after GHCR latest is this SHA
- Created staging records/cleanup, if any: none
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, `docs/qa/bank-recon/ACCEPTANCE.md`
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them: no new control. Studio save confirmation and statement equation keep the v2.14.0 copy
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: ISO CSV still stages four bank lines. Confirm match still does not post. Finish is still offered only when the difference is explained
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/cashbook/import` save confirmation and review equation
- Preserved field/line/source identity, money/stock/history/print and server permissions: Studio still does not write journals. Server still recomputes finish eligibility
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: no layout change
- Exact and adjacent regressions; actual engineering checks and missing layers: custom-bank amounts stay 300 then 200/100. ISO, serial, and invalid CSV unit tests from v2.14.0 stay
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live-tenant reconciliation acceptance
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert this VERSION 2.14.1 commit. No schema change
- QA companion change/run and independent review link (or pending): pending independent staging review after deploy
