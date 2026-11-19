# CHG-20261119-coa-01-web-lint — Type CoA balances and advance cash codes for web lint (v2.12.1)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-19
- Product version (`VERSION` file) and base SHA / branch/PR: 2.12.1 on `fix/v2121-coa-01-web-lint` from origin/master `57fcb609513a3d3d0cfc067035e78925a3c69291` / v2.12.0 (PR https://github.com/Dinu-Sri/BookOne/pull/31 MERGED). UI-NAV-01 list clipping stays; tiles stay removed. Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`.
- QA repository revision and companion PR/change ID: independent staging QA pending. Handoff CODING-COA01-FULL-CHART-OF-ACCOUNTS.md. No bookone-qa companion opened in this change. This is a compile follow-up for COA-01; behaviour is unchanged.
- Intended before/after behaviour with a concrete example: Production Check on v2.12.0 failed `tsc` at `/accounts/[id]` (`AccountWithBalance` missing classification fields) and `advances.ts` (cash/expense params inferred as `"1000"` / `"6800"`). After this change the account detail type matches `listAccountsWithBalances` mapping, and advance line builders accept any cash or expense code. Account create still starts at zero; openings stay a separate posting.
- Existing behaviour that must remain correct: seeded account ids/codes/journals, personal Cashbook, DB-01 metric IDs, DB-02 compact dashboard, CATALOG_VERSION 2, AgentBridge AB-11 protocol negotiation, AB-10 exact callback, AB-09 redemption/consent, UI-NAV-01 list clipping, tiles removed, posting engine, company flags, deposits 2400 distinct from customer advances 2410, COA-01 classification/lifecycle/advances/openings
- Actual changed paths/symbols/routes: `apps/web/src/app/actions/workspace.ts` `AccountWithBalance`; `packages/accounting/src/advances.ts` cash/expense `string` params. No route or schema change.
- Business rule/profile/scenario IDs: COA-01 compile follow-up. Pilot-01 bank P1s retained.
- Accounting, stock/rental, tenant/access and customer-data effects: none. Types only. No new journals.
- Migrations, schema/history compatibility and recovery implications: none. Additive 049 from v2.12.0 stays. Restore LAST.
- Dependencies, settings/flags, deployment and external-service changes: none. Owner Portainer Re-pull ON after Docker web image green. Do not change AgentBridge flags or signing material. Do not recreate the saved Codex entry.
- Independent diff/impact review and uncertainties: v2.12.0 image was not published from the failed Production Check. Pin QA to this SHA after Docker web image is green. Playwright COA-01 remains labelled fixture HTML.
- Checks executed: `@bookone/accounting` advances 4 passed, coa-01-pilot 3 passed. Local `pnpm --filter @bookone/web exec tsc --noEmit --pretty false` no longer reports `src/app/accounts/[id]/page.tsx` or `src/app/actions/advances.ts` (remaining hits are local `.next/types` PageProps noise absent from a clean CI checkout). Prior COA-01 accounting/auth/CoreGuard/Playwright on `57fcb60` stay valid for behaviour.
- Failed/skipped/flaky/blocked/not-run checks: live Codex/Claude, OCR, production IdP, GitHub branch protection stay BLOCKED. Isolated restore LAST and live Owner UI remain independent QA. This is not live-tenant CoA/dashboard/Codex acceptance.
- New QA assertions or outstanding work; changed expectations and owner decision: owner Portainer Re-pull ON after GHCR latest is this SHA. Independent QA reviews `/accounts`, `/advances`, custom-bank cash, and the three non-VAT advance examples. Taxable advances stay refused. Do not replay CONT11/POS 118/consumed OAuth codes.
- Created staging records/cleanup, if any: none
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys. Independent QA on staging

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them: no UI change. Account detail still reads classification fields that `listAccountsWithBalances` already maps.
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: Dr 1101=300 is cash and bank 300. Cr 1100/Dr 1101 is an internal transfer. Account create does not write equity.
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/accounts/[id]` type-checks the same fields the page already renders. Advance issue/apply still posts the same journals.
- Preserved field/line/source identity, money/stock/history/print and server permissions: journals keep original lines; Viewer cannot write
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: no visual change. Live screenshots pending independent QA
- Exact and adjacent regressions; actual engineering checks and missing layers: AgentBridge CoreGuard suites retained. Dashboard DB-01 financial assertions retained. Signing PEM_FILE preserved.
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live CoA acceptance from source-only checks
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert this VERSION 2.12.1 commit. 049 stays additive from v2.12.0
- QA companion change/run and independent review link (or pending): pending independent staging review after deploy
