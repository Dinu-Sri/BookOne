# CHG-20261119-coa-01-prerender — Redirect CoA pages without a session during build (v2.12.2)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-19
- Product version (`VERSION` file) and base SHA / branch/PR: 2.12.2 on `fix/v2122-coa-01-prerender` from origin/master `3efd103ee2f902e2807de8626a356e623c259f1e` / v2.12.1 (PR https://github.com/Dinu-Sri/BookOne/pull/32 MERGED). UI-NAV-01 list clipping stays; tiles stay removed. Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`.
- QA repository revision and companion PR/change ID: independent staging QA pending. Handoff CODING-COA01-FULL-CHART-OF-ACCOUNTS.md. No bookone-qa companion opened in this change. This is a compile follow-up for COA-01; posting behaviour is unchanged.
- Intended before/after behaviour with a concrete example: Production Check and Docker web image on v2.12.1 passed lint/typecheck then failed `next build` prerendering `/accounts/import` with `No authenticated session with tenant context`. After this change CoA and Advances pages load tenant first and redirect to login, matching `/dashboard` and `/company/backup`. Viewer hitting a write CoA URL is sent to `/accounts`.
- Existing behaviour that must remain correct: seeded account ids/codes/journals, personal Cashbook, DB-01 metric IDs, DB-02 compact dashboard, CATALOG_VERSION 2, AgentBridge AB-11 protocol negotiation, AB-10 exact callback, AB-09 redemption/consent, UI-NAV-01 list clipping, tiles removed, posting engine, company flags, deposits 2400 distinct from customer advances 2410, COA-01 classification/lifecycle/advances/openings, v2.12.1 account-detail and advance cash-code types
- Actual changed paths/symbols/routes: `apps/web/src/app/accounts/page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `opening/page.tsx`, `import/page.tsx`, `apps/web/src/app/advances/page.tsx`. Session load then `assertScreenAccess` read. Write pages still gate with `jobCanWrite`.
- Business rule/profile/scenario IDs: COA-01 compile follow-up. Pilot-01 bank P1s retained.
- Accounting, stock/rental, tenant/access and customer-data effects: none. Page session handling only. No new journals.
- Migrations, schema/history compatibility and recovery implications: none. Additive 049 from v2.12.0 stays. Restore LAST.
- Dependencies, settings/flags, deployment and external-service changes: none. Owner Portainer Re-pull ON after Docker web image green. Do not change AgentBridge flags or signing material. Do not recreate the saved Codex entry.
- Independent diff/impact review and uncertainties: v2.12.1 image was not published (`Build & push` skipped). Pin QA to this SHA after Docker web image is green. Playwright COA-01 remains labelled fixture HTML.
- Checks executed: prior v2.12.1 lint/typecheck, Tests, Security Scan, and Docker CoreGuard COA-01/DB-01/Playwright succeeded on `3efd103`. Local `pnpm --filter @bookone/web build` generated 146/146 pages; `/accounts`, `/accounts/import`, `/accounts/opening`, and `/advances` are dynamic. Local web `tsc` leftover `.next/types` PageProps noise is unchanged.
- Failed/skipped/flaky/blocked/not-run checks: live Codex/Claude, OCR, production IdP, GitHub branch protection stay BLOCKED. Isolated restore LAST and live Owner UI remain independent QA. This is not live-tenant CoA/dashboard/Codex acceptance.
- New QA assertions or outstanding work; changed expectations and owner decision: owner Portainer Re-pull ON after GHCR latest is this SHA. Independent QA reviews `/accounts`, `/advances`, custom-bank cash, and the three non-VAT advance examples. Taxable advances stay refused. Do not replay CONT11/POS 118/consumed OAuth codes.
- Created staging records/cleanup, if any: none
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys. Independent QA on staging

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references; reason for reusing/extending them: no visual change. Session-then-assert matches `/dashboard` and `/company/backup`.
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: unauthenticated `/accounts/import` redirects to login. Viewer cannot import. Owner still opens the import form after sign-in.
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: `/accounts*`, `/advances`
- Preserved field/line/source identity, money/stock/history/print and server permissions: journals keep original lines; Viewer cannot write
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: no visual change. Live screenshots pending independent QA
- Exact and adjacent regressions; actual engineering checks and missing layers: AgentBridge CoreGuard suites retained. Dashboard DB-01 financial assertions retained. Signing PEM_FILE preserved.
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live CoA acceptance from source-only checks
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert this VERSION 2.12.2 commit. 049 stays additive from v2.12.0
- QA companion change/run and independent review link (or pending): pending independent staging review after deploy
