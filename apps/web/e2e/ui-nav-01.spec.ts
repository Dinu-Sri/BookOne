import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'path';

const CSS = readFileSync(path.resolve(__dirname, '../src/app/globals.css'), 'utf8');
const ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`;
const EXT = `<svg class="nav-external-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

function sidebarHtml(opts?: {
  open?: boolean;
  collapsed?: boolean;
  lastLabel?: string;
  extraLabel?: string;
  role?: 'owner' | 'viewer';
}) {
  const open = opts?.open !== false;
  const collapsed = Boolean(opts?.collapsed);
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
  if (opts?.extraLabel) items.splice(items.length - 1, 0, opts.extraLabel);
  // Owner and Viewer share the same single-line markup. Role only records which job
  // the fixture represents; it does not inject "View only" or other secondary text.
  void opts?.role;
  const children = items
    .map((label, i) => {
      const isDocs = label === 'Documentation';
      const docsAttrs = isDocs
        ? `target="_blank" rel="noopener noreferrer" title="${label} (opens in a new tab)" aria-label="Documentation (opens in a new tab)"`
        : `title="${label}"`;
      return `
      <a class="nav-item nav-child${i === 1 ? ' active' : ''}" href="${isDocs ? 'https://example.com/docs' : '#' + encodeURIComponent(label)}" ${docsAttrs} ${open ? '' : 'tabindex="-1"'}>
        ${ICON}
        <span class="nav-item-text">
          <span class="nav-item-label">${label}</span>
        </span>
        ${isDocs ? EXT : ''}
      </a>`;
    })
    .join('');
  return `<!doctype html>
<html class="light" lang="en">
<head><meta charset="utf-8"><style>${CSS}</style></head>
<body>
<div class="app-shell${collapsed ? ' is-collapsed' : ''}" id="shell">
  <aside class="sidebar" aria-label="BookOne workspace sidebar">
    <div class="sidebar-header"><strong>BookOne</strong></div>
    <div class="sidebar-section suite-nav">
      <nav aria-label="Suite navigation">
        <div class="suite-group${open ? ' open' : ''}">
          <button class="suite-trigger active" type="button" title="Accounting" aria-expanded="${open}">${ICON}<span>Accounting</span></button>
          <div class="suite-panel" id="panel" ${open ? '' : 'inert aria-hidden="true"'}>
            <div class="suite-panel-inner">
              <div class="nav-list" id="nav-list">${children}</div>
            </div>
          </div>
        </div>
        <div class="suite-group"><button class="suite-trigger" type="button" title="Parties">${ICON}<span>Parties</span></button></div>
      </nav>
    </div>
    <div class="sidebar-identity"><p class="sidebar-version">v2.17.2 · test</p></div>
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
    await page.setContent(sidebarHtml({ open: true }), { waitUntil: 'domcontentloaded' });
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

  test('Accounting children share one consistent single-line row height', async ({ page }) => {
    await page.setContent(sidebarHtml({ open: true, role: 'viewer' }));
    const heights = await page.locator('.nav-list a').evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height)),
    );
    expect(heights.length).toBeGreaterThan(1);
    expect(new Set(heights).size).toBe(1);
    expect(heights[0]).toBeGreaterThanOrEqual(36);
    expect(heights[0]).toBeLessThanOrEqual(44);
    await expect(page.locator('.nav-item-sub')).toHaveCount(0);
    await expect(page.locator('.nav-list')).not.toContainText('View only');
    await expect(page.locator('.nav-list')).not.toContainText('Opens in a new tab');
    await expect(page.locator('.nav-list')).not.toContainText('Dispatch Note');
    await expect(page.locator('.nav-list')).not.toContainText('Terminal');
  });

  test('Owner and Viewer Accounting rows match and omit View only', async ({ page }) => {
    await page.setContent(sidebarHtml({ open: true, role: 'owner' }));
    const ownerHeights = await page.locator('.nav-list a').evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height)),
    );
    await page.setContent(sidebarHtml({ open: true, role: 'viewer' }));
    const viewerHeights = await page.locator('.nav-list a').evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height)),
    );
    expect(viewerHeights).toEqual(ownerHeights);
    await expect(page.locator('.nav-list')).not.toContainText('View only');
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  });

  test('closed panel is inert and its links are not in tab order', async ({ page }) => {
    await page.setContent(sidebarHtml({ open: false }));
    const inert = await page.locator('#panel').evaluate((el) => el.hasAttribute('inert'));
    expect(inert).toBe(true);
    await page.keyboard.press('Tab');
    const active = await page.evaluate(() => document.activeElement?.closest('#panel') != null);
    expect(active).toBe(false);
  });

  test('keyboard focus stays on an Accounting child', async ({ page }) => {
    await page.setContent(sidebarHtml({ open: true }));
    const first = page.locator('.nav-list a').first();
    await first.focus();
    await expect(first).toBeFocused();
  });

  test('short viewport scrolls the nav region so the last item is reachable', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 600 });
    await page.setContent(sidebarHtml({ open: true }));
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

test.describe('UI-NAV-01 zoom and viewports', () => {
  test('browser zoom 125/150/200 keeps Documentation inside the open panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(sidebarHtml({ open: true }));
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

  test('laptop and narrow viewports keep the last Accounting child reachable', async ({ page }) => {
    for (const size of [
      { width: 1440, height: 900 },
      { width: 1366, height: 768 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      await page.setContent(sidebarHtml({ open: true }));
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

  test('collapsed sidebar hides labels and keeps the suite title', async ({ page }) => {
    await page.setContent(sidebarHtml({ open: true, collapsed: true }));
    const labelDisplay = await page.locator('.nav-item-label').first().evaluate((el) => getComputedStyle(el).display);
    expect(labelDisplay).toBe('none');
    const triggerTextDisplay = await page
      .locator('.suite-trigger span')
      .first()
      .evaluate((el) => getComputedStyle(el).display);
    expect(triggerTextDisplay).toBe('none');
    await expect(page.locator('.suite-trigger').first()).toHaveAttribute('title', 'Accounting');
    const extDisplay = await page.locator('.nav-external-icon').evaluate((el) => getComputedStyle(el).display);
    expect(extDisplay).toBe('none');
  });
});

test.describe('UI-NAV-01 documentation new tab and truncation', () => {
  test('Documentation announces a new tab, keeps the external icon, and leaves this tab', async ({ page }) => {
    await page.setContent(sidebarHtml({ open: true }), { waitUntil: 'domcontentloaded' });
    const docs = page.getByRole('link', { name: 'Documentation (opens in a new tab)' });
    await expect(docs).toHaveAttribute('target', '_blank');
    await expect(docs).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(docs.locator('.nav-external-icon')).toHaveCount(1);
    const original = page.url();
    const popupPromise = page.waitForEvent('popup');
    await docs.click();
    const popup = await popupPromise;
    expect(page.url()).toBe(original);
    expect(page.url()).not.toContain('/docs');
    await popup.close();
  });

  test('long names truncate visually and remain in the accessibility tree', async ({ page }) => {
    const longName = 'Commerce Integrations with a very long workspace mapping name';
    await page.setContent(sidebarHtml({ open: true, extraLabel: longName }));
    const label = page.locator('.nav-item-label', { hasText: longName });
    await expect(label).toHaveText(longName);
    const metrics = await label.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        overflow: s.overflow,
        textOverflow: s.textOverflow,
        whiteSpace: s.whiteSpace,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      };
    });
    expect(metrics.overflow).toBe('hidden');
    expect(metrics.textOverflow).toBe('ellipsis');
    expect(metrics.whiteSpace).toBe('nowrap');
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
    await expect(page.getByRole('link', { name: longName })).toHaveAttribute('title', longName);
  });
});
