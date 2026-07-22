# BookOne E2E catalog coverage

> **Generated** - do not hand-edit. Run:
> `node apps/e2e-runner/scripts/generate-coverage.mjs`

## Summary

| Metric | Value |
|--------|------:|
| Catalog total | 698 |
| IDs referenced in code | 698 |
| IDs missing | 0 |
| Coverage (ID presence) | 100% |
| Generated at | 2026-07-22T04:46:37.698Z |

status=referenced means the catalog ID string appears in tests/ or src/ (execute handlers). It does not yet certify deep mutate/balance assertions — see docs/E2E_AUTOMATION.md phases.

## By section

| Section | Total | Referenced | Missing |
|---------|------:|----------:|--------:|
| 18. Route smoke (load only) | 83 | 83 | 0 |
| 8. Sales lifecycle | 66 | 66 | 0 |
| 9. Purchase lifecycle | 44 | 44 | 0 |
| 11. Accounting, reports, reconciliation | 44 | 44 | 0 |
| 6. Products & stock | 39 | 39 | 0 |
| 10. POS | 36 | 36 | 0 |
| 7. Parties | 33 | 33 | 0 |
| 13. Mid-operation edit/delete edges | 33 | 33 | 0 |
| 4. Company masters | 30 | 30 | 0 |
| 17. Validation error catalog (one per class) | 30 | 30 | 0 |
| 5. Settings behavior matrix | 27 | 27 | 0 |
| 12. Full business-day journeys | 26 | 26 | 0 |
| 23. Quantity/price micro-matrix | 23 | 23 | 0 |
| 14. Control Room / platform | 21 | 21 | 0 |
| 1. Authentication & session | 20 | 20 | 0 |
| 16. Numeric & data edges | 17 | 17 | 0 |
| 3. Shell, navigation, period, module gating | 16 | 16 | 0 |
| 15. Security & tenancy | 15 | 15 | 0 |
| 22. Health-check suite step scenarios (mirror product suite) | 15 | 15 | 0 |
| 26. Reports x period matrix | 15 | 15 | 0 |
| 25. Document status transitions | 14 | 14 | 0 |
| 2. Public surfaces (docs & E2E console) | 13 | 13 | 0 |
| 21. Rare / stress / ops | 11 | 11 | 0 |
| 19. Integrity after operations | 8 | 8 | 0 |
| 20. UI/UX non-functional | 8 | 8 | 0 |
| 24. Payment method matrices | 6 | 6 | 0 |
| 27. Company settings pages save | 5 | 5 | 0 |

## Missing P0 IDs (0)

_None - all P0 IDs appear in source._

## Artifacts

- Machine JSON: `apps/e2e-runner/src/catalog/coverage.generated.json`
- Catalog source: `apps/e2e-runner/src/catalog/scenarios.json`
- Scenario design: `docs/E2E_SCENARIO_CATALOG.md`
