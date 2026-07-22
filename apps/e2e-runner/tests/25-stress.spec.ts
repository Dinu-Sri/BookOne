import { test } from '../src/fixtures';
import { loadScenariosBySection } from '../src/helpers/catalog';
import { runCatalogScenario } from '../src/helpers/catalog-run';

/**
 * Catalog §21 — Rare / stress / ops.
 * Runs on any target instance (no staging gate).
 */
const scenarios = loadScenariosBySection('21.');

test.describe('Rare / stress ops §21 @stress @p2 @p3', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(900_000);

  for (const s of scenarios) {
    test(`${s.id} ${s.title} @${s.priority.toLowerCase()}`, async ({ page, browser }) => {
      await runCatalogScenario(page, browser, s);
    });
  }
});
