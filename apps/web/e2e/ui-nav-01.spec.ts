import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'path';

const CSS = readFileSync(path.resolve(__dirname, '../src/app/globals.css'), 'utf8');

function sidebarHtml(opts?: { open?: boolean; viewOnly?: boolean; lastLabel?: string }) {
  const open = opts?.open !== false;
  const viewOnly = opts?.viewOnly !== false;
  const last = opts?.lastLabel ?? 'Documentation';
  const items = [
    'Simple Entry',
    'Dashboard',
    'Transactions',
    'Journal',
    'Activity',
    'Reports',
    'Accounts',
    'Reconciliation',
    last,
  ];
  const children = items
    .map(
      (label, i) => `
      <a class="nav-item nav-child${i === 1 ? ' active' : ''}" href="#${label}" ${open ? '' : 'tabindex="-1"'}>
        <span class="nav-item-text">
          <span class="nav-item-label">${label}</span>
          ${viewOnly ? '<span class="nav-item-sub">View only</span>' : ''}
        </span>
      </a>`,
    )
    .join('');
  return `<!doctype html>
<html class="light" lang="en">
<head><meta charset="utf-8"><style>${CSS}</style></head>
<body>
<div class="app-shell" data-nav-mode="list" id="shell">
  <aside class="sidebar" aria-label="BookOne workspace sidebar">
    <div class="sidebar-header"><strong>BookOne</strong></div>
    <div class="nav-mode-toggle" role="group" aria-label="Sidebar layout">
      <button type="button" class="is-selected" aria-pressed="true">List</button>
      <button type="button" id="tiles-btn" aria-pressed="false">Tiles</button>
    </div>
    <div class="sidebar-section suite-nav">
      <nav aria-label="Suite navigation">
        <div class="suite-group${open ? ' open' : ''}">
          <button class="suite-trigger active" type="button" aria-expanded="${open}">ACCOUNTING</button>
          <div class="suite-panel" id="panel" ${open ? '' : 'inert aria-hidden="true"'}>
            <div class="suite-panel-inner">
              <div class="nav-list" id="nav-list">${children}</div>
            </div>
          </div>
        </div>
        <div class="suite-group"><button class="suite-trigger" type="button">PARTIES</button></div>
      </nav>
    </div>
    <div class="sidebar-identity"><p class="sidebar-version">v2.6.0 · test</p></div>
  </aside>
  <main class="main"><p id="page">Dashboard</p></main>
</div>
</body></html>`;
}

async function geometry(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height, width: r.width };
  });
}

test.describe('UI-NAV-01 sidebar geometry', () => {
  test('open Accounting panel shows the last child fully inside the panel', async ({ page }) => {
    await page.setContent(sidebarHtml({ open: true, viewOnly: true }), { waitUntil: 'domcontentloaded' });
    const panel = await geometry(page, '#panel');
    const last = await geometry(page, '.nav-list a:last-child');
    const lastLabel = page.locator('.nav-list a:last-child .nav-item-label');
    await expect(lastLabel).toHaveText('Documentation');
    expect(last.height).toBeGreaterThan(20);
    expect(last.bottom).toBeLessThanOrEqual(panel.bottom + 1);
    expect(last.top).toBeGreaterThanOrEqual(panel.top - 1);
    const clip = await page.locator('#panel').evaluate((el) => getComputedStyle(el).overflow);
    expect(clip === 'hidden' || clip === 'auto' || clip === 'clip').toBeTruthy();
  });

  test('legacy estimate would clip View-only rows of the same list', async ({ page }) => {
    await page.setContent(sidebarHtml({ open: true, viewOnly: true }));
    const measured = await page.locator('#panel').evaluate((el) => el.scrollHeight);
    const count = await page.locator('.nav-list a').count();
    const estimate = count * 40 + 12;
    expect(measured).toBeGreaterThan(estimate);
  });

  test('closed panel is inert and its links are not in tab order', async ({ page }) => {
    await page.setContent(sidebarHtml({ open: false }));
    const inert = await page.locator('#panel').evaluate((el) => el.hasAttribute('inert'));
    expect(inert).toBe(true);
    await page.keyboard.press('Tab');
    const active = await page.evaluate(() => document.activeElement?.closest('#panel') != null);
    expect(active).toBe(false);
  });

  test('short viewport scrolls the nav region so the last item is reachable', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 600 });
    await page.setContent(sidebarHtml({ open: true, viewOnly: true }));
    const nav = page.locator('.suite-nav');
    await nav.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const last = page.locator('.nav-list a:last-child');
    await expect(last).toBeVisible();
    const vis = await last.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const navBox = el.closest('.suite-nav')!.getBoundingClientRect();
      return r.bottom <= navBox.bottom + 2 && r.top >= navBox.top - 2;
    });
    expect(vis).toBe(true);
  });
});

test.describe('UI-NAV-01 tiles layout', () => {
  test('browser zoom 125/150/200 keeps Documentation inside the open panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(sidebarHtml({ open: true, viewOnly: true }));
    for (const zoom of [1.25, 1.5, 2]) {
      await page.evaluate((z) => {
        document.body.style.zoom = String(z);
      }, zoom);
      const panel = await geometry(page, '#panel');
      const last = await geometry(page, '.nav-list a:last-child');
      expect(last.height).toBeGreaterThan(10);
      expect(last.bottom).toBeLessThanOrEqual(panel.bottom + 2);
    }
  });

  test('tablet and narrow viewports keep the last Accounting child reachable', async ({ page }) => {
    for (const size of [
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      await page.setContent(sidebarHtml({ open: true, viewOnly: true }));
      await page.locator('.suite-nav').evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      const last = page.locator('.nav-list a:last-child');
      await expect(last).toHaveText(/Documentation/);
      const box = await last.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.height).toBeGreaterThan(16);
    }
  });

  test('two-column tiles on desktop and one column when collapsed', async ({ page }) => {
    const html = `<!doctype html><html><head><style>${CSS}</style></head><body>
      <div class="app-shell" data-nav-mode="tiles" id="shell">
        <aside class="sidebar">
          <div class="nav-tile-grid" id="grid">
            <button class="nav-tile" type="button"><span class="nav-tile-label">Accounting</span></button>
            <button class="nav-tile" type="button"><span class="nav-tile-label">Parties</span></button>
            <button class="nav-tile" type="button"><span class="nav-tile-label">Sales</span></button>
            <button class="nav-tile" type="button"><span class="nav-tile-label">Purchase</span></button>
          </div>
        </aside>
        <main class="main"></main>
      </div></body></html>`;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(html);
    const cols = await page.locator('#grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(cols).toBe(2);
    await page.locator('#shell').evaluate((el) => el.classList.add('is-collapsed'));
    const collapsedCols = await page
      .locator('#grid')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(collapsedCols).toBe(1);
  });
});
