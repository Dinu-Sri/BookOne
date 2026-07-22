import { test } from '../src/fixtures';
import { loadScenariosBySection } from '../src/helpers/catalog';
import { runCatalogScenario } from '../src/helpers/catalog-run';

/**
 * Catalog §16 — Numeric & data edges.
 */
const scenarios = loadScenariosBySection('16.');

test.describe('Numeric & data edges §16 @numeric @edge @p0 @p1', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(360_000);

  for (const s of scenarios) {
    test(`${s.id} ${s.title} @${s.priority.toLowerCase()}`, async ({ page, browser }) => {
      await runCatalogScenario(page, browser, s);
    });
  }
});
