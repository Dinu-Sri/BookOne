import { test, expect } from '../src/fixtures';
import { loadScenariosBySection } from '../src/helpers/catalog';
import { executeScenario, newRunCtx } from '../src/runner/execute';
import { expectNoAppCrash } from '../src/helpers/assert';

/**
 * Catalog §18 — Route smoke (load only).
 * One Playwright test per S-NNNN. Runs on any target via /e2e or CLI.
 */
const routeScenarios = loadScenariosBySection('18.');

test.describe('Catalog route smoke §18 @routes @smoke @load', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(600_000);

  for (const s of routeScenarios) {
    test(`${s.id} ${s.title}`, async ({ page, browser }) => {
      const ctx = newRunCtx();
      await executeScenario(page, s, ctx, browser);
      await expectNoAppCrash(page);
      await expect(page.locator('body')).toBeVisible();
    });
  }
});
