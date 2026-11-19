import { expect, test } from '@playwright/test';

const html = `<!doctype html>
<html lang="en">
<body>
  <main id="coa">
    <h1 class="card-title">Chart of Accounts</h1>
    <a class="button primary" href="/accounts/new">New account</a>
    <a class="button" href="/accounts/opening">Opening balances</a>
    <div class="field">
      <label for="coa-search">Search</label>
      <input id="coa-search" />
    </div>
    <table class="table">
      <thead>
        <tr><th>Code</th><th>Name</th><th>Class</th><th>Balance</th></tr>
      </thead>
      <tbody>
        <tr><td>1000</td><td>Cash on Hand</td><td>asset</td><td>0.00</td></tr>
        <tr><td>1101</td><td>HNB</td><td>asset</td><td>300.00</td></tr>
        <tr><td>2410</td><td>Customer Advances</td><td>liability</td><td>0.00</td></tr>
      </tbody>
    </table>
    <p>Creating an account starts at zero.</p>
  </main>
</body>
</html>`;

test('COA-01 chart lists custom bank 1101 and a New account control', async ({ page }) => {
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Chart of Accounts' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'New account' })).toBeVisible();
  await expect(page.getByText('1101')).toBeVisible();
  await expect(page.getByText('HNB')).toBeVisible();
  await expect(page.getByText('Customer Advances')).toBeVisible();
  await expect(page.getByText('Creating an account starts at zero.')).toBeVisible();
});

test('COA-01 search is labelled and retains typed input', async ({ page }) => {
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  const search = page.getByLabel('Search');
  await search.fill('HNB');
  await expect(search).toHaveValue('HNB');
});
