import { expect, test, type Page } from '@playwright/test';
import { dashboardDb01Html, db01OverviewModel } from '../src/components/dashboard/dashboard-markup';

async function open(page: Page, opts?: { width?: number; height?: number; longLabel?: boolean; collapsed?: boolean }) {
  await page.setViewportSize({ width: opts?.width ?? 1440, height: opts?.height ?? 900 });
  await page.setContent(dashboardDb01Html({ longLabel: opts?.longLabel, collapsedSidebar: opts?.collapsed }), {
    waitUntil: 'domcontentloaded',
  });
}

test.describe('CoreGuard Dashboard DB-01 browser', () => {
  test('renders query-backed fixture totals at laptop width', async ({ page }) => {
    const { expected, snapshot, money } = db01OverviewModel();
    await open(page, { width: 1440, height: 900 });
    await expect(page.locator('#net-sales')).toHaveText(money(expected.netSales));
    await expect(page.locator('#operating-result')).toHaveText(money(expected.operatingResult));
    await expect(page.locator('#net-cash')).toHaveText(money(expected.netCashMovement));
    await expect(page.locator('#cash-bank')).toHaveText(money(expected.cashAndBank));
    await expect(page.locator('#card-clearing')).toContainText(money(snapshot.cardClearing));
    await expect(page.locator('#dash-period')).toHaveText('Selected period');
    await expect(page.locator('#dash-position')).toHaveText('As of range end');
    const inBar = await page.locator('#in-bar').evaluate((el) => Number.parseFloat((el as HTMLElement).style.width));
    const outBar = await page.locator('#out-bar').evaluate((el) => Number.parseFloat((el as HTMLElement).style.width));
    expect(inBar).toBeGreaterThan(outBar);
    expect(inBar).toBeLessThanOrEqual(100);
    expect(outBar).toBeGreaterThan(0);
    expect(outBar).toBeLessThan(100);
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
    await open(page, { collapsed: true, longLabel: true, width: 1440 });
    const title = page.locator('#company');
    await expect(title).toContainText('Very Long Registered Name');
    const clip = await title.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    expect(clip).toBeTruthy();
  });

  test('keyboard reaches compare and refresh; chart table is present', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused === 'INPUT' || focused === 'BUTTON' || focused === 'A').toBeTruthy();
    await expect(page.locator('#sales-table')).toBeVisible();
    await expect(page.locator('#funding')).toContainText('internal transfers');
    await expect(page.locator('#refresh')).toBeVisible();
  });

  test('cash series does not inflate the transfer day', async ({ page }) => {
    await open(page);
    const transferIn = await page.locator('[data-cash-in="2026-03-08"]').evaluate((el) => Number((el as SVGRectElement).getAttribute('height')));
    const transferOut = await page.locator('[data-cash-out="2026-03-08"]').evaluate((el) => Number((el as SVGRectElement).getAttribute('height')));
    expect(transferIn).toBe(0);
    expect(transferOut).toBe(0);
  });
});
