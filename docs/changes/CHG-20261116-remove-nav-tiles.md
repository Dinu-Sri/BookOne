# CHG-20261116-remove-nav-tiles — remove sidebar Tiles; keep list clipping fix (v2.6.1)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-11-16.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.6.1 on `feat/v261-remove-nav-tiles` from origin/master `9062bbc8c7c027a7c06a6ad9c04ff03c74f0015a` / tree `87e7b283a65cd3090c5ccb110ad97121ee18ce42` (v2.6.0). Owner asked to remove the tile system because it is not beautiful, and to keep the list cropping fix.
- QA repository revision and companion PR/change ID: follow-up to UI-NAV-01 / [CHG-20261116-ui-nav-01](CHG-20261116-ui-nav-01.md). CoreGuard CG-01C remains PLANNED. Do not replay CONT11, POS 118, or earlier funding/payment/sale/refund/shift queues.
- Intended before/after behaviour with a concrete example:
  - Sidebar has no List/Tiles toggle, no suite tile grid, and no `bookone.nav.mode` preference.
  - Accounting with View-only children still shows Documentation fully inside the open panel. Expanded panels keep natural height (`grid-template-rows` 0fr/1fr); the sidebar nav region still scrolls; collapsed submenu descendants stay `inert`.
  - Documentation remains a real `/docs` link with `target=_blank` `rel=noopener noreferrer`. Same-tab history isolation is unchanged.
- Existing behaviour that must remain correct: permission filtering (`keepNavItem`, modules, entity-kind, POS/rental, Control Room); accordion open-suite; active-route indication; collapsed icon sidebar; docs deep links, search, light/dark; no accounting/settings/grant writes from navigation.
- Actual changed paths/symbols/routes: `bookone-shell` (list-only), `sidebar-nav` (drop `NavModeToggle` / `TileSuiteNav`), delete `nav-preference.ts`, `globals.css` tile/toggle rules, `ui-nav-01` tests.
- Business rule/profile/scenario IDs: UI-NAV-01 list clipping and docs new-tab remain. Tile navigation withdrawn. UXW-002 truthful totals/outcome. Applicable UX companion at QA commit `024f8c35223a28c0662d469b71cd96579d4ee24d`.
- Accounting, stock/rental, tenant/access and customer-data effects: none. Hiding a nav item does not replace server authorization.
- Migrations, schema/history compatibility and recovery implications: **none**. Unused `bookone.nav.mode` localStorage key is harmless leftover in browsers that already stored it.
- Dependencies, settings/flags, deployment and external-service changes: none. Quote `v2.6.1 · <sha7>` after Docker web image is green and Portainer Update with Re-pull ON.
- Independent diff/impact review and uncertainties: leftover `bookone.nav.mode` is unread after this change.
- Checks executed:
  - `packages/auth` vitest `test/ui-nav-01.test.ts` — **8 passed** (clipping vs CSS/source, no TileSuiteNav / `.nav-tile-grid` / `data-nav-mode`, docs new-tab + isolation, filterVisibleSuites Owner/Viewer/modules/Control Room/personal).
  - `pnpm --dir apps/web test:nav-browser` — **6 passed**, 1 skipped without `UI_NAV_BASE_URL`: last Accounting child fully inside panel; legacy 40px estimate clips View-only rows; closed panel `inert`; 1366×600 nav scroll; zoom 125/150/200; tablet 768/390 last child reachable.
- Failed/skipped/flaky/blocked/not-run checks and reasons: docs history spec skipped unless `UI_NAV_BASE_URL` (unchanged isolation). Full accounting/auth suites, Production Check, live staging browser, Docker web image — not-run until master push. Mixed-TENDER split not claimed. No CONT11 / POS 118 replay.
- New QA assertions or outstanding work: independent Medium review of this candidate. Tile browser tests are removed.
- Created staging records/cleanup, if any: none.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS.
- Next exact action and responsible role: Fast-forward master and `git push origin master` so Docker web image runs. Owner then Portainer Update with Re-pull ON. Recovery LAST. BookOne is not customer-ready.

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references: `docs/UI_UX_CHANGE_GUIDE.md`, `apps/web/src/app/globals.css` `.suite-trigger` / `.nav-item` / `.suite-panel`. Removal restores the v2.6.0 list accordion as the only sidebar layout.
- Exact external QA commit and ux/workbook.json: companion pointer `024f8c35223a28c0662d469b71cd96579d4ee24d`. UXW-002 truthful navigation destinations.
- Before/after: no List/Tiles control; last Accounting child still fully visible; docs new-tab and history isolation unchanged.
- Direct screens: every `BookOneShell` route. Transitive: collapsed icon sidebar, 760px stacked sidebar.
- Preserved field/line/source identity, money/stock/history/print and server permissions: navigation only. `keepNavItem` / `assertPermission` unchanged.
- Desktop/narrow/keyboard/reader evidence: 1440×900, 1366×600, 768×1024, 390×844; `inert` on closed list submenus.
- Exact and adjacent regressions: register write, payment batch, purchase VAT preview, POS 118 — untouched.
- Conflict/exception: none. Owner requested removal of tiles.
- Small rollout: revert this commit; no schema. Harmless leftover storage key.
- QA companion: pending product PR link.
