import { test, expect } from '../src/fixtures';
import { go } from '../src/helpers/nav';

test.describe('Rental / event hire @rental', () => {
  test('S-0699 rental settings page loads', async ({ authedPage: page }) => {
    await go(page, '/company/rental');
    await expect(page.getByText(/when to invoice/i)).toBeVisible();
    await expect(page.locator('select[name="defaultInvoiceTiming"]')).toBeVisible();
  });

  test('S-0700 rental calendar page loads', async ({ authedPage: page }) => {
    await go(page, '/inventory/calendar');
    await expect(page.locator('.workspace, .card-body').first()).toBeVisible();
  });

  test('S-0701 dispatch / returns page loads', async ({ authedPage: page }) => {
    await go(page, '/inventory/on-rent');
    await expect(page.getByText(/dispatch \/ returns/i)).toBeVisible();
  });

  test('S-0702 hire docs page is public', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/docs/inventory/rental');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(/event hire/i).first()).toBeVisible();
    await ctx.close();
  });

  test('S-0703 stock levels fleet filters', async ({ authedPage: page }) => {
    await go(page, '/inventory/levels?fleet=on_rent');
    await expect(page.getByRole('button', { name: /on rent/i }).first()).toBeVisible();
    await go(page, '/inventory/levels?fleet=wash');
    await expect(page.getByRole('button', { name: /^wash$/i }).first()).toBeVisible();
  });
});
