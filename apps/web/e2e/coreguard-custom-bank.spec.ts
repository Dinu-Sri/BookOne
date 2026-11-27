import { expect, test, type Page } from '@playwright/test';
import { loadCustomBankFixture, centsToAmount } from '../../../scripts/coreguard/fixture';

const fixture = loadCustomBankFixture();
const ownerEmail = process.env.COREGUARD_BROWSER_OWNER_EMAIL ?? '';
const ownerPassword = process.env.COREGUARD_BROWSER_OWNER_PASSWORD ?? '';
const viewerEmail = process.env.COREGUARD_BROWSER_VIEWER_EMAIL ?? '';
const viewerPassword = process.env.COREGUARD_BROWSER_VIEWER_PASSWORD ?? '';
const databaseUrl = process.env.DATABASE_URL ?? '';

test.skip(!ownerEmail || !ownerPassword || !databaseUrl, 'BLOCKED: browser seed env is missing.');

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

async function pickSelect(page: Page, label: string, query: string) {
  const combo = page.getByRole('combobox', { name: label });
  await combo.click();
  const search = page.getByRole('textbox', { name: `Search ${label}` });
  if (await search.count()) {
    await search.fill(query);
  }
  const option = page.getByRole('option').filter({ hasText: new RegExp(`^${query}\\b`) }).first();
  await expect(option).toBeVisible();
  await option.evaluate((el) => (el as HTMLButtonElement).click());
  await expect(combo).toContainText(new RegExp(`^${query}\\b`));
}

async function pickOpeningDate(page: Page, iso: string) {
  await pickDate(page, 'open-date', iso);
}

async function pickDate(page: Page, id: string, iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  await page.locator(`#${id}`).click();
  const menu = page.locator(`#${id}-menu`);
  await expect(menu).toBeVisible();
  for (let i = 0; i < 24; i += 1) {
    const label = await menu.locator('strong').innerText();
    const parsed = new Date(`${label} 12:00:00`);
    const viewYear = parsed.getFullYear();
    const viewMonth = parsed.getMonth() + 1;
    if (viewYear === year && viewMonth === month) break;
    if (viewYear > year) await menu.getByRole('button', { name: 'Previous year' }).click();
    else if (viewYear < year) await menu.getByRole('button', { name: 'Next year' }).click();
    else if (viewMonth > month) await menu.getByRole('button', { name: 'Previous month' }).click();
    else await menu.getByRole('button', { name: 'Next month' }).click();
  }
  await menu.getByRole('button', { name: String(day), exact: true }).click();
}

test('custom-bank vertical slice through the real app', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, ownerEmail, ownerPassword);

  await page.goto('/accounts/new');
  await expect(page.locator('.form-shell-title')).toHaveText('New account');
  await expect(page.getByRole('heading', { name: 'Account type' })).toBeVisible();
  await expect(page.locator('#coa-code')).toHaveValue(fixture.customBank.code, { timeout: 15_000 });
  await page.locator('#coa-name').fill(fixture.customBank.name);
  await page.locator('#coa-bank').fill(fixture.customBank.institution);
  await page.locator('#coa-digits').fill(fixture.customBank.lastDigits);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/accounts\/[0-9a-f-]+/i, { timeout: 30_000 });
  await expect(page.locator('.coa-code-line')).toHaveText(fixture.customBank.code);
  await expect(page.getByRole('heading', { name: fixture.customBank.name })).toBeVisible();

  await page.goto('/accounts');
  await page.getByLabel('Search').fill(fixture.customBank.code);
  const createdRow = page.locator('tr', { hasText: fixture.customBank.code });
  await expect(createdRow).toContainText('0.00');

  await page.goto('/accounts/opening');
  await pickOpeningDate(page, fixture.opening.date);
  await pickSelect(page, 'Account, line 1', fixture.customBank.code);
  await page.getByLabel('Debit, line 1').fill(String(centsToAmount(fixture.opening.debitCents)));
  await page.getByRole('button', { name: 'Add line' }).click();
  await pickSelect(page, 'Account, line 2', fixture.equity.code);
  await page.getByLabel('Credit, line 2').fill(String(centsToAmount(fixture.opening.creditCents)));
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByText(/Balanced preview/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Post opening' }).click();
  await expect(page.getByRole('heading', { name: 'Chart of Accounts' })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Search').fill(fixture.customBank.code);
  await expect(page.locator('tr', { hasText: fixture.customBank.code })).toContainText('300.00');

  await page.goto('/');
  await page.getByRole('tab', { name: /Move Money/i }).click();
  // Simple Entry uses the shared SelectField / DateField (v2.25.0).
  await expect(page.getByRole('combobox', { name: 'From account' })).toBeEnabled({ timeout: 15_000 });
  await page.getByPlaceholder('Reference / memo').fill(fixture.transfer.party);
  await page.locator('.amount-field input').fill(String(centsToAmount(fixture.transfer.amountCents)));
  await page.locator('.field', { hasText: 'What was it for?' }).locator('input').fill('Internal bank transfer');
  await pickSelect(page, 'From account', fixture.transfer.from);
  await pickSelect(page, 'To account', fixture.transfer.to);
  await pickDate(page, 'entry-date', fixture.transfer.date);
  await page.getByRole('button', { name: 'Record Transfer' }).click();
  await expect(page.getByText(/Entry recorded/)).toBeVisible({ timeout: 30_000 });

  await page.goto('/accounts');
  await page.getByLabel('Search').fill(fixture.customBank.code);
  await expect(page.locator('tr', { hasText: fixture.customBank.code })).toContainText('200.00');
  await page.getByLabel('Search').fill(fixture.ownedBank.code);
  await expect(page.locator('tr', { hasText: fixture.ownedBank.code }).first()).toContainText('100.00');
});

test('Viewer sees Chart of Accounts without write actions', async ({ page }) => {
  test.skip(!viewerEmail || !viewerPassword, 'BLOCKED: viewer seed env is missing.');
  await login(page, viewerEmail, viewerPassword);
  await page.goto('/accounts');
  await expect(page.getByRole('heading', { name: 'Chart of Accounts' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'New account' })).toHaveCount(0);
  await page.goto('/accounts/new');
  await expect(page.getByRole('button', { name: 'Create account' })).toHaveCount(0);

  // Verify Commerce using the same Viewer session so the shared sign-in limit remains exercised normally.
  await page.goto('/company/commerce');
  const commerceTitle = page.getByRole('heading', { name: 'Commerce API' });
  if (new URL(page.url()).pathname === '/company/commerce') {
    await expect(commerceTitle).toBeVisible();
    // v2.20.0: keys are on Developer, posting controls on Settings.
    const developerTab = page.getByRole('tab', { name: 'Developer' });
    if ((await developerTab.count()) > 0) await developerTab.click();
    const issue = page.getByRole('button', { name: 'Issue scoped key' });
    if ((await issue.count()) > 0) {
      await expect(issue).toBeDisabled();
      await page.getByRole('tab', { name: 'Settings' }).click();
      await expect(page.getByRole('button', { name: 'Save pauses and posting' })).toBeDisabled();
    } else {
      await expect(issue).toHaveCount(0);
    }
  } else {
    await expect(commerceTitle).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Issue scoped key' })).toHaveCount(0);
  }
});
