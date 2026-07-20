import { test, expect } from '../src/fixtures';
import { go } from '../src/helpers/nav';

/**
 * Post-ops integrity checks (S-catalog integrity section).
 * Run after journey tests in full suite (serial workers=1 orders by filename).
 */
test.describe('Integrity @integrity @reports @p0', () => {
  test('journal page shows metrics', async ({ authedPage: page }) => {
    await go(page, '/journal');
    await expect(page.locator('.metric-card, .workspace').first()).toBeVisible();
  });

  test('trial balance report loads', async ({ authedPage: page }) => {
    await go(page, '/reports?report=trial');
    await expect(page.locator('.workspace, .card, table').first()).toBeVisible();
  });

  test('AR aging loads', async ({ authedPage: page }) => {
    await go(page, '/sales/aging');
    await expect(page.locator('.workspace').first()).toBeVisible();
  });

  test('AP aging loads', async ({ authedPage: page }) => {
    await go(page, '/purchase/aging');
    await expect(page.locator('.workspace').first()).toBeVisible();
  });

  test('stock levels load', async ({ authedPage: page }) => {
    await go(page, '/inventory/levels');
    await expect(page.locator('.workspace, table, .empty-state').first()).toBeVisible();
  });
});
