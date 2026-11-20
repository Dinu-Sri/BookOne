import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';
import { amountToCents, independentBankReconOracle, loadBankReconFixture } from '../../../scripts/coreguard/fixture';
import { accountBalances, journalCount, openLedger, seedBankReconLedger } from '../../../scripts/coreguard/ledger';

const fixture = loadBankReconFixture();
const oracle = independentBankReconOracle(fixture);
const ownerEmail = process.env.COREGUARD_BROWSER_OWNER_EMAIL ?? '';
const ownerPassword = process.env.COREGUARD_BROWSER_OWNER_PASSWORD ?? '';
const tenantId = process.env.COREGUARD_BROWSER_TENANT_A ?? '';
const databaseUrl = process.env.DATABASE_URL ?? '';
const isoCsv = path.resolve(__dirname, '../../../docs/coreguard/fixtures/bank-recon', fixture.statement.isoFile);

test.skip(!ownerEmail || !ownerPassword || !databaseUrl || !tenantId, 'BLOCKED: browser seed env is missing.');

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

test('ISO import matches existing entries without journals, then finishes after the difference is explained', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const sql = openLedger(databaseUrl);
  let ownerId = '';
  try {
    await sql`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`;
    const [user] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE tenant_id = ${tenantId} AND email = ${ownerEmail} LIMIT 1
    `;
    ownerId = user?.id ?? '';
    expect(ownerId).toBeTruthy();
    await seedBankReconLedger(sql, tenantId, ownerId, fixture);
    expect(amountToCents((await accountBalances(sql, tenantId))[fixture.bank.code] ?? 0)).toBe(oracle.afterSeed.bank);
    expect(await journalCount(sql, tenantId)).toBe(oracle.afterSeed.journals);
  } finally {
    await sql.end({ timeout: 5 });
  }

  await login(page, ownerEmail, ownerPassword);
  await page.goto('/reconciliation/import');
  await expect(page.getByRole('heading', { name: 'Upload bank file' })).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('bis-file-input').setInputFiles(isoCsv);
  await expect(page.getByRole('heading', { name: 'Which bank?' })).toBeVisible({ timeout: 30_000 });
  await page.locator('.bis-card', { hasText: fixture.bank.code }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('bis-mapping-table')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('bis-mapping-table')).toContainText('2026-11-03');
  await expect(page.getByTestId('bis-skip-sheet')).toContainText('one sheet');
  await page.getByRole('button', { name: 'Review totals' }).click();
  await expect(page.getByTestId('bis-equation')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('bis-equation')).toContainText('1,000');
  await expect(page.getByTestId('bis-equation')).toContainText('625');
  await expect(page.getByTestId('bis-equation')).toContainText('225');
  await expect(page.getByTestId('bis-equation')).toContainText('1,400');
  await expect(page.getByTestId('bis-row-counts')).toContainText('4 input');
  await page.getByRole('button', { name: 'Save bank lines' }).click();
  await expect(page.getByRole('heading', { name: 'Save bank lines?' })).toBeVisible();
  await page.getByRole('button', { name: 'Save bank lines' }).last().click();
  await expect(page.getByRole('heading', { name: 'Bank file saved' })).toBeVisible({ timeout: 30_000 });

  const afterImport = openLedger(databaseUrl);
  try {
    expect(await journalCount(afterImport, tenantId)).toBe(oracle.afterImportMatch.journals);
  } finally {
    await afterImport.end({ timeout: 5 });
  }

  await page.goto('/reconciliation');
  const inboxDiff = page.getByTestId('recon-inbox-difference').first();
  await expect(inboxDiff).toBeVisible({ timeout: 30_000 });
  await expect(inboxDiff).toContainText('85.00');
  await expect(inboxDiff).not.toContainText('Unverified');
  await expect(inboxDiff).not.toHaveText('Rs. 0.00');
  await page.locator('a[href^="/reconciliation/session/"]').first().click();

  await expect(page.getByTestId('brc-bank-pane')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Bank statement' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'BookOne records' })).toBeVisible();
  await expect(page.getByTestId('brc-difference')).toContainText('85.00');
  await expect(page.getByTestId('brc-difference')).not.toContainText('Unverified');
  await expect(page.getByText('Possible match').first()).toBeVisible();
  await expect(page.getByText('Bank only').first()).toBeVisible();
  await expect(page.getByText('BookOne only').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review & finish' })).toHaveCount(0);

  for (let left = 3; left > 0; left -= 1) {
    await expect(page.getByText('Possible match')).toHaveCount(left * 2, { timeout: 15_000 });
    await expect(page.getByTestId('brc-confirm-match')).toBeEnabled();
    await page.getByTestId('brc-confirm-match').click();
  }
  await expect(page.getByText('Possible match')).toHaveCount(0, { timeout: 15_000 });

  const sessionMatch = page.url().match(/\/reconciliation\/session\/([^/?#]+)/);
  expect(sessionMatch?.[1]).toBeTruthy();
  await page.goto(`/reconciliation/session/${sessionMatch![1]}/guided`);
  await expect(page.getByRole('button', { name: 'Search BookOne' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Add to BookOne' })).toHaveCount(0);
  await expect(page.getByText('Search BookOne first')).toBeVisible();
  await page.goto(`/reconciliation/session/${sessionMatch![1]}`);
  await expect(page.getByTestId('brc-bank-pane')).toBeVisible({ timeout: 30_000 });

  const afterMatch = openLedger(databaseUrl);
  try {
    expect(await journalCount(afterMatch, tenantId)).toBe(oracle.afterImportMatch.journals);
  } finally {
    await afterMatch.end({ timeout: 5 });
  }

  await page.getByText('Bank only').first().click();
  await page.getByRole('button', { name: 'Search BookOne' }).click();
  await pickSelect(page, 'Category', fixture.expense.code);
  await expect(page.getByRole('combobox', { name: 'Category' })).toContainText('General Expense');
  await expect(page.getByRole('combobox', { name: 'Category' })).not.toContainText('Bank fees');
  await page.getByRole('button', { name: 'Create in BookOne' }).click();
  await page.getByRole('button', { name: 'Create entry' }).click();
  await expect(page.getByText('Added to BookOne')).toBeVisible({ timeout: 20_000 });

  await page.getByText('BookOne only').first().click();
  await page.getByRole('button', { name: 'Waiting to clear' }).click();
  await expect(page.getByText('Marked waiting to clear')).toBeVisible({ timeout: 15_000 });

  await expect(page.getByTestId('brc-review-finish')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('brc-review-finish').click();
  await expect(page.getByTestId('brc-finish-review')).toContainText('Difference LKR 0.00');
  await page.getByRole('button', { name: 'Finish reconciliation' }).click();
  await expect(page.getByText('Finished')).toBeVisible({ timeout: 15_000 });

  const afterFinish = openLedger(databaseUrl);
  try {
    expect(amountToCents((await accountBalances(afterFinish, tenantId))[fixture.bank.code] ?? 0)).toBe(
      oracle.afterFeeAndWaiting.bank,
    );
    expect(await journalCount(afterFinish, tenantId)).toBe(oracle.afterFeeAndWaiting.journals);
  } finally {
    await afterFinish.end({ timeout: 5 });
  }
});
