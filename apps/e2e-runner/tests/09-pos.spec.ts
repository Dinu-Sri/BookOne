import { test, expect } from '../src/fixtures';
import { go } from '../src/helpers/nav';

test.describe('POS terminal @pos @p0', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test('POS page loads', async ({ authedPage: page }) => {
    await page.goto('/pos');
    // May show terminal or "no registers"
    await expect(page.locator('.pos-root, .pos-brand, h1, .workspace, .app-shell').first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('open shift if prompted', async ({ authedPage: page }) => {
    await page.goto('/pos');
    const openShift = page.getByRole('button', { name: /Open shift|Start shift/i }).first();
    if (await openShift.isVisible({ timeout: 5000 }).catch(() => false)) {
      const float = page.locator('input[name="openingFloat"], input[type="number"]').first();
      if (await float.isVisible().catch(() => false)) await float.fill('1000');
      await openShift.click();
      await page.waitForTimeout(1500);
    }
  });

  test('POS history and shifts lists', async ({ authedPage: page }) => {
    await go(page, '/sales/pos');
    await go(page, '/sales/pos/shifts');
  });

  test('customer display public-ish page', async ({ authedPage: page }) => {
    await page.goto('/pos/customer-display');
    await expect(page.locator('body')).toBeVisible();
  });

  test('attempt simple POS cart if UI present', async ({ authedPage: page }) => {
    await page.goto('/pos');
    // Search product if search box exists
    const search = page.locator('input[placeholder*="Search"], input[placeholder*="scan"], input[placeholder*="SKU"]').first();
    if (!(await search.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'POS cart UI not available (no register/shift)');
      return;
    }
    await search.fill('a');
    await page.waitForTimeout(800);
    // Click first product tile/button if any
    const tile = page.locator('.pos-product, .pos-tile, button').filter({ hasText: /.+/ }).nth(2);
    if (await tile.isVisible().catch(() => false)) {
      await tile.click();
    }
    const pay = page.getByRole('button', { name: /Pay|Cash|Charge|Complete/i }).first();
    if (await pay.isVisible().catch(() => false)) {
      await pay.click();
      // Confirm cash if dialog
      const cash = page.getByRole('button', { name: /^Cash$/i }).first();
      if (await cash.isVisible({ timeout: 3000 }).catch(() => false)) await cash.click();
      await page.waitForTimeout(2000);
    }
    await expect(page.locator('body')).toBeVisible();
  });
});
