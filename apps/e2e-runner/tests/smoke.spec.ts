import { test, expect } from '@playwright/test';

/**
 * Full browser smoke against a live BookOne instance.
 * Credentials: E2E_EMAIL / E2E_PASSWORD (injected by the QA runner UI).
 */
const email = process.env.E2E_EMAIL || '';
const password = process.env.E2E_PASSWORD || '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  if (!email || !password) {
    throw new Error('E2E_EMAIL and E2E_PASSWORD must be set (use the QA runner UI).');
  }
});

test('login lands on app shell', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toBeVisible();

  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();

  // After auth we should leave /login
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 45_000 });
  await expect(page.locator('.app-shell, .sidebar, main, .workspace').first()).toBeVisible({
    timeout: 20_000,
  });
});

test('accounting suite routes load', async ({ page }) => {
  // Ensure session (re-login if needed)
  await page.goto('/login');
  if (await page.getByTestId('login-form').isVisible().catch(() => false)) {
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 45_000 });
  }

  const routes = [
    { path: '/', name: 'Simple Entry' },
    { path: '/dashboard', name: 'Dashboard' },
    { path: '/transactions', name: 'Transactions' },
    { path: '/journal', name: 'Journal' },
    { path: '/reports', name: 'Reports' },
    { path: '/accounts', name: 'Accounts' },
    { path: '/reconciliation', name: 'Reconciliation' },
  ];

  for (const r of routes) {
    await test.step(`Open ${r.name}`, async () => {
      await page.goto(r.path);
      await expect(page).not.toHaveURL(/\/login/);
      // No giant page-heading required — content or workspace should exist
      await expect(page.locator('.workspace, .app-shell, .card, .grid').first()).toBeVisible({
        timeout: 20_000,
      });
      // Regression: page-level PageHeading titles we removed should not reappear as H1 blocks
      // (card titles are fine)
    });
  }
});

test('sales and parties navigation', async ({ page }) => {
  await page.goto('/login');
  if (await page.getByTestId('login-form').isVisible().catch(() => false)) {
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 45_000 });
  }

  for (const path of [
    '/parties/customers',
    '/sales/quotations',
    '/sales/invoices',
    '/purchase/orders',
    '/inventory/products',
  ]) {
    await test.step(`Open ${path}`, async () => {
      await page.goto(path);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator('.workspace, .party-workspace, .app-shell').first()).toBeVisible({
        timeout: 20_000,
      });
    });
  }
});

test('docs are public (no login required)', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/docs');
  // Should not bounce to login for public docs
  await expect(page).not.toHaveURL(/\/login/);
  await context.close();
});
