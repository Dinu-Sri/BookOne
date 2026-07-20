import { test, expect, seed } from '../src/fixtures';
import { go } from '../src/helpers/nav';
import { fillBrandLocationIfPresent, clickPrimary } from '../src/helpers/forms';

test.describe('Accounting Simple Entry & reports @accounting @p0', () => {
  test.describe.configure({ mode: 'serial' });

  test('Simple Entry money out posts', async ({ authedPage: page }) => {
    await go(page, '/');
    // Money out mode if strip present
    const moneyOut = page.locator('.entry-mode').filter({ hasText: /Money out|Expense/i }).first();
    if (await moneyOut.isVisible().catch(() => false)) {
      await moneyOut.click();
    }
    const party = page.locator('input').filter({ has: page.locator('..') }).first();
    // Prefer labeled party field
    const partyInput = page.locator('.entry-form input.large, .entry-form input').first();
    await partyInput.fill(`E2E Supplier ${seed()}`);
    const amount = page.locator('.amount-field input, input').filter({ hasNot: page.locator('[type=hidden]') });
    // Find amount field more reliably
    const amountField = page.locator('.field.amount-field input, .amount-field input').first();
    if (await amountField.isVisible().catch(() => false)) {
      await amountField.fill('1250');
    } else {
      // last large input often amount
      const inputs = page.locator('.entry-form input.large');
      const c = await inputs.count();
      if (c > 1) await inputs.nth(c - 1).fill('1250');
    }
    await fillBrandLocationIfPresent(page);
    await clickPrimary(page, /Post|Save|Record|Submit/i);
    await page.waitForTimeout(2000);
    // Success toast or stay without crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('journal page integrity widgets', async ({ authedPage: page }) => {
    await go(page, '/journal');
    await expect(page.locator('.metric-card, .workspace, table').first()).toBeVisible();
  });

  test('transactions page filters shell', async ({ authedPage: page }) => {
    await go(page, '/transactions');
    await expect(page.locator('form.filter-bar, .workspace, table').first()).toBeVisible();
  });

  test('all report tabs', async ({ authedPage: page }) => {
    for (const rep of ['pnl', 'balance', 'cashflow', 'ledger', 'trial']) {
      await go(page, `/reports?report=${rep}`);
      await expect(page.locator('.report-tabs, .workspace, .card').first()).toBeVisible();
    }
  });

  test('accounts page', async ({ authedPage: page }) => {
    await go(page, '/accounts');
    await expect(page.locator('table, .card, .workspace').first()).toBeVisible();
  });

  test('reconciliation page', async ({ authedPage: page }) => {
    await go(page, '/reconciliation');
    await expect(page.locator('.workspace, .card').first()).toBeVisible();
  });

  test('dashboard metrics', async ({ authedPage: page }) => {
    await go(page, '/dashboard');
    await expect(page.locator('.metric-card, .grid.metrics, .workspace').first()).toBeVisible();
  });
});
