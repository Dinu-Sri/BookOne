import { test, expect } from '../src/fixtures';
import { go } from '../src/helpers/nav';
import { expectAuthedShell } from '../src/helpers/assert';

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
});
