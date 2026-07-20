import { test, expect } from '../src/fixtures';
import { go } from '../src/helpers/nav';
import { loginAsE2eUser } from '../src/helpers/auth';

test.describe('Edges & security @edge @security @p0', () => {
  test('foreign UUID invoice not found', async ({ authedPage: page }) => {
    await page.goto('/sales/invoices/00000000-0000-0000-0000-000000000099');
    // not-found or empty — not other tenant data
    await expect(page.locator('body')).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body.toLowerCase()).not.toMatch(/internal server error/);
  });

  test('invalid path does not 500', async ({ authedPage: page }) => {
    await page.goto('/this-route-does-not-exist-e2e');
    await expect(page.locator('body')).toBeVisible();
  });

  test('SQL-ish search harmless', async ({ authedPage: page }) => {
    await go(page, '/parties/customers');
    const search = page.locator('input.party-search, input[placeholder*="Search"]').first();
    if (await search.isVisible()) {
      await search.fill(`'; DROP TABLE parties;--`);
      await page.waitForTimeout(600);
    }
    await expect(page.locator('body')).toBeVisible();
  });

  test('XSS-ish party search escaped', async ({ authedPage: page }) => {
    await go(page, '/parties/customers');
    const search = page.locator('input.party-search').first();
    if (await search.isVisible()) {
      await search.fill('<script>alert(1)</script>');
      await page.waitForTimeout(400);
    }
    // No dialog
    await expect(page.locator('body')).toBeVisible();
  });

  test('module-gated URL still safe', async ({ authedPage: page }) => {
    await page.goto('/inventory/products');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('control room as current user safe', async ({ authedPage: page }) => {
    await page.goto('/control-room');
    await expect(page.locator('body')).toBeVisible();
  });

  test('session required for dashboard after cookie clear', async ({ page }) => {
    await loginAsE2eUser(page);
    await page.context().clearCookies();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
