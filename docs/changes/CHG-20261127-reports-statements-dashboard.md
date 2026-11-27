# CHG-20261127-reports-statements-dashboard (v2.28.0)

Status: ready for the owner's staging review.

- Author and date: coding agent, 2026-11-27.
- Pushed directly to `master` (owner-approved).
- Source: the owner's request for:
  - calm-screen Reports with professional accounting statement export and print to the Sri Lankan standard;
  - easy-to-read reports with minimal scrolling;
  - the same approach on the Dashboard, with the figures a CEO needs and charts.
- Rule book: `docs/UI_DESIGN_RULEBOOK.md`.

## Study (staging)

- **Reports:**
  - six tabs and four equal number tiles above a plain list of accounts;
  - the Balance Sheet listed every account including zero balances, with no current / non-current split;
  - the Cash Flow was only money in and money out;
  - no comparatives;
  - no print or export apart from the VAT CSV.
- **Dashboard:**
  - uppercase group labels;
  - thin aging lines;
  - empty space under the summary row;
  - the server already calculated the ranked expenses, but the screen never showed them.

## Changes

**Statements engine:** `packages/accounting/src/professional-statements.ts`, pure and with 6 tests. It produces, in the presentation of SLFRS for SMEs (Sections 3–7) / LKAS 1:
- **Statement of Profit or Loss and Other Comprehensive Income**, expenses by function:
  - revenue (net of returns), cost of sales, gross profit;
  - other income, distribution costs, administrative expenses, operating profit;
  - finance costs, profit before tax, income tax;
  - profit for the period and total comprehensive income.
- **Statement of Financial Position:**
  - non-current assets (PPE, intangibles, other);
  - current assets (inventories, trade and other receivables, cash and cash equivalents, other);
  - equity (stated capital, drawings, retained earnings including unclosed profit);
  - non-current and current liabilities (borrowings, trade and other payables, tax payable).
- **Statement of Cash Flows** by the direct method:
  - operating (receipts from customers, payments to suppliers and employees, taxes), investing and financing;
  - each cash-touching journal is allocated to its counter-accounts;
  - transfers between cash accounts are ignored;
  - opening + net change = closing.
- **Statement of Changes in Equity.**
- **Comparatives:** the previous month, the previous financial year, or the same length just before.
- **How accounts are classified:** by type, subtype, control role, liquidity and cash-flow class, then by well-known names, so any chart presents correctly.
- **Self-checks:**
  - profit agrees with the ledger;
  - assets equal equity plus liabilities;
  - closing cash agrees;
  - equity movements add up.

**Server:** `app/actions/financial-statements.ts` (`getFinancialStatements`, Reports read permission). It loads account totals for the period, the reporting date, the day before the period and the comparative windows, plus the journal lines for cash flows.

**Reports screen** (`/reports`, rewritten as a calm screen that fills the window):
- left list:
  - Financial statements: Profit or loss, Financial position, Cash flows, Changes in equity;
  - Accounting detail: Trial balance, General ledger, VAT summary;
  - a small figures card;
- the statement in accountant style:
  - this period and comparative columns;
  - negatives in brackets, subtotals ruled, totals double-ruled;
  - each line opens to show the accounts behind it;
  - a check badge (green when it balances);
- a picture beside it, with plain words:
  - Profit or loss: "From sales to profit" waterfall, with gross and net margin and last time's profit;
  - Financial position: "What you own and how it is funded" stacked columns, with current ratio and working capital;
  - Cash flows: a waterfall;
  - Changes in equity: a waterfall;
- the old `report=` keys still work (pnl, balance, cashflow, ledger, trial, vat), and `equity` is added;
- the trial balance hides zero rows and totals debits and credits.

**Print / PDF** (`/reports/print?period=&report=all|pnl|balance|cashflow|equity`):
- A4, one statement per page;
- company name, address, registration and TIN;
- "for the period … to …" or "as at …";
- comparative column and page numbers;
- notes: basis of preparation (SLFRS for SMEs, accrual, historical cost, LKR, expenses by function) and the composition of each line;
- approval line with Director / Director / Accountant signatures.

The statements are presented in the SLFRS for SMEs format. The notes say they should be reviewed by a qualified accountant before approval or filing. Nothing claims CA Sri Lanka approval.

**Excel export** (`/api/reports/export?period=`, signed in, Reports read):
- one sheet per statement, plus a Notes sheet listing the accounts behind each line;
- accounting number format `#,##0.00;(#,##0.00)`;
- `xlsx` added to the web app (the same SheetJS build the bank import already uses).

**Dashboard:**
- sentence-case section titles;
- tone accent on each number card (red for a loss);
- a third chart, **Where the money went** (top 6 costs as ranked bars, the largest in red, with a link to Profit or loss);
- aging bars coloured from current (green) to 61+ days (red);
- charts slightly shorter so it still fits with no page scroll.

All pinned IDs and texts are kept:
- `#net-sales`, `#operating-result`, `#net-cash`, `#cash-bank`, `#card-clearing`, `#receivables`, `#payables`;
- "Selected period", "As of range end";
- `.dash-chart-summary`, `#sales-table`, `#cash-table`, `#funding`, `#refresh`, "View data", `.dash-empty`, `.dash-all-clear`.

The DB-01 markup copy is updated to match.

## Evidence

- Typecheck passes.
- Unit tests:
  - accounting: 308, including 6 new statement tests;
  - auth: 246 (+5 skipped).
- Dashboard DB-01 e2e: 7 of 7, including no page scroll at 1280×720, 1366×768, 1440×900 and 1920×1080, plus the phone and zoom checks. The screenshots in `docs/qa/db02` are updated.
- Not yet checked:
  - Reports on staging with real data (ZZ-TEST Bank Recon);
  - the printed PDF;
  - the Excel download.

## Rollback

Revert the commit. There is no data change.
