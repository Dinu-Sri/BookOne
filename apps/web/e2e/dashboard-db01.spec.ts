import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { dashboardDb01Html, dashboardDb02EmptyHtml, db01OverviewModel } from '../src/components/dashboard/dashboard-markup';

const afterDir = path.resolve(__dirname, '../../../docs/qa/db02');

const DESKTOP_FITS = [
  { width: 1280, height: 720, name: '1280x720' },
  { width: 1366, height: 768, name: '1366x768' },
  { width: 1440, height: 900, name: '1440x900' },
  { width: 1920, height: 1080, name: '1920x1080' },
] as const;

async function open(
  page: Page,
  opts?: { width?: number; height?: number; longLabel?: boolean; collapsed?: boolean; empty?: boolean },
) {
  await page.setViewportSize({ width: opts?.width ?? 1440, height: opts?.height ?? 900 });
  const html = opts?.empty
    ? dashboardDb02EmptyHtml()
    : dashboardDb01Html({ longLabel: opts?.longLabel, collapsedSidebar: opts?.collapsed });
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
}

async function layoutBounds(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const dash = document.getElementById('dashboard');
    const summary = document.querySelector('.dash-summary');
    const bodyStyle = getComputedStyle(body);
    const dashStyle = dash ? getComputedStyle(dash) : null;
    return {
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      docClientH: doc.clientHeight,
      docScrollH: doc.scrollHeight,
      docClientW: doc.clientWidth,
      docScrollW: doc.scrollWidth,
      bodyOverflowY: bodyStyle.overflowY,
      bodyOverflowX: bodyStyle.overflowX,
      dashOverflow: dashStyle?.overflow ?? '',
      dashOverflowY: dashStyle?.overflowY ?? '',
      dashBottom: dash?.getBoundingClientRect().bottom ?? 0,
      summaryBottom: summary?.getBoundingClientRect().bottom ?? 0,
    };
  });
}

function assertDesktopFit(bounds: Awaited<ReturnType<typeof layoutBounds>>) {
  expect(bounds.bodyOverflowY, JSON.stringify(bounds)).not.toBe('hidden');
  expect(bounds.dashOverflow, JSON.stringify(bounds)).not.toBe('hidden');
  expect(bounds.dashOverflowY, JSON.stringify(bounds)).not.toBe('hidden');
  expect(bounds.docScrollH, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.docClientH + 2);
  expect(bounds.docScrollW, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.docClientW + 2);
  expect(bounds.summaryBottom, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.innerH + 2);
  expect(bounds.dashBottom, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.innerH + 2);
}

