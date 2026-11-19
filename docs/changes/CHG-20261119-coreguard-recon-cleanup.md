# CHG-20261119-coreguard-recon-cleanup — Delete recon rows before Pilot cleanup (v2.14.3)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-19
- Product version (`VERSION` file) and base SHA / branch/PR: 2.14.3 on `fix/v2143-coreguard-recon-cleanup` from origin/master `7e1b2672e835d82b2e66f8edf5e3880cc405fd65` / v2.14.2 (PR https://github.com/Dinu-Sri/BookOne/pull/40). Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`
- QA repository revision and companion PR/change ID: independent staging QA pending. This is a CoreGuard cleanup follow-up; import/match/finish behaviour is unchanged
- Intended before/after behaviour with a concrete example: Docker web image `44573723494` CoreGuard **Pilot custom-bank** ran Playwright bank-recon in 5.8s (pass) and custom-bank 2 passed, then cleanup failed deleting `transactions` while `bank_reconciliation_case_book_transactions` still referenced them. After this change cleanup deletes recon and statement rows first
- Existing behaviour that must remain correct: ISO import, Bank-left/BookOne-right compare, Confirm match without journals, Review & finish only when the difference is explained, custom-bank 1101, CATALOG_VERSION 2, CoreGuard version `ab-11`
- Actual changed paths/symbols/routes: `scripts/coreguard/seed.ts` `cleanupPilotSeed`. No route or schema change
- Business rule/profile/scenario IDs: CODING-BANK-RECONCILIATION-SIMPLE-COMPARE CoreGuard cleanup
- Accounting, stock/rental, tenant/access and customer-data effects: none. Disposable `bookone_test` cleanup only
- Migrations, schema/history compatibility and recovery implications: none. Restore LAST
- Dependencies, settings/flags, deployment and external-service changes: none. Owner Portainer Re-pull ON after Docker web image green
- Independent diff/impact review and uncertainties: v2.14.2 Production Check succeeded. Docker lint/typecheck/build/test succeeded. Playwright bank-recon passed on Linux Chromium
- Checks executed: recorded in TASK_LOG. CI evidence is the unmasked CoreGuard **Pilot custom-bank** step
- Failed/skipped/flaky/blocked/not-run checks: live Codex/Claude, OCR, production IdP stay BLOCKED. Encrypted restore LAST. POS/rental/sales settlement stay not-run. Ambiguous same-amount pairs, date-boundary edges, duplicate re-import, Viewer write denial, and laptop/narrow screenshots remain independent QA
- New QA assertions or outstanding work; changed expectations and owner decision: owner Portainer Re-pull ON after GHCR latest is this SHA
- Created staging records/cleanup, if any: none
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, `docs/qa/bank-recon/ACCEPTANCE.md`
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them: no UI change
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: ISO import still matches three existing entries without journals, then finishes after fee + waiting 60
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: CoreGuard disposable companies only
- Preserved field/line/source identity, money/stock/history/print and server permissions: Studio still does not write journals on match
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: Docker web image `44573723494` Playwright bank-recon 5.8s pass
- Exact and adjacent regressions; actual engineering checks and missing layers: custom-bank Playwright 2 passed on the same run
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live-tenant reconciliation acceptance
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert this VERSION 2.14.3 commit. No schema change
- QA companion change/run and independent review link (or pending): pending independent staging review after deploy
