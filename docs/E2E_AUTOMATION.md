# BookOne Playwright automation

Full **UI** automation: a real browser logs in, clicks, fills forms, creates/deletes data, and asserts results.

Scenario design catalog: [`E2E_SCENARIO_CATALOG.md`](./E2E_SCENARIO_CATALOG.md) (~700 cases).  
This package implements a **broad automated subset** of that catalog (smoke + journeys + domain packs). Remaining catalog IDs are ready to map one-by-one.

## How it works

```
You open https://your-app/e2e
  → enter email/password + Start
  → server runs: playwright test (all tests/*.spec.ts)
  → Chromium drives the live UI
  → report downloadable when finished
```

Or from a shell:

```bash
export E2E_BASE_URL=https://bookone.clossyan.com
export E2E_EMAIL=you@example.com
export E2E_PASSWORD=your-password
cd apps/e2e-runner
pnpm test:e2e          # full suite
pnpm test:smoke        # fast smoke only
```

## Test files (execution order)

| File | Coverage |
|------|----------|
| `00-smoke` | Login, core accounting routes, public docs |
| `01-auth` | Login/logout, wrong password, deep link |
| `02-public` | Docs, search API, `/e2e` console |
| `03-shell-routes` | **All tenant routes smoke**, sidebar, no PageHeading |
| `04-company-masters` | Brands, locations, tax/sales/purchase settings, POS register |
| `05-parties-products` | Customers, vendors, physical/digital/service products, search |
| `06-sales-journey` | Quotation, sales order, invoice, discounts, lists |
| `07-purchase-inventory` | PO, cash purchase, bill, aging, stock pages |
| `08-accounting` | Simple Entry money out, journal, reports, recon |
| `09-pos` | Terminal load, open shift, history, cart attempt |
| `10-edges-security` | Foreign UUID, SQLi search, session clear |
| `11-integrity` | Journal/TB/AR/AP/stock pages after ops |

Helpers: `src/helpers/*` (auth, forms, nav, masters).  
Fixtures: `src/fixtures.ts`.

## Docker

Image installs Alpine Chromium; video off when using system Chrome.  
**Rebuild** web image after E2E code changes so `/app/apps/e2e-runner/tests` is updated.

## Mapping to catalog

Automated tests include catalog references in titles (`S-…` or section tags like `@sales`).  
To add more of the 698 scenarios: copy a domain file pattern, use `createProduct` / `createCustomer` helpers, assert list + journal.

## Notes

- Runs are **serial** (`workers: 1`) so data from earlier files feeds later integrity checks.
- Some steps soft-skip if a module is disabled or UI variant differs.
- Prefer a **staging** company; tests create unique `E2E-*` records.
