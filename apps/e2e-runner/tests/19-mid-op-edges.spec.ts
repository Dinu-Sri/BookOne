import { test } from '../src/fixtures';
import { loadScenariosBySection } from '../src/helpers/catalog';
import { runCatalogScenario } from '../src/helpers/catalog-run';

/**
 * Catalog §13 — Mid-operation edit/delete edges.
 */
const scenarios = loadScenariosBySection('13.');

test.describe('Mid-op edit/delete edges §13 @edge @p0 @p1', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(420_000);

  for (const s of scenarios) {
    test(`${s.id} ${s.title} @${s.priority.toLowerCase()}`, async ({ page, browser }) => {
      await runCatalogScenario(page, browser, s);
    });
  }
});
