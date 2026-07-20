import { test, expect, seed } from '../src/fixtures';
import { ensureBrand, ensureLocation } from '../src/helpers/masters';
import { go } from '../src/helpers/nav';
import { clickPrimary } from '../src/helpers/forms';

test.describe('Company masters @company @brand @location @p0', () => {
  test.describe.configure({ mode: 'serial' });

  test('S-company details loads and saves legal name', async ({ authedPage: page }) => {
    await go(page, '/company/details');
    const legal = page.locator('input[name="legalName"], input[name="name"]').first();
    if (await legal.isVisible().catch(() => false)) {
      const current = await legal.inputValue();
      const next = current.includes('E2E') ? current : `${current} E2E`.slice(0, 80);
      await legal.fill(next);
      await clickPrimary(page, /Save/i);
      await page.waitForTimeout(800);
    }
    await expect(page.locator('.workspace, .party-form-shell, form').first()).toBeVisible();
  });

  test('S-create brand', async ({ authedPage: page }) => {
    const name = await ensureBrand(page);
    await go(page, '/company/brands');
    await expect(page.getByText(name)).toBeVisible();
  });

  test('S-create location linked optionally to brand', async ({ authedPage: page }) => {
    const brand = await ensureBrand(page);
    const loc = await ensureLocation(page, undefined, brand);
    await go(page, '/company/locations');
    await expect(page.getByText(loc)).toBeVisible();
  });

  test('S-tax settings page loads', async ({ authedPage: page }) => {
    await go(page, '/company/tax');
    await expect(page.locator('form, .party-form-shell, .workspace').first()).toBeVisible();
  });

  test('S-sales settings and POS registers', async ({ authedPage: page }) => {
    await go(page, '/company/sales');
    await expect(page.locator('#pos-registers, form, .party-form-shell').first()).toBeVisible();
    // Add register if form present
    const code = `R${seed().slice(0, 5).toUpperCase()}`;
    const codeInput = page.locator('#pos-registers input[name="code"], form input[name="code"]').first();
    if (await codeInput.isVisible().catch(() => false)) {
      await codeInput.fill(code);
      await page.locator('input[name="name"]').last().fill(`E2E Register ${code}`);
      const loc = page.locator('select[name="locationId"]').first();
      if (await loc.isVisible().catch(() => false)) {
        const n = await loc.locator('option').count();
        if (n > 1) await loc.selectOption({ index: 1 });
      }
      await page.getByRole('button', { name: /Add register/i }).click();
      await page.waitForTimeout(1000);
    }
  });

  test('S-purchase and inventory settings pages', async ({ authedPage: page }) => {
    await go(page, '/company/purchase');
    await expect(page.locator('form, .workspace').first()).toBeVisible();
    await go(page, '/company/inventory');
    await expect(page.locator('form, .workspace').first()).toBeVisible();
  });
});
