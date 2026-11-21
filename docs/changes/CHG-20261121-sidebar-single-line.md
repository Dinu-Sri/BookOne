# CHG-20261121-sidebar-single-line — single-line sidebar nav rows (v2.17.2)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-21
- Product version (`VERSION` file) and base SHA / branch/PR: 2.17.2 on `fix/v2172-sidebar-single-line` from origin/master `b2e6ca210c40fb0689b6c1c6ae2db7fdf74081c4` / v2.17.1. Keep existing company flags as last observed (Inbox on / draft-only off / posting-stop on). Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed authorization codes, including requests `4b22d15c` and `7bf93de1`
- QA repository revision and companion PR/change ID: independent staging QA pending
- Intended before/after behaviour with a concrete example: Viewer Accounting previously stacked “View only” under every child and “Opens in a new tab” under Documentation, so those rows were taller than Owner rows. After this change every module shows icon and name on one aligned line. Documentation still opens `/docs` in a new tab with the external-link icon and `aria-label="Documentation (opens in a new tab)"`. Inbox, CoA, and Team still explain View only on the screens themselves
- Existing behaviour that must remain correct: `filterVisibleSuites` / `keepNavItem` / `accessByLabel` menu visibility, routes, active states, accordion open-suite, collapsed `title` labels, `inert` on closed panels, docs `target="_blank"` `rel="noopener noreferrer"`, CoreGuard commerce locators, CATALOG_VERSION 2, AB-11
- Actual changed paths/symbols/routes: `NavItemBody` / `ListSuiteNav` in `apps/web/src/components/layout/sidebar-nav.tsx`; `NavItem` in `apps/web/src/lib/nav-suites.ts` (drop `subtitle`); `BookOneShell` no longer passes `accessByLabel` into list rendering; `globals.css` single-line `.nav-item-text` / `.nav-item-label` ellipsis; UI-NAV-01 fixture and source locks
- Business rule/profile/scenario IDs: UI-NAV-01 follow-up. UXW-002 truthful navigation destinations. Applicable UX companion at QA commit `024f8c35223a28c0662d469b71cd96579d4ee24d`
- Accounting, stock/rental, tenant/access and customer-data effects: none. Navigation chrome only. Hiding a nav subtitle does not replace server authorization
- Migrations, schema/history compatibility and recovery implications: none. No database migration. Rollback is revert of this VERSION 2.17.2 commit
- Dependencies, settings/flags, deployment and external-service changes: Owner Portainer Re-pull ON after Docker web image green. Do not enable AgentBridge posting
- Independent diff/impact review and uncertainties: live Owner/Viewer login against staging was not available in this worktree; Owner vs Viewer nav chrome was verified with the production CSS fixture plus `filterVisibleSuites` source tests. Live Codex/Claude and Woo checkout remain not-run
- Checks executed: `@bookone/auth` `test/ui-nav-01.test.ts` 11 passed; `pnpm --dir apps/web test:nav-browser e2e/ui-nav-01.spec.ts` 11 passed (single-line height, Owner/Viewer fixture, collapsed titles, truncation, Documentation popup leaves this tab, 1440/1366/768/390)
- Failed/skipped/flaky/blocked/not-run checks: Playwright docs history spec skips unless `UI_NAV_BASE_URL` is set. Encrypted restore LAST. Woo live checkout, C4, live CoA stay not-run. Staging Owner/Viewer login LIVE-UNVERIFIED
- New QA assertions or outstanding work; changed expectations and owner decision: sidebar children must not show “View only”, “Opens in a new tab”, “Dispatch Note”, or “Terminal”. Documentation new-tab announcement stays on `aria-label` / `title`. Screen-level View only copy stays
- Created staging records/cleanup, if any: none
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: reviewable PR, then fast-forward origin/master. Owner deploys

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references: `docs/UI_UX_CHANGE_GUIDE.md`, `apps/web/src/app/globals.css` `.nav-item` / `.nav-child` / `.suite-trigger` / `--radius-md` / `--brand-soft`. Reused the existing flex row; dropped `.nav-item-sub` and `.nav-child-multi`. No new controls
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions: companion pointer `024f8c35223a28c0662d469b71cd96579d4ee24d`. UXW-002 truthful destinations
- Before/after behaviour; independent expected/unchanged example: Accounting children share one row height; Documentation still opens a new tab; Viewer still cannot write on Inbox/CoA when the job is read-only
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings: every `BookOneShell` route, Owner and Viewer, expanded and collapsed sidebar, 1440 / 1366 / 768 / 390
- Preserved field/line/source identity, money/stock/history/print and server permissions: navigation chrome only. `keepNavItem` / `assertPermission` unchanged
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots: CSS fixture Chromium at laptop and narrow widths; Tab focus on children; closed panel `inert`; Documentation `aria-label`; Accounting before/after screenshots in the product PR
- Exact and adjacent regressions; actual engineering checks and missing layers: UI-NAV-01 clipping/natural height, docs theme isolation, permission filtering. Live staging login not-run
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact: ACCESS_CONTROL_DESIGN still describes a historical View-only nav badge; this change removes that badge from the sidebar while keeping on-screen copy. This change does not claim live-store commerce acceptance
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed: revert this VERSION 2.17.2 commit
- QA companion change/run and independent review link (or pending): pending independent staging review after deploy
