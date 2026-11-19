# Dashboard metric dictionary (DB-01 / DB-02)

Product version: 2.11.5. Reporting engine: `packages/accounting/src/dashboard-metrics.ts` plus existing `composeFinancialStatements` / `netIncomeFromRows` / `signedCashFlow`. The dashboard does not post, reverse, or rewrite journals. DB-02 is a presentation correction: metric IDs, formulas, date/currency rules and permissions are unchanged from DB-01.

Date basis: period flows use the selected inclusive interval. Position balances use the interval end (`asOf`). Historic selection never substitutes today's balances. Company calendar day uses `company_profiles.timezone` (default `Asia/Colombo`). Fiscal year start month defaults to April. Maximum custom range is 1,826 days.

Currency: `company_profiles.baseCurrency`. Amounts stay at accounting precision (two decimals) until presentation. Compact cards may use K/M; the exact amount is in the `title` and supporting reports. No unapproved cross-currency sums.

Permission: every aggregate requires `accounting.dashboard.read` on the server. Aging, inbox, stock, POS, and document lists also require their module + screen read keys. Dimension scope (`currentDimensionScope`) is applied to journal lines. URL tenant identifiers are ignored.

Historical policy: figures are recomputed as-of from current ledger knowledge. There are no immutable dashboard snapshots. Drafts and voided journals are excluded. Later settlements after the cutoff are added back for AR/AP aging (`asOfOpenBalance`).

## Headlines

| ID | Label | Formula | Source | Date | Reconciles to |
| --- | --- | --- | --- | --- | --- |
| DB01-NS | Net sales | Signed balances of 4000 Sales Revenue + 4100 Sales Returns | Period journal lines | Selected interval | Sales revenue on the named P&L. VAT on 2200 is excluded. Discounts that reduced 4000 at posting are already in the ledger. |
| DB01-OR | Operating result | `netIncomeFromRows` = all revenue − all expense (including 5000 COGS) | Period statement rows | Selected interval | `composeFinancialStatements.income.netIncome` on `/reports` |
| DB01-NCM | Net cash movement | Signed cash-universe flow (1000+1100+1200), debit in / credit out, including transfers which net to zero | Period cash lines | Selected interval | Opening cash-universe + movement = closing cash-universe. Difference is shown, never hidden. |
| DB01-CB | Cash and bank | Signed 1000 + 1100 | As of range end | Cutoff | Spendable cash. Does not include 1200, 1300, or other assets. |
| DB01-CC | Card clearing | Signed 1200 | As of range end | Cutoff | Shown separately under position. Unsettled card receipts are not spendable. |
| DB01-AR | Receivables | Signed 1300 | As of range end | Cutoff | AR control. Document aging may differ; the difference is displayed. |
| DB01-AP | Payables | Signed 2100 | As of range end | Cutoff | AP control. Same recon rule as AR. |
| DB01-ECI | External cash received | Cash-universe debits excluding internal transfers | Period | Selected interval | Sum of cash series received bars |
| DB01-ECO | External cash paid | Cash-universe credits excluding internal transfers | Period | Selected interval | Sum of cash series paid bars |

Internal transfer: a journal whose non-zero lines are only among 1000/1100/1200 and that has both a cash debit and a cash credit. Those amounts are excluded from DB01-ECI/ECO and identified in the cash panel. Funding/owner/loan journals involve 3000, 3100, 2500, or 1400.

Comparison: previous equivalent elapsed interval immediately before the selection. Zero, missing, and new (non-zero vs a zero baseline) are distinct labels. Percentages are never NaN or Infinity.

## Charts and lists

- Sales series: daily if ≤ 45 days, weekly if that stays ≤ 30 buckets, otherwise monthly. Bucket sums equal DB01-NS.
- Cash series: same grain, common scale, visible zero. Internal transfers do not inflate a day.
- AR/AP aging: buckets current / 1–30 / 31–60 / 61–90 / 90+ with amounts and document counts. Links keep `asOf`. Default overview shows overdue of the control total plus compact bucket segments; the full aging table stays on the existing aging reports.
- Expenses: ranked period expense accounts with an Other group that reconciles to the expense total. Expense ranking is not on the default overview.
- Attention: overdue invoices/bills at cutoff; outstanding drafts/pending approval (Current); open POS shifts (Current); low stock vs reorder (Current); category reviews in the period (not a health certification); AgentBridge inbox when enabled and permitted (Current, not a health certification). Default overview shows at most three items, or a quiet All clear when the count is 0.
- Chart data tables open from View data into a native dialog. Account codes, formulas, rounding notes and card-clearing recon live in each metric's Details disclosure.
- Empty series: compact “No activity in selected period.” Failed widgets render an error, never a healthy zero.

## Desktop fit contract (DB-02)

The default `/dashboard` overview must fit one normal desktop viewport at 100% zoom without a dashboard-caused page scrollbar. Recorded CSS viewports: 1280×720, 1366×768, 1440×900, 1920×1080. Assert `document.documentElement.scrollHeight <= clientHeight` and `scrollWidth <= clientWidth` (2px rounding). Do not achieve this with `overflow: hidden` on the dashboard, `body { overflow-y: hidden }`, clipped content, or scaled-down type.

Default composition: compact Dashboard title plus period/as-of subtitle (company context stays in the shell topbar), six KPI cells in Selected period / As of range end groups, two chart panels (Sales trend, Cash received and paid) at about 220–270px on 900px+ heights and about 170px on short laptop heights, then a three-column overdue / due / exceptions summary.

200% zoom and 375px width reflow and may scroll. Chart dialogs may scroll. Sidebar scrolling is separate from dashboard content fit. Both expanded and collapsed sidebar modes remain usable.

## Availability matrix

| Widget | Status | Notes |
| --- | --- | --- |
| Six headlines + card clearing | Available | Ledger-backed |
| Sales and cash time series | Available | Bounded buckets |
| AR/AP aging | Available when sales/purchase module + aging read | Control difference shown |
| Expense ranking | Available | Other group |
| Overdue invoices/bills | Available with aging | Cutoff |
| Outstanding drafts | Available with invoice/bill read | Current |
| Open POS shifts | Available when POS module + pos history/terminal read | Current |
| Stock exceptions | Available when inventory module + levels read | Current on-hand only |
| Category reviews | Available with transactions read | Not accounting-health |
| AgentBridge inbox | Available when company flag on + inbox read | Not accounting-health |
| Historical stock valuation / aging | Deferred | No stock snapshots |
| Top products / customers / margin | Deferred | No verified margin series |
| VAT as a filing declaration | Deferred | Use Reports VAT summary |
| Location/brand picker on the URL | Not added | Job dimension scope already filters journals |

## Filters

Presets: Today, Yesterday, Last 7 days, Month to date, Quarter to date, Year to date, Custom, plus retained `last_30d`, `this_month`, `last_month`, `this_fy`, `last_fy`, `all`, and `YYYY-MM`. Dashboard default without `?period=` is `mtd`. Existing tokens stay valid. `compare=1` (default) or `compare=0`.

Failed widgets render an error, never a healthy zero. Refresh reloads the same URL. Data timestamp is the server load time; there is no Live freshness contract.
