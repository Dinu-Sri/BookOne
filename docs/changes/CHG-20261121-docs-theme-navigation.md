# CHG-20261121-docs-theme-navigation — Documentation navigation freeze repair (v2.17.1)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-21
- Product version (`VERSION` file) and base SHA / branch/PR: 2.17.1 on `fix/v2171-docs-theme-navigation` from origin/master `6067a892ca5fd71cb7ac2e4ca38ace4719b75862` / v2.17.0. Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`
- QA repository revision and companion PR/change ID: independent staging QA pending
- Intended before/after behaviour with a concrete example: Live `/docs` opened, and clicking **Developers & Integrations** updated the URL and title while the destination stopped answering browser commands. After this change the same click renders Custom Website API and Back still restores the developers index. The docs theme observer only writes class/`data-theme` when the value actually changes
- Existing behaviour that must remain correct: public `/docs` without a session, BookOne font variables on the docs root, restoration of the sign-in layout on Back, CoreGuard commerce locators, CATALOG_VERSION 2, AB-11
- Actual changed paths/symbols/routes: `DocsThemeBoundary` sync in `apps/web/src/components/layout/docs-theme-boundary.tsx`; Playwright `apps/web/e2e/ui-nav-01-docs.spec.ts`; UI-NAV-01 source lock
- Business rule/profile/scenario IDs: BOOKONE-DOCS-NAVIGATION-V2171
- Accounting, stock/rental, tenant/access and customer-data effects: none. Theme observer only. No posting, mapping, or grant changes
- Migrations, schema/history compatibility and recovery implications: none. No database migration. Rollback is revert of this VERSION 2.17.1 commit
- Dependencies, settings/flags, deployment and external-service changes: Owner Portainer Re-pull ON after Docker web image green. Do not enable AgentBridge posting
- Independent diff/impact review and uncertainties: a bounded Chromium reproduction hit 100 mutation callbacks without the guard and settled after one callback with the guard. Live Codex/Claude and Woo checkout remain not-run
- Checks executed: recorded in TASK_LOG
- Failed/skipped/flaky/blocked/not-run checks: the new Playwright child-link case skips unless `UI_NAV_BASE_URL` is set. Encrypted restore LAST. Woo live checkout, C4, live CoA stay not-run
- New QA assertions or outstanding work; changed expectations and owner decision: public docs child links must remain responsive after URL/title update. Back still restores BookOne layout tokens
- Created staging records/cleanup, if any: none
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references: Fumadocs `#nd-page`, `#bookone-docs`, existing `DocsThemeBoundary`. No new controls
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: not bound in this change
- Before/after behaviour; independent expected/unchanged example: Developers & Integrations still opens `/docs/developers`. Sign-in font and background still restore on Back
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: public `/docs` and `/docs/developers*`
- Preserved field/line/source identity, money/stock/history/print and server permissions: unchanged
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: Playwright child-link plus Back/Forward login restoration. Source lock on guarded class writes
- Exact and adjacent regressions; actual engineering checks and missing layers: UI-NAV-01 docs history isolation remains
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: this change does not claim live-store commerce acceptance
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert this VERSION 2.17.1 commit
- QA companion change/run and independent review link (or pending): pending independent staging review after deploy
