import { test, expect, loginAsE2eUser, requireE2eAuth } from '../src/fixtures';

/**
 * Fast smoke (default suite entry). Catalog: @smoke.
 * Kept separate so /e2e UI runs can complete quickly; full suite via E2E_FULL=1 or all files.
 */
test.describe('Smoke @smoke @p0', () => {
  test.beforeAll(() => requireE2eAuth());

  test('login lands on app shell', async ({ page }) => {
    await loginAsE2eUser(page, { fresh: true });
    await expect(page.locator('.app-shell, .sidebar').first()).toBeVisible();
  });

  test('core accounting routes', async ({ page }) => {
    await loginAsE2eUser(page);
    for (const path of ['/', '/dashboard', '/transactions', '/journal', '/reports', '/accounts']) {
      await page.goto(path);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator('.workspace, .app-shell').first()).toBeVisible();
    }
  });

  test('docs public', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/docs');
    await expect(page).not.toHaveURL(/\/login/);
    await ctx.close();
  });
});
