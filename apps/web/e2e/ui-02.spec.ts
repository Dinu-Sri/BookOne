import { expect, test } from '@playwright/test';

const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>UI-02 CoA fixture</title></head>
<body>
  <main>
    <div class="party-form-top">
      <a class="party-back-btn" href="/accounts">
        <span aria-hidden>←</span>
        <span><strong>Back</strong><small>Accounts</small></span>
      </a>
      <span>New account</span>
    </div>
    <div class="party-toolbar">
      <div class="party-search-form">
        <label for="coa-search">Search</label>
        <input id="coa-search" class="input party-search" />
      </div>
      <div class="field">
        <label for="coa-root">Class</label>
        <button id="coa-root" type="button" role="combobox" class="input" aria-haspopup="listbox" aria-expanded="false" aria-controls="class-list">Asset</button>
        <div id="class-list" role="listbox" hidden>
          <button type="button" role="option" data-value="asset">Asset</button>
          <button type="button" role="option" data-value="expense">Expense</button>
          <button type="button" role="option" data-value="operating">Operating expense</button>
        </div>
      </div>
    </div>
    <h1>Chart of Accounts</h1>
    <table>
      <thead><tr><th>Code</th><th>Name</th><th>Class</th><th>Subtype</th></tr></thead>
      <tbody>
        <tr><td>1000</td><td>Cash on Hand</td><td>Asset</td><td>Cash</td></tr>
        <tr><td>6800</td><td>Office supplies</td><td>Expense</td><td>Operating expense</td></tr>
      </tbody>
    </table>
    <div class="field">
      <label for="open-date">Effective date</label>
      <button id="open-date" type="button" class="date-trigger">Select date</button>
      <input type="hidden" name="openDate" value="" />
    </div>
    <div class="field">
      <label for="adv-cash">Cash or bank</label>
      <button id="adv-cash" type="button" role="combobox" class="input" aria-haspopup="listbox" aria-expanded="false">1000 · Cash on Hand</button>
    </div>
  </main>
  <script>
    const trigger = document.getElementById('coa-root');
    const list = document.getElementById('class-list');
    const options = [...list.querySelectorAll('[role=option]')];
    let active = 0;
    function openList() {
      list.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      options[active].focus();
    }
    function closeList() {
      list.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    }
    function pick(i) {
      trigger.textContent = options[i].textContent;
      closeList();
    }
    trigger.addEventListener('click', () => (list.hidden ? openList() : closeList()));
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openList();
      }
    });
    list.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(options.length - 1, active + 1); options[active].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); options[active].focus(); }
      if (e.key === 'Enter') { e.preventDefault(); pick(active); }
      if (e.key === 'Escape') { e.preventDefault(); closeList(); }
    });
    options.forEach((opt, i) => opt.addEventListener('click', () => pick(i)));
  </script>
</body>
</html>`;

test('UI-02 Accounts forms use Back to Accounts and no native select', async ({ page }) => {
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('link', { name: /Back/ })).toHaveAttribute('href', '/accounts');
  await expect(page.locator('select')).toHaveCount(0);
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Chart of Accounts' })).toBeVisible();
});

test('UI-02 search is labelled and class combobox is keyboard operable', async ({ page }) => {
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  const search = page.getByLabel('Search');
  await search.fill('Office');
  await expect(search).toHaveValue('Office');
  const combo = page.getByRole('combobox', { name: 'Class' });
  await combo.focus();
  await page.keyboard.press('ArrowDown');
  await expect(combo).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(combo).toHaveText('Operating expense');
  await expect(combo).toHaveAttribute('aria-expanded', 'false');
});

test('UI-02 shows human-readable class labels and a blank date trigger', async ({ page }) => {
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('cell', { name: 'Operating expense' })).toBeVisible();
  await expect(page.getByText('operating_expense')).toHaveCount(0);
  await expect(page.locator('#open-date')).toHaveText('Select date');
  await expect(page.getByRole('combobox', { name: 'Cash or bank' })).toHaveText('1000 · Cash on Hand');
});
