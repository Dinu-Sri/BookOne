# CHG-20261119-bank-recon-erp-import — Drive bank-recon CoreGuard through ERP import (v2.14.2)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-19
- Product version (`VERSION` file) and base SHA / branch/PR: 2.14.2 on `fix/v2142-bank-recon-erp-import` from origin/master `23efc95c0cd7faaaf15c14ae32b9b45a4171053d` / v2.14.1 (PR https://github.com/Dinu-Sri/BookOne/pull/39). Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`
- QA repository revision and companion PR/change ID: independent staging QA pending. This is a CoreGuard route follow-up; import/match/finish behaviour is unchanged
- Intended before/after behaviour with a concrete example: Docker web image `44572345551` CoreGuard **Pilot custom-bank** failed Playwright bank-recon: after login the spec opened `/cashbook/import`, which redirects company tenants to `/`. Playwright then attached the ISO CSV to another file input. After this change the spec opens `/reconciliation/import`, waits for Upload bank file, and uses `bis-file-input`
- Existing behaviour that must remain correct: ISO/serial dates, Bank-left/BookOne-right compare, Confirm match without journals, Review & finish only when the difference is explained, custom-bank 1101 CoreGuard, CATALOG_VERSION 2, CoreGuard version `ab-11`
- Actual changed paths/symbols/routes: `apps/web/e2e/coreguard-bank-recon.spec.ts`; `apps/web/src/components/bank-import-studio/studio-wizard.tsx` `data-testid="bis-file-input"`. No route or schema change
- Business rule/profile/scenario IDs: CODING-BANK-RECONCILIATION-SIMPLE-COMPARE CoreGuard ERP import
- Accounting, stock/rental, tenant/access and customer-data effects: none. Spec route only. No new journals
- Migrations, schema/history compatibility and recovery implications: none. Restore LAST
- Dependencies, settings/flags, deployment and external-service changes: none. Owner Portainer Re-pull ON after Docker web image green
- Independent diff/impact review and uncertainties: v2.14.1 Production Check succeeded. Docker lint/typecheck/build/test succeeded. Custom-bank Playwright 2 passed. Bank-recon Playwright failed before Which bank?
- Checks executed: recorded in TASK_LOG. CI evidence is the unmasked CoreGuard **Pilot custom-bank** step
- Failed/skipped/flaky/blocked/not-run checks: live Codex/Claude, OCR, production IdP stay BLOCKED. Encrypted restore LAST. POS/rental/sales settlement stay not-run. Ambiguous same-amount pairs, date-boundary edges, duplicate re-import, Viewer write denial, and laptop/narrow screenshots remain independent QA
- New QA assertions or outstanding work; changed expectations and owner decision: owner Portainer Re-pull ON after GHCR latest is this SHA
- Created staging records/cleanup, if any: none
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, `docs/qa/bank-recon/ACCEPTANCE.md`
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them: no visual change. Studio upload keeps the hidden file input
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: Pilot Alpha imports at `/reconciliation/import`. Confirm match still does not post. Finish is still offered only when the difference is explained
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/reconciliation/import` for company tenants; `/cashbook/import` stays personal/sole
- Preserved field/line/source identity, money/stock/history/print and server permissions: Studio still does not write journals
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: CoreGuard Playwright bank-recon spec
- Exact and adjacent regressions; actual engineering checks and missing layers: custom-bank Playwright 2 passed on v2.14.1 `44572345551`
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live-tenant reconciliation acceptance
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert this VERSION 2.14.2 commit. No schema change
- QA companion change/run and independent review link (or pending): pending independent staging review after deploy
