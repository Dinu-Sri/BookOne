import { test } from '../src/fixtures';
import { loadScenariosBySection } from '../src/helpers/catalog';
import { runCatalogScenario } from '../src/helpers/catalog-run';

/**
 * Catalog §7 — Parties (all remaining IDs incl. P0 creates).
 */
const scenarios = loadScenariosBySection('7.');

test.describe('Parties catalog §7 @parties @p0 @p1', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(420_000);

  for (const s of scenarios) {
    test(`${s.id} ${s.title} @${s.priority.toLowerCase()}`, async ({ page, browser }) => {
      await runCatalogScenario(page, browser, s);
    });
  }
});