test.describe('CoreGuard Dashboard DB-01 browser', () => {
  test('renders query-backed fixture totals at laptop width', async ({ page }) => {
    const { expected, snapshot, money } = db01OverviewModel();
    await open(page, { width: 1440, height: 900 });
    await expect(page.locator('#net-sales')).toHaveText(money(expected.netSales));
    await expect(page.locator('#operating-result')).toHaveText(money(expected.operatingResult));
    await expect(page.locator('#net-cash')).toHaveText(money(expected.netCashMovement));
    await expect(page.locator('#cash-bank')).toHaveText(money(expected.cashAndBank));
    await page.locator('[data-metric="DB01-CB"] summary').click();
    await expect(page.locator('#card-clearing')).toContainText(money(snapshot.cardClearing));
    await expect(page.locator('#dash-period')).toHaveText('Selected period');
    await expect(page.locator('#dash-position')).toHaveText('As of range end');
    await expect(page.locator('#receivables')).toHaveText(money(expected.receivables));
    await expect(page.locator('#payables')).toHaveText(money(expected.payables));
    await expect(page.locator('.dash-chart-summary')).toContainText(String(snapshot.externalCash.moneyIn));
    await expect(page.locator('.dash-chart-summary')).toContainText(String(snapshot.externalCash.moneyOut));
  });

  test('phone, wide desktop, 200% zoom, narrow height, and collapsed sidebar keep the same priority', async ({ page }) => {
    for (const viewport of [
      { width: 375, height: 720 },
      { width: 1440, height: 900 },
      { width: 3440, height: 1200 },
    ]) {
      await open(page, viewport);
      const groups = page.locator('.dash-group-title');
      await expect(groups.nth(0)).toHaveText('Selected period');
      await expect(groups.nth(1)).toHaveText('As of range end');
      const overflowX = await page.locator('#dashboard').evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
      expect(overflowX).toBeTruthy();
    }
    await open(page, { width: 1366, height: 600 });
    await expect(page.locator('#net-sales')).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => {
      document.body.style.zoom = '2';
    });
    await expect(page.locator('#company')).toBeVisible();
    const zoomed = await page.locator('#company').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    expect(zoomed).toBeTruthy();
    await open(page, { collapsed: true, longLabel: true, width: 1440 });
    const title = page.locator('#company');
    await expect(title).toContainText('Very Long Registered Name');
    const clip = await title.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    expect(clip).toBeTruthy();
  });

  test('keyboard reaches compare and refresh; View data opens the chart table dialog', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused === 'INPUT' || focused === 'BUTTON' || focused === 'A').toBeTruthy();
    await expect(page.locator('#sales-table')).toBeHidden();
    await page.locator('#sales-view-data').click();
    await expect(page.locator('#sales-table')).toBeVisible();
    await page.locator('#sales-close').click();
    await expect(page.locator('#sales-table')).toBeHidden();
    await page.locator('#cash-view-data').click();
    await expect(page.locator('#funding')).toContainText('internal transfers');
    await expect(page.locator('#cash-table')).toBeVisible();
    await page.locator('#cash-close').click();
    await expect(page.locator('#refresh')).toBeVisible();
  });

  test('cash series does not inflate the transfer day', async ({ page }) => {
    await open(page);
    const transferIn = await page.locator('[data-cash-in="2026-03-08"]').evaluate((el) => Number((el as SVGRectElement).getAttribute('height')));
    const transferOut = await page.locator('[data-cash-out="2026-03-08"]').evaluate((el) => Number((el as SVGRectElement).getAttribute('height')));
    expect(transferIn).toBe(0);
    expect(transferOut).toBe(0);
  });

  test('desktop viewports fit the default overview without clipping overflow', async ({ page }) => {
    for (const vp of DESKTOP_FITS) {
      await open(page, { width: vp.width, height: vp.height });
      const bounds = await layoutBounds(page);
      assertDesktopFit(bounds);
      await page.screenshot({ path: path.join(afterDir, `after-${vp.name}.png`) });
    }
    await open(page, { width: 1440, height: 900, longLabel: true });
    assertDesktopFit(await layoutBounds(page));
    await open(page, { width: 1280, height: 720, collapsed: true });
    assertDesktopFit(await layoutBounds(page));
  });

  test('empty period stays compact and still fits the desktop viewport', async ({ page }) => {
    await open(page, { width: 1366, height: 768, empty: true });
    await expect(page.locator('.dash-empty').first()).toHaveText('No activity in selected period.');
    await expect(page.locator('.dash-all-clear')).toHaveText('All clear — no flagged items.');
    assertDesktopFit(await layoutBounds(page));
    await page.screenshot({ path: path.join(afterDir, 'after-empty-1366x768.png') });
  });

  test('mobile and 200% zoom reflow instead of clipping', async ({ page }) => {
    await open(page, { width: 375, height: 720 });
    await expect(page.locator('#net-sales')).toBeVisible();
    await expect(page.locator('.dash-title')).toHaveText('Dashboard');
    const mobile = await layoutBounds(page);
    expect(mobile.bodyOverflowY).not.toBe('hidden');
    expect(mobile.dashOverflowY).not.toBe('hidden');
    await page.screenshot({ path: path.join(afterDir, 'after-375x720.png') });
    await open(page, { width: 1440, height: 900 });
    await page.evaluate(() => {
      document.body.style.zoom = '2';
    });
    await expect(page.locator('#company')).toBeVisible();
    const zoomed = await layoutBounds(page);
    expect(zoomed.bodyOverflowY).not.toBe('hidden');
    expect(zoomed.dashOverflowY).not.toBe('hidden');
  });
});
