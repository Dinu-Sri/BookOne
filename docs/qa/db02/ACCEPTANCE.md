# DB-02 compact dashboard acceptance

Product **2.11.5**. Base `9ed27aa` (v2.11.4). Presentation-only. Metric IDs DB01-NS/OR/NCM/CB/CC/AR/AP unchanged. CoreGuard `dashboard-db01` stays required and now includes viewport-fit assertions.

| Area | Result | Evidence |
|------|--------|----------|
| Six KPI totals | PASS (fixture) | `#net-sales` `#operating-result` `#net-cash` `#cash-bank` `#receivables` `#payables` match `independentExpected()` |
| Card clearing | PASS (fixture) | `#card-clearing` remains in Cash and bank Details |
| Period vs as-of | PASS | `#dash-period` Selected period, `#dash-position` As of range end |
| Cash transfer day | PASS | `data-cash-in/out="2026-03-08"` height 0 |
| View data dialog | PASS | `#sales-table` hidden until `#sales-view-data`; Close hides it; `#funding` in cash dialog |
| Desktop fit 1280×720 / 1366×768 / 1440×900 / 1920×1080 | PASS (fixture HTML + CSS) | `scrollHeight <= clientHeight` and `scrollWidth <= clientWidth`; summary bottom inside viewport; overflow-y not hidden |
| Empty period | PASS | “No activity in selected period.” and “All clear — no flagged items.” still fit 1366×768 |
| 375px and 200% zoom | PASS | Reflow; company label bounding box width/height > 0; overflow-y not hidden |
| Aggregates / postings / flags | unchanged | `apps/web/src/app/actions/dashboard.ts` and `packages/accounting/src/dashboard-metrics.ts` not modified |

Screenshots: `docs/qa/db02/before-*.png` (v2.11.4 density) and `after-*.png` (this candidate). Fixture includes a realistic topbar and sidebar. This matrix is not live-tenant dashboard acceptance.
