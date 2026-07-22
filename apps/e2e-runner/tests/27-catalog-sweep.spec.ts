import { test } from '../src/fixtures';
import { loadMissingScenariosFromCoverage, loadScenarios } from '../src/helpers/catalog';
import { runCatalogScenario } from '../src/helpers/catalog-run';

/**
 * Final sweep: any catalog ID still missing from coverage.generated.json.
 * Re-run `pnpm coverage` after earlier packs land, then this file picks up stragglers.
 * Runs on any target instance (no staging gate).
 */
const fromCoverage = loadMissingScenariosFromCoverage();
const scenarios = fromCoverage.length
  ? fromCoverage
  : loadScenarios().filter(() => false);

test.describe('Catalog coverage sweep @full @p1 @p2 @p3', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(scenarios.length === 0, 'No missing IDs in coverage.generated.json — all covered');
  test.setTimeout(900_000);

  for (const s of scenarios) {
    test(`${s.id} ${s.title} @${s.priority.toLowerCase()}`, async ({ page, browser }) => {
      await runCatalogScenario(page, browser, s);
    });
  }
});
