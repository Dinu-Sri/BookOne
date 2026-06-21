# BookOne Production Smoke Test

Run this after every Portainer redeploy on `https://bookone.clossyan.com`.

## 1. Login

- Open `/login`.
- Sign in with the production admin account.
- Confirm the app loads the Simple Entry screen with CSS and sidebar icons.

## 2. Simple Entry

- Confirm the top-right header shows today's date.
- Click the date control and confirm the mini calendar opens.
- Record one small Money Out entry for the current date.
- Confirm the success message shows a journal id.
- For test resets only, click Reset data in the header, type `RESET`, and confirm Simple Entry, Journal, Reports, Reconciliation, Parties, and Invoices/Bills return to empty working states.

## 3. Period Filtering

- Open Dashboard, Transactions, Journal, and Reports.
- Use the header period picker.
- Confirm changing the period updates the URL to `?period=YYYY-MM` or `?period=all`.
- Confirm the data changes or empty states match the selected period.

## 4. Accounting Cross-Check

- Open Journal and confirm the audit cards show a balanced ledger.
- Expand several journal rows and confirm every row has equal debit and credit totals.
- Open Reports and confirm Profit & Loss, Balance Sheet, Cash Flow, General Ledger, and Trial Balance render as separate report tabs.
- Open Accounts and confirm the relevant cash/expense balances changed.

## 5. Parties, Invoices, Bills, and Allocation

- Open Parties and create one customer or vendor.
- Open Invoices/Bills and create one small customer invoice.
- Confirm it appears as Open with a balance due.
- Allocate a partial or full payment against the invoice.
- Open Journal and confirm the invoice journal and payment journal are both balanced.
- Open Reports and confirm receivables/cash/revenue changed.

## 6. Bank Reconciliation

- Open Reconciliation.
- Upload a small CSV with `date`, `description`, and `amount` columns.
- Confirm matched rows show as Matched.
- Mark at least one row Reconciled and one row Unmatched.
- Refresh the page and confirm the uploaded statement and statuses are still visible.
- If no lines remain in Review, click Lock period and confirm the period status changes to Locked.

## 7. Transaction Review

- Open Transactions for the same period.
- Use the search, party, account, low confidence, missing receipt, and unreconciled filters.
- If a receipt exists, click View and confirm a private presigned URL opens the file.
- For a locked-period mistake, click Reverse and confirm a reversal entry appears in Journal.

## 8. Production Health

- Confirm no page redirects unexpectedly to Simple Entry except direct `/login` access while already signed in.
- In Portainer, inspect `bookone-web` logs for startup, migration, RLS, seed, and runtime errors.
