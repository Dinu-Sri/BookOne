import { test } from '../src/fixtures';
import { loadScenariosBySection } from '../src/helpers/catalog';
import { runCatalogScenario } from '../src/helpers/catalog-run';

/**
 * Catalog §5 — Settings behavior matrix (VAT, GRN, credit limit, costing…).
 * Runs on any target instance (no staging gate).
 */
const scenarios = loadScenariosBySection('5.');

test.describe('Settings behavior matrix §5 @settings @matrix @p0', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(420_000);

  for (const s of scenarios) {
    test(`${s.id} ${s.title} @${s.priority.toLowerCase()}`, async ({ page, browser }) => {
      await runCatalogScenario(page, browser, s);
    });
  }
});
