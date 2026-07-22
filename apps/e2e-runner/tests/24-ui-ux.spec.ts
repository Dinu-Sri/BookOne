import { test, expect } from '../src/fixtures';
import { loadScenariosBySection } from '../src/helpers/catalog';
import { go } from '../src/helpers/nav';
import { expectAuthedShell, expectNoAppCrash } from '../src/helpers/assert';
import { runCatalogScenario } from '../src/helpers/catalog-run';

/**
 * Catalog §20 — UI/UX non-functional.
 */
const scenarios = loadScenariosBySection('20.');

test.describe('UI/UX non-functional §20 @ui @p2', () => {
  test.setTimeout(240_000);

  test('mobile viewport shell', async ({ authedPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await go(page, '/dashboard');
    await expectAuthedShell(page);
    await expectNoAppCrash(page);
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('no giant PageHeading on accounting', async ({ authedPage: page }) => {
    for (const path of ['/dashboard', '/journal', '/reports']) {
      await go(page, path);
      await expect(page.locator('.page-heading .eyebrow, .page-heading h1')).toHaveCount(0);
    }
  });

  for (const s of scenarios) {
    test(`${s.id} ${s.title} @${s.priority.toLowerCase()}`, async ({ page, browser }) => {
      await runCatalogScenario(page, browser, s);
    });
  }
});
