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

## 3. Period Filtering

- Open Dashboard, Transactions, Journal, and Reports.
- Use the header period picker.
- Confirm changing the period updates the URL to `?period=YYYY-MM` or `?period=all`.
- Confirm the data changes or empty states match the selected period.

## 4. Accounting Cross-Check

- Open Journal and confirm the new entry has balanced debit and credit totals.
- Open Reports and confirm the Profit & Loss reflects the entry.
- Open Accounts and confirm the relevant cash/expense balances changed.

## 5. Bank Reconciliation Preview

- Open Reconciliation.
- Upload a small CSV with `date`, `description`, and `amount` columns.
- Confirm matched rows show as Matched.
- Mark at least one row Reconciled and one row Unmatched.

## 6. Production Health

- Confirm no page redirects unexpectedly to Simple Entry except direct `/login` access while already signed in.
- In Portainer, inspect `bookone-web` logs for startup, migration, RLS, seed, and runtime errors.
