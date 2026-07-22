# BookOne Playwright automation

Full **UI** automation: a real browser logs in, clicks, fills forms, creates/deletes data, and asserts results.

Scenario design catalog: [`E2E_SCENARIO_CATALOG.md`](./E2E_SCENARIO_CATALOG.md).  
**Coverage board:** [`E2E_COVERAGE.md`](./E2E_COVERAGE.md) (generated).  
**Governance (current vs next E2E level):** [`E2E_GOVERNANCE.md`](./E2E_GOVERNANCE.md).  
**Machine level / backlog:** `apps/e2e-runner/src/catalog/level.json`, `backlog.json`.

```bash
pnpm --dir apps/e2e-runner level    # where are we / what's next?
pnpm --dir apps/e2e-runner sync     # export catalog + coverage + level report
```

When the **product** changes, update catalog + tests (or backlog) so E2E level stays honest — see governance.

## How to run (any instance)

No Portainer stack env gates. Point at any BookOne URL + user credentials.

### From `/e2e` (recommended)

1. Open `https://YOUR-HOST/e2e` (no app login required for the console).
2. **Target app URL** — the instance under test (defaults to same site).
3. **Email / password** — a user on that instance.
4. **Start E2E run** — Playwright drives that URL with those credentials.
5. Download report when finished.

Optional CLI/env (only if not using `/e2e` form fields):

| Env | Purpose |
|-----|---------|
| `E2E_BASE_URL` | App under test (CLI default) |
| `E2E_EMAIL` / `E2E_PASSWORD` | Tenant login (CLI) |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | Optional super-admin for Control Room packs |

### From a shell

```bash
export E2E_BASE_URL=https://your-bookone-host
export E2E_EMAIL=you@example.com
export E2E_PASSWORD=your-password
cd apps/e2e-runner
pnpm test:smoke        # fast smoke only
pnpm test:auth         # auth catalog
pnpm test:e2e          # full suite against E2E_BASE_URL
pnpm coverage          # regenerate ID coverage board
```

## Test files (execution order)

| File | Coverage |
|------|----------|
| `00-smoke` | Login, core accounting routes, public docs |
| `01-auth` | **S-0001…S-0020** auth & session (deep) |
| `02-public` | **§2** public docs + `/e2e` + catalog IDs |
| `03-shell-routes` | **S-0034…S-0049** shell/nav + bulk tenant route load |
| `04-company-masters` | **S-0050…S-0079** brands, locations, tax, commercial brand/location |
| `05-parties-products` | **§6 P0** products/stock (S-0107…) + parties creates |
| `06-sales-journey` | **§8 P0** sales lifecycle (QT/SO/INV/pay/return S-0179…) |
| `07-purchase-inventory` | **§9 P0** purchase lifecycle (PO/GRN/bill/pay S-0245…) |
| `08-accounting` | **§11 P0** simple entry, journal, reports, recon (S-0325…) |
| `09-pos` | **§10 P0** shift/cart/tenders (S-0289…) |
| `10-edges-security` | **§15 P0** tenancy/security (S-0449…) |
| `11-integrity` | **§19 P0** TB/journal/AR/AP/stock (S-0594…) |
| `12-settings-save` | **S-0694…S-0698** company settings save + reload |
| `13-validation-catalog` | **§17 all 30 P0** error classes (S-0481…) |
| `14-route-smoke-ids` | **§18** one test per route ID (load) |
| `15-business-day` | **§12 P0** composed day journeys (S-0369…) |
| `16-parties-catalog` | **§7 all** parties catalog |
| `17-platform` | **§14 + §22** Control Room / health (optional `E2E_ADMIN_*`) |
| `18-settings-matrix` | **§5** settings behavior |
| `19-mid-op-edges` | **§13** mid-op edit/delete edges |
| `20-qty-price-matrix` | **§23** qty×price micro-matrix |
| `21-numeric-edges` | **§16** numeric & data edges |
| `22-reports-period-matrix` | **§26** reports × period |
| `23-payment-status-matrix` | **§24 + §25** payment methods + doc status |
| `24-ui-ux` | **§20** UI/UX non-functional |
| `25-stress` | **§21** rare/stress |
| `26-domain-remainder` | **§6/8/9/10/11/12/15/19** P1–P3 remainders |
| `27-catalog-sweep` | Coverage stragglers (no-op when 100% covered) |

Helpers: `settings`, `lifecycle`, `balances`, `catalog`, `catalog-run`, `staging`, auth/forms/nav/masters.  
Catalog executor: `src/runner/execute.ts` (`executeScenario`).

## Docker

Image installs Alpine Chromium; video off when using system Chrome.  
**Rebuild** web image after E2E code changes so `/app/apps/e2e-runner/tests` is updated.

## Mapping to catalog

- Prefer **one `S-NNNN` per test title** (or `loadScenariosBySection` for bulk sections).
- Coverage board: `pnpm --dir apps/e2e-runner coverage` → `docs/E2E_COVERAGE.md`.
- Deep money paths live in `05`–`11` / `15`; matrices and remainders use `executeScenario` + section loaders.
- **Target:** 698/698 IDs referenced; deepen asserts over time without dropping IDs.

## Notes

- Runs are **serial** (`workers: 1`) so data from earlier files feeds later integrity checks.
- Some steps soft-skip if a module is disabled or UI variant differs.
- Prefer a **staging** company; tests create unique `E2E-*` records.
