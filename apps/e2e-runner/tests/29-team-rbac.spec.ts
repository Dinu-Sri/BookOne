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
});
