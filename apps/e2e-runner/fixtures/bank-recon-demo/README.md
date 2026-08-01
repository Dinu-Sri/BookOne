# Bank reconciliation demo fixtures

End-to-end demo data for BookOne bank recon (July 2026).

## Files

| File | Purpose |
|------|---------|
| `book-entries.json` | 6 cashbook entries to post **before** import |
| `bank-statement.csv` | Bank statement (CSV / Excel-friendly) |
| `bank-statement.tsv` | Same data as tab-separated |
| `bank-statement.xlsx` | Generated Excel (run generate script) |
| `expected-outcomes.json` | What recon should produce |

## Scenario

| # | Book | Bank | Outcome |
|---|------|------|---------|
| 1 | Client A +25,000 | same | **Match** |
| 2 | Rent −15,000 | same | **Match** |
| 3 | Supplier −8,500 | same | **Match** |
| 4 | Sales +42,000 | same | **Match** |
| 5 | Owner +10,000 | same | **Match** |
| 6 | Cheque −5,000 | *missing* | **Waiting to clear** |
| 7 | — | ATM fee −150 | **Add to BookOne** |

## Run full journey E2E (recommended)

Creates a **new account via normal Sign Up UI**, posts books, imports bank files, reconciles.

From `apps/e2e-runner` — **no env vars needed**:

```bash
node scripts/e2e-bank-recon-journey.mjs
```

Or:

```bash
npm run demo:bank-recon-journey
```

Screenshots + `PROCESS_AUDIT.md` land in `ui-audit/bank-recon-journey-<timestamp>/`.

Optional: `E2E_BASE_URL` (default `https://bookone.clossyan.com`), or `E2E_EMAIL` to reuse an existing login instead of Sign Up.

## Legacy demo (login-only)

```bash
# optional: regenerate xlsx
node fixtures/bank-recon-demo/generate-xlsx.mjs

set E2E_EMAIL=info@clossyan.com
set E2E_PASSWORD=...
node scripts/e2e-bank-recon-demo.mjs
```
