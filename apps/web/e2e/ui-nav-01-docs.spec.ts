import { expect, test } from '@playwright/test';

const BASE = process.env.UI_NAV_BASE_URL;

test.describe('UI-NAV-01 docs history isolation', () => {
  test.skip(!BASE, 'Set UI_NAV_BASE_URL to a running BookOne origin to exercise Next history.');

  test('public docs stay responsive across child page links and history', async ({ page }) => {
    await page.goto(`${BASE}/docs`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#bookone-docs')).toBeVisible();
    await page.locator('#nd-page').getByRole('link', { name: 'Developers & Integrations', exact: true }).click();
    await expect(page).toHaveURL(/\/docs\/developers$/);
    await page.locator('#nd-page').getByRole('link', { name: 'Custom Website API', exact: true }).click();
    await expect(page).toHaveURL(/\/docs\/developers\/custom-website$/);
    // A URL/title update alone can happen before the renderer becomes unresponsive.
    await expect(page.locator('#nd-page').getByRole('heading', { name: 'Custom Website API', exact: true }).first()).toBeVisible();
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/docs\/developers$/);
    await expect(page.locator('#nd-page').getByRole('link', { name: 'WooCommerce', exact: true })).toBeVisible();
  });

  test('same-tab docs then Back restores login layout tokens', async ({ page }) => {
    test.skip(!BASE);
    const origin = BASE as string;
    await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
    const before = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const html = document.documentElement;
      return {
        font: body.fontFamily,
        bg: body.backgroundColor,
        htmlClass: html.className,
        hasDocsRoot: Boolean(document.getElementById('bookone-docs')),
      };
    });
    expect(before.hasDocsRoot).toBe(false);
    expect(before.htmlClass).toContain('light');

    await page.goto(`${origin}/docs`, { waitUntil: 'networkidle' });
    await expect(page.locator('#bookone-docs')).toBeVisible();
    await page.goBack({ waitUntil: 'networkidle' });
    await page.goForward({ waitUntil: 'networkidle' });
    await expect(page.locator('#bookone-docs')).toBeVisible();
    await page.goBack({ waitUntil: 'networkidle' });

    const after = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const html = document.documentElement;
      return {
        font: body.fontFamily,
        bg: body.backgroundColor,
        htmlClass: html.className,
        hasDocsRoot: Boolean(document.getElementById('bookone-docs')),
        colorScheme: html.style.colorScheme,
      };
    });
    expect(after.hasDocsRoot).toBe(false);
    expect(after.htmlClass).toContain('light');
    expect(after.htmlClass.includes('dark')).toBe(false);
    expect(after.font).toBe(before.font);
    expect(after.bg).toBe(before.bg);
  });
});
