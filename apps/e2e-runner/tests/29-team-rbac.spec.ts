import { test, expect } from '../src/fixtures';
import { go } from '../src/helpers/nav';
import { expectAuthedShell } from '../src/helpers/assert';
import { loginWithCredentials } from '../src/helpers/auth';

test.describe('Team RBAC @company @team', () => {
  test('S-0713 Company Team loads for owner', async ({ authedPage: page }) => {
    await go(page, '/company/team');
    await expect(page.getByText(/who can use bookone/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /send invite/i })).toBeVisible();
    await expectAuthedShell(page);
  });

  test('S-0714 Jobs screen loads', async ({ authedPage: page }) => {
    await go(page, '/company/team/jobs');
    await expect(page.getByRole('button', { name: /owner/i }).first()).toBeVisible();
    await expectAuthedShell(page);
  });

  test('S-0731 Groups screen loads', async ({ authedPage: page }) => {
    await go(page, '/company/team/groups');
    await expect(page.getByRole('button', { name: /add group/i })).toBeVisible();
    await expect(page.getByText(/shares the|no groups yet|group name/i).first()).toBeVisible();
    await expectAuthedShell(page);
  });

  test('S-0732 Access history on Team', async ({ authedPage: page }) => {
    await go(page, '/company/team');
    await expect(page.getByText(/access history/i)).toBeVisible();
    await expectAuthedShell(page);
  });

  test('S-0733 Person access page loads', async ({ authedPage: page }) => {
    await go(page, '/company/team');
    const person = page.locator('table.table tbody tr td a').first();
    await expect(person).toBeVisible();
    await person.click();
    await expect(page.getByText(/also help with/i)).toBeVisible();
    await expect(page.getByText(/what they can open/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /save exceptions/i })).toBeVisible();
    await expectAuthedShell(page);
  });

  test('S-0734 Person shop scope', async ({ authedPage: page }) => {
    await go(page, '/company/team');
    const person = page.locator('table.table tbody tr td a').first();
    await expect(person).toBeVisible();
    await person.click();
    await expect(page.getByText(/shops they can use/i)).toBeVisible();
    await expect(page.getByText(/every shop/i)).toBeVisible();
    await expectAuthedShell(page);
  });

  test('S-0735 Add person with password', async ({ authedPage: page }) => {
    await go(page, '/company/team');
    await expect(page.getByRole('button', { name: /add person/i })).toBeVisible();
    await expect(page.getByText(/no email is sent/i)).toBeVisible();
    await expectAuthedShell(page);
  });

  test('S-0736 Set password on person page', async ({ authedPage: page }) => {
    await go(page, '/company/team');
    const person = page.locator('table.table tbody tr td a').first();
    await expect(person).toBeVisible();
    await person.click();
    await expect(page.getByRole('button', { name: /set password/i })).toBeVisible();
    await expectAuthedShell(page);
  });

  test('S-0720 Last owner cannot be removed', async ({ authedPage: page }) => {
    await go(page, '/company/team');
    const ownerRow = page.locator('table.table').first().locator('tbody tr').filter({ hasText: /owner/i }).first();
    await expect(ownerRow).toBeVisible();
    await ownerRow.getByRole('button', { name: /remove/i }).click();
    await expect(page.getByText(/last owner cannot be removed/i)).toBeVisible({ timeout: 15_000 });
  });

  test('S-0717 Cashier POS ok; Pay Vendors URL denied', async ({ authedPage: page, browser }) => {
    const stamp = Date.now();
    const email = `e2e.cashier.${stamp}@bookone.test`;
    const password = 'Cashier#12345';
    await go(page, '/company/team');
    const add = page.locator('form.company-inline-form').filter({ has: page.getByRole('button', { name: /add person/i }) });
    await add.locator('input[name="name"]').fill('E2E Cashier');
    await add.locator('input[name="email"]').fill(email);
    await add.locator('input[name="password"]').fill(password);
    await add.locator('input[name="confirmPassword"]').fill(password);
    await add.locator('select[name="roleId"]').selectOption({ label: 'Cashier' });
    await add.getByRole('button', { name: /add person/i }).click();
    await expect(page.getByText(/can sign in at bookone/i)).toBeVisible({ timeout: 20_000 });

    const ctx = await browser.newContext();
    const cashier = await ctx.newPage();
    await loginWithCredentials(cashier, email, password);
    await cashier.goto('/pos', { waitUntil: 'domcontentloaded' });
    await expect(cashier).not.toHaveURL(/\/login/);
    await expect(cashier.locator('.pos-root, .app-shell, main').first()).toBeVisible({ timeout: 20_000 });
    await cashier.goto('/purchase/payments', { waitUntil: 'domcontentloaded' });
    await expect(cashier).not.toHaveURL(/\/purchase\/payments$/);
    await expect(cashier.getByRole('heading', { name: /pay vendors/i })).toHaveCount(0);
    await ctx.close();
    await go(page, '/company/team');
    const row = page.locator('table.table tbody tr').filter({ hasText: email });
    if (await row.getByRole('button', { name: /remove/i }).isVisible().catch(() => false)) {
      await row.getByRole('button', { name: /remove/i }).click();
    }
  });

  test('S-0730 Cashier typed Pay Vendors URL is not the payments screen', async ({ authedPage: page, browser }) => {
    const stamp = Date.now();
    const email = `e2e.cashier.deny.${stamp}@bookone.test`;
    const password = 'Cashier#12345';
    await go(page, '/company/team');
    const add = page.locator('form.company-inline-form').filter({ has: page.getByRole('button', { name: /add person/i }) });
    await add.locator('input[name="name"]').fill('E2E Deny');
    await add.locator('input[name="email"]').fill(email);
    await add.locator('input[name="password"]').fill(password);
    await add.locator('input[name="confirmPassword"]').fill(password);
    await add.locator('select[name="roleId"]').selectOption({ label: 'Cashier' });
    await add.getByRole('button', { name: /add person/i }).click();
    await expect(page.getByText(/can sign in at bookone/i)).toBeVisible({ timeout: 20_000 });

    const ctx = await browser.newContext();
    const cashier = await ctx.newPage();
    await loginWithCredentials(cashier, email, password);
    await cashier.goto('/purchase/payments', { waitUntil: 'domcontentloaded' });
    await expect(cashier).not.toHaveURL(/\/purchase\/payments/);
    await ctx.close();
    await go(page, '/company/team');
    const row = page.locator('table.table tbody tr').filter({ hasText: email });
    if (await row.getByRole('button', { name: /remove/i }).isVisible().catch(() => false)) {
      await row.getByRole('button', { name: /remove/i }).click();
    }
  });

  test('S-0737 Remove then restore a helper', async ({ authedPage: page }) => {
    const stamp = Date.now();
    const email = `e2e.restore.${stamp}@bookone.test`;
    await go(page, '/company/team');
    const add = page.locator('form.company-inline-form').filter({ has: page.getByRole('button', { name: /add person/i }) });
    await add.locator('input[name="name"]').fill('E2E Restore');
    await add.locator('input[name="email"]').fill(email);
    await add.locator('input[name="password"]').fill('Restore#12345');
    await add.locator('input[name="confirmPassword"]').fill('Restore#12345');
    await add.locator('select[name="roleId"]').selectOption({ label: 'Viewer' });
    await add.getByRole('button', { name: /add person/i }).click();
    await expect(page.getByText(/can sign in at bookone/i)).toBeVisible({ timeout: 20_000 });
    const row = page.locator('table.table tbody tr').filter({ hasText: email });
    await row.getByRole('button', { name: /remove/i }).click();
    await expect(row.getByRole('button', { name: /restore/i })).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: /restore/i }).click();
    await expect(row.getByRole('button', { name: /remove/i })).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: /remove/i }).click();
  });
});
