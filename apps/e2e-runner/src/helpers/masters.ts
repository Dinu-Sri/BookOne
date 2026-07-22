import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { seed } from './env';
import { fillByLabel, clickPrimary, tableHasText } from './forms';
import { go } from './nav';

export async function ensureBrand(page: Page, name?: string) {
  const brandName = name || `E2E Brand ${seed()}`;
  await go(page, '/company/brands');
  const createForm = page.locator('form.company-inline-form.is-create').first();
  await createForm.locator('input[name="name"]').fill(brandName);
  await createForm.locator('input[name="code"]').fill(`B${seed().slice(0, 6).toUpperCase()}`);
  await createForm.getByRole('button', { name: /Add brand/i }).click();

  // Success toast/message or list row (server action may refresh list).
  const success = createForm.locator('.entry-result.success, .form-error');
  await expect(success.or(page.getByText(brandName).first())).toBeVisible({ timeout: 20_000 });
  const err = createForm.locator('.form-error');
  if (await err.isVisible().catch(() => false)) {
    const msg = (await err.textContent())?.trim() || 'Brand save failed';
    throw new Error(msg);
  }

  // List is server-rendered; reload if the new name is not painted yet.
  if (!(await page.getByText(brandName).first().isVisible().catch(() => false))) {
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await expect(page.getByText(brandName).first()).toBeVisible({ timeout: 20_000 });
  return brandName;
}

export async function ensureLocation(page: Page, name?: string, brandLabel?: string) {
  const locName = name || `E2E Loc ${seed()}`;
  await go(page, '/company/locations');
  const createForm = page.locator('form.company-inline-form.is-create').first();
  await createForm.locator('input[name="name"]').fill(locName);
  await createForm.locator('input[name="code"]').fill(`L${seed().slice(0, 6).toUpperCase()}`);
  if (brandLabel) {
    const brandSelect = createForm.locator('select[name="brandId"]');
    if (await brandSelect.isVisible().catch(() => false)) {
      await brandSelect.selectOption({ label: new RegExp(brandLabel) }).catch(async () => {
        const opts = brandSelect.locator('option');
        const c = await opts.count();
        for (let i = 1; i < c; i++) {
          await brandSelect.selectOption({ index: i });
          break;
        }
      });
    }
  }
  await createForm.getByRole('button', { name: /Add location/i }).click();
  const success = createForm.locator('.entry-result.success, .form-error');
  await expect(success.or(page.getByText(locName).first())).toBeVisible({ timeout: 20_000 });
  const err = createForm.locator('.form-error');
  if (await err.isVisible().catch(() => false)) {
    const msg = (await err.textContent())?.trim() || 'Location save failed';
    throw new Error(msg);
  }
  if (!(await page.getByText(locName).first().isVisible().catch(() => false))) {
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await expect(page.getByText(locName).first()).toBeVisible({ timeout: 20_000 });
  return locName;
}

export async function createCustomer(page: Page, name?: string) {
  const partyName = name || `E2E Customer ${seed()}`;
  await go(page, '/parties/customers/new');
  await page.locator('input[name="name"]').fill(partyName);
  await clickPrimary(page, /Save|Create|Add/i);
  await page.waitForURL(/\/parties\/customers/, { timeout: 30_000 }).catch(() => undefined);
  await go(page, '/parties/customers');
  await expect(tableHasText(page, partyName).first()).toBeVisible({ timeout: 25_000 });
  return partyName;
}

export async function createVendor(page: Page, name?: string) {
  const partyName = name || `E2E Vendor ${seed()}`;
  await go(page, '/parties/vendors/new');
  await page.locator('input[name="name"]').fill(partyName);
  await clickPrimary(page, /Save|Create|Add/i);
  await page.waitForURL(/\/parties\/vendors/, { timeout: 30_000 }).catch(() => undefined);
  await go(page, '/parties/vendors');
  await expect(tableHasText(page, partyName).first()).toBeVisible({ timeout: 25_000 });
  return partyName;
}

export async function createProduct(
  page: Page,
  opts: {
    type?: 'physical' | 'digital' | 'service';
    name?: string;
    sku?: string;
    unitCost?: string;
    sellPrice?: string;
    openingQty?: string;
  } = {},
) {
  const s = seed();
  const type = opts.type ?? 'physical';
  const name = opts.name || `E2E ${type} ${s}`;
  const sku = opts.sku || `E2E-${s}`.toUpperCase().slice(0, 20);
  await go(page, '/inventory/products/new');
  await page.locator('select[name="productType"]').selectOption(type);
  await page.locator('input[name="sku"]').fill(sku);
  await page.locator('input[name="name"]').fill(name);
  // Pricing tab
  await page.getByRole('tab', { name: /Pricing/i }).click();
  await page.locator('input[name="unitCost"]').fill(opts.unitCost ?? '100');
  await page.locator('input[name="sellPrice"]').fill(opts.sellPrice ?? '250');
  if (type === 'physical' && opts.openingQty) {
    await page.getByRole('tab', { name: /Stock/i }).click();
    await page.locator('input[name="openingQty"]').fill(opts.openingQty);
  }
  await clickPrimary(page, /Save product/i);
  await page.waitForURL(/\/inventory\/products/, { timeout: 45_000 }).catch(() => undefined);
  await go(page, '/inventory/products');
  // search
  const search = page.locator('input.party-search, input[placeholder*="Search"]').first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill(sku);
    await page.waitForTimeout(400);
  }
  await expect(page.getByText(sku).or(page.getByText(name)).first()).toBeVisible({ timeout: 25_000 });
  return { name, sku, type };
}
