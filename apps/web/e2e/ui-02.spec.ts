import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { LAYOUT_ROUTES, layoutHtml, type LayoutRoute } from './ui-02-layout-fixture';

const css = readFileSync(path.resolve(__dirname, '../src/app/globals.css'), 'utf8');
const shotDir = path.resolve(__dirname, '../../../docs/qa/ui02-layout');

const VIEWPORTS = [
  { width: 1920, height: 1080, name: '1920x1080' },
  { width: 1366, height: 768, name: '1366x768' },
  { width: 768, height: 1024, name: '768x1024' },
  { width: 390, height: 844, name: '390x844' },
] as const;

async function openLayout(
  page: Page,
  route: LayoutRoute,
  opts?: { variant?: 'before' | 'after'; width?: number; height?: number; sidebar?: 'expanded' | 'collapsed' },
) {
  await page.setViewportSize({ width: opts?.width ?? 1366, height: opts?.height ?? 768 });
  await page.setContent(
    layoutHtml({
      css,
      route,
      variant: opts?.variant ?? 'after',
      sidebar: opts?.sidebar ?? 'expanded',
    }),
    { waitUntil: 'domcontentloaded' },
  );
}

function within2(a: number, b: number) {
  expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(2);
}

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

test('UI-02 desktop filters share a control baseline and Balance is end-aligned', async ({ page }) => {
  await openLayout(page, 'accounts', { width: 1920, height: 1080 });
  const search = await page.locator('#coa-search').boundingBox();
  const klass = await page.locator('#coa-root').boundingBox();
  const status = await page.locator('#coa-status').boundingBox();
  expect(search && klass && status).toBeTruthy();
  within2(search!.y + search!.height, klass!.y + klass!.height);
  within2(klass!.y + klass!.height, status!.y + status!.height);
  const balanceHead = await page.locator('.th-num').first().boundingBox();
  const balanceCell = await page.locator('.td-num').first().boundingBox();
  expect(balanceHead && balanceCell).toBeTruthy();
  expect(balanceHead!.x + balanceHead!.width).toBeGreaterThan(balanceHead!.x + 40);
  within2(balanceHead!.x + balanceHead!.width, balanceCell!.x + balanceCell!.width);
});

test('UI-02 date label and trigger share a leading edge', async ({ page }) => {
  await openLayout(page, 'opening', { width: 1366, height: 768 });
  const label = await page.locator('label[for="open-date"]').boundingBox();
  const trigger = await page.locator('#open-date').boundingBox();
  expect(label && trigger).toBeTruthy();
  within2(label!.x, trigger!.x);
  await openLayout(page, 'advances', { width: 1366, height: 768 });
  const amount = await page.locator('#adv-amount').boundingBox();
  const date = await page.locator('#adv-date').boundingBox();
  expect(amount && date).toBeTruthy();
  within2(amount!.y, date!.y);
});

test('UI-02 opening header tracks match row tracks', async ({ page }) => {
  await openLayout(page, 'opening', { width: 1366, height: 768 });
  const head = page.locator('.opening-line-head > *');
  const row = page.locator('.opening-line-grid').first().locator(':scope > *');
  await expect(head).toHaveCount(4);
  await expect(row).toHaveCount(4);
  for (let i = 0; i < 4; i += 1) {
    const h = await head.nth(i).boundingBox();
    const r = await row.nth(i).boundingBox();
    expect(h && r).toBeTruthy();
    within2(h!.x, r!.x);
    within2(h!.width, r!.width);
  }
});

test('UI-02 narrow and zoomed layouts keep controls reachable', async ({ page }) => {
  await openLayout(page, 'new', { width: 390, height: 844, sidebar: 'collapsed' });
  await expect(page.getByRole('link', { name: /Back/ })).toBeVisible();
  await expect(page.locator('#coa-code')).toBeVisible();
  await expect(page.locator('#coa-suggest')).toBeVisible();
  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollW).toBeLessThanOrEqual(overflow.clientW + 2);
  await openLayout(page, 'accounts', { width: 390, height: 844, sidebar: 'collapsed' });
  await expect(page.locator('#coa-search')).toBeVisible();
  await expect(page.getByRole('link', { name: 'New account' })).toBeVisible();
  const wrap = page.locator('.table-wrap').first();
  await expect(wrap).toBeVisible();
  await openLayout(page, 'opening', { width: 1366, height: 768 });
  await page.evaluate(() => {
    document.body.style.zoom = '2';
  });
  await expect(page.locator('#open-date')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add line' })).toBeVisible();
});

test('UI-02 layout screenshots before and after required widths', async ({ page }) => {
  test.setTimeout(120_000);
  for (const route of LAYOUT_ROUTES) {
    await openLayout(page, route, { variant: 'before', width: 1366, height: 768 });
    await page.screenshot({ path: path.join(shotDir, `before-${route}-1366x768.png`), fullPage: true });
    for (const vp of VIEWPORTS) {
      await openLayout(page, route, {
        width: vp.width,
        height: vp.height,
        sidebar: vp.width <= 768 ? 'collapsed' : 'expanded',
      });
      await page.screenshot({ path: path.join(shotDir, `after-${route}-${vp.name}.png`), fullPage: true });
    }
  }
  await openLayout(page, 'accounts', { width: 1366, height: 768, sidebar: 'collapsed' });
  await page.screenshot({ path: path.join(shotDir, 'after-accounts-1366-collapsed.png'), fullPage: true });
  await openLayout(page, 'opening', { width: 1366, height: 768 });
  await page.evaluate(() => {
    document.body.style.zoom = '2';
  });
  await page.screenshot({ path: path.join(shotDir, 'after-opening-zoom200.png'), fullPage: true });
});
