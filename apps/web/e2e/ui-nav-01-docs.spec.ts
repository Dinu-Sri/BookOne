import { expect, test } from '@playwright/test';

const BASE = process.env.UI_NAV_BASE_URL;

test.describe('UI-NAV-01 docs history isolation', () => {
  test.skip(!BASE, 'Set UI_NAV_BASE_URL to a running BookOne origin to exercise Next history.');

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
