import { test, expect } from '../src/fixtures';

test.describe('Public surfaces @docs @public @e2e', () => {
  test('S-docs home without login', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/docs');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).toContainText(/BookOne|documentation|Docs/i);
    await ctx.close();
  });

  test('docs section pages load', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    for (const path of [
      '/docs/getting-started',
      '/docs/sales',
      '/docs/purchase',
      '/docs/inventory',
      '/docs/accounting',
      '/docs/pos',
    ]) {
      await page.goto(path);
      await expect(page).not.toHaveURL(/\/login/);
    }
    await ctx.close();
  });

  test('docs search API public', async ({ request }) => {
    const res = await request.get('/api/search?q=invoice');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body) || typeof body === 'object').toBeTruthy();
  });

  test('docs exclude control-room content', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/docs');
    const text = await page.locator('body').innerText();
    expect(text.toLowerCase()).not.toMatch(/master wipe|control room.*health check/i);
    await ctx.close();
  });

  test('S-e2e console public at /e2e', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/e2e');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: /E2E/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Start E2E/i })).toBeVisible();
    await ctx.close();
  });
});
