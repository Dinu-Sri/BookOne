# Bank reconciliation demo month (October 2026)

A synthetic month for testing or training. The step-by-step version for users is `/docs/accounting/bank-reconciliation`.

- `commercial-bank-oct-2026.csv`: the bank statement for 1100 Commercial Bank, 1–31 Oct 2026. It has 12 movement lines plus an opening row, and its running balances are checked. The same file is published at `/samples/sample-bank-statement-october-2026.csv`.

## Set up a test company

1. Opening balance on 1 Oct: 1100 Debit 250,000.00; 3000 Owner Equity Credit 250,000.00.
2. Ten Simple Entry records, listed in the guide's table. Afterwards BookOne's bank balance is 176,410.00.

## Expected result

| Check | Value |
|---|---|
| File totals | in 106,162.50 · out 191,740.00 · closing 164,422.50 |
| Suggested matches | 8 (one with the bank one day later) |
| Bank only, to add | interest +412.50 (Other Income), service charges −350.00 and SMS −50.00 (Bank Charges), AIA standing order −4,500.00 (Insurance) |
| BookOne only, waiting to clear | cheque 001002 −12,500.00, deposit 30 Oct +20,000.00 |
| BookOne after the additions | 171,922.50 |
| BookOne − waiting (7,500.00) | 164,422.50 = bank closing |
| Left to explain | 0.00, so Review & finish |

Staging company used for the first run: "ZZ-TEST Bank Recon" (2026-11-27). See `docs/changes/CHG-20261127-bank-recon-month-walkthrough.md`.
