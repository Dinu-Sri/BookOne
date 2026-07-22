import { test } from '../src/fixtures';
import { loadScenariosBySection } from '../src/helpers/catalog';
import { runCatalogScenario } from '../src/helpers/catalog-run';

/**
 * Catalog §24 payment methods + §25 document status transitions.
 */
const payment = loadScenariosBySection('24.');
const status = loadScenariosBySection('25.');

test.describe('Payment method matrix §24 @payments @matrix @p1', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240_000);

  for (const s of payment) {
    test(`${s.id} ${s.title} @${s.priority.toLowerCase()}`, async ({ page, browser }) => {
      await runCatalogScenario(page, browser, s);
    });
  }
});

test.describe('Document status transitions §25 @status @p0 @p1', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300_000);

  for (const s of status) {
    test(`${s.id} ${s.title} @${s.priority.toLowerCase()}`, async ({ page, browser }) => {
      await runCatalogScenario(page, browser, s);
    });
  }
});
