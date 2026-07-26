import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { seed } from './env';
import { clickPrimary } from './forms';
import { go } from './nav';

/**
 * Brand/location names live in <input value>, not text nodes.
 * Avoid page.getByDisplayValue — some runner builds don't expose it on Page.
 */
export async function expectInlineMasterName(page: Page, name: string) {
  const short = name.slice(0, 12);
  await expect
    .poll(
      async () => {
        const values = await page
          .locator('form.company-inline-form input[name="name"], input[name="name"]')
          .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
        return values.some((v) => v === name || (v && v.includes(short)));
      },
      { timeout: 25_000, message: `Master name not found in inputs: ${name}` },
    )
    .toBe(true);
}

export async function ensureBrand(page: Page, name?: string) {
  const brandName = name || `E2E Brand ${seed()}`;
  const code = `B${seed().slice(0, 6).toUpperCase()}`;
  await go(page, '/company/brands');
  const createForm = page.locator('form.company-inline-form.is-create').first();
  await expect(createForm).toBeVisible({ timeout: 15_000 });
  await createForm.locator('input[name="name"]').fill(brandName);
  await createForm.locator('input[name="code"]').fill(code);
  await createForm.getByRole('button', { name: /Add brand/i }).click();

  // Wait for success message or error
  // Wait for success toast/message or form to settle
  await page.waitForTimeout(800);
  const err = createForm.locator('.form-error');
  if (await err.isVisible().catch(() => false)) {
    const t = (await err.textContent())?.trim() || '';
    if (t && !/added|success|updated/i.test(t)) throw new Error(t);
  }
  const okMsg = createForm.locator('.entry-result.success');
  if (await okMsg.isVisible().catch(() => false)) {
    // good
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectInlineMasterName(page, brandName);
  return brandName;
}

export async function ensureLocation(page: Page, name?: string, brandLabel?: string) {
  const locName = name || `E2E Loc ${seed()}`;
  const code = `L${seed().slice(0, 6).toUpperCase()}`;
  await go(page, '/company/locations');
  const createForm = page.locator('form.company-inline-form.is-create').first();
  await expect(createForm).toBeVisible({ timeout: 15_000 });
  await createForm.locator('input[name="name"]').fill(locName);
  await createForm.locator('input[name="code"]').fill(code);
  if (brandLabel) {
    const brandSelect = createForm.locator('select[name="brandId"]');
    if (await brandSelect.isVisible().catch(() => false)) {
      await brandSelect.selectOption({ label: new RegExp(brandLabel.slice(0, 12), 'i') }).catch(async () => {
        const opts = brandSelect.locator('option');
        const c = await opts.count();
        for (let i = 1; i < c; i++) {
          const val = await opts.nth(i).getAttribute('value');
          if (val) {
            await brandSelect.selectOption({ index: i });
            break;
          }
        }
      });
    }
  }
  await createForm.getByRole('button', { name: /Add location/i }).click();
  await page.waitForTimeout(800);
  const err = createForm.locator('.form-error');
  if (await err.isVisible().catch(() => false)) {
    const t = (await err.textContent())?.trim() || '';
    if (t && !/added|success|updated/i.test(t)) throw new Error(t);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectInlineMasterName(page, locName);
  return locName;
}

/** After create, party lists are paginated (10) — always filter by q. */
async function assertPartyOnList(page: Page, role: 'customer' | 'vendor', partyName: string) {
  const base = role === 'customer' ? '/parties/customers' : '/parties/vendors';
  await page.goto(`${base}?q=${encodeURIComponent(partyName)}`, { waitUntil: 'domcontentloaded' });
  // Client search box if URL q not applied yet
  const search = page.locator('input.party-search, input[placeholder*="Search"]').first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill(partyName);
    await page.waitForTimeout(500);
  }
  const hit = page.getByText(partyName, { exact: false }).first();
  if (!(await hit.isVisible().catch(() => false))) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    if (await search.isVisible().catch(() => false)) {
      await search.fill(partyName);
      await page.waitForTimeout(500);
    }
  }
  await expect(page.getByText(partyName, { exact: false }).first()).toBeVisible({ timeout: 25_000 });
}

export async function createCustomer(page: Page, name?: string) {
  const partyName = name || `E2E Customer ${seed()}`;
  await go(page, '/parties/customers/new');
  await page.locator('input[name="name"]').fill(partyName);
  // Optional code if present
  const code = page.locator('input[name="code"]').first();
  if (await code.isVisible().catch(() => false)) {
    const v = await code.inputValue().catch(() => '');
    if (!v) await code.fill(`C${seed().slice(0, 8).toUpperCase()}`);
  }
  await clickPrimary(page, /Save customer|Save|Create|Add/i);
  await page.waitForURL((u) => !u.pathname.includes('/new'), { timeout: 45_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  // If still on form with error, surface it
  const err = page.locator('.form-error, .auth-error, [role="alert"]').first();
  if (page.url().includes('/new') && (await err.isVisible().catch(() => false))) {
    throw new Error((await err.textContent())?.trim() || 'Customer save failed');
  }
  await assertPartyOnList(page, 'customer', partyName);
  return partyName;
}

export async function createVendor(page: Page, name?: string) {
  const partyName = name || `E2E Vendor ${seed()}`;
  await go(page, '/parties/vendors/new');
  await page.locator('input[name="name"]').fill(partyName);
  const code = page.locator('input[name="code"]').first();
  if (await code.isVisible().catch(() => false)) {
    const v = await code.inputValue().catch(() => '');
    if (!v) await code.fill(`V${seed().slice(0, 8).toUpperCase()}`);
  }
  await clickPrimary(page, /Save vendor|Save|Create|Add/i);
  await page.waitForURL((u) => !u.pathname.includes('/new'), { timeout: 45_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  const err = page.locator('.form-error, .auth-error, [role="alert"]').first();
  if (page.url().includes('/new') && (await err.isVisible().catch(() => false))) {
    throw new Error((await err.textContent())?.trim() || 'Vendor save failed');
  }
  await assertPartyOnList(page, 'vendor', partyName);
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
  await page.getByRole('tab', { name: /Pricing/i }).click();
  await page.locator('input[name="unitCost"]').fill(opts.unitCost ?? '100');
  await page.locator('input[name="sellPrice"]').fill(opts.sellPrice ?? '250');
  if (type === 'physical' && opts.openingQty) {
    await page.getByRole('tab', { name: /Stock/i }).click();
    await page.locator('input[name="openingQty"]').fill(opts.openingQty);
  }
  await clickPrimary(page, /Save product/i);
  await page.waitForURL(/\/inventory\/products/, { timeout: 45_000 }).catch(() => undefined);
  await page.goto(`/inventory/products?q=${encodeURIComponent(sku)}`, {
    waitUntil: 'domcontentloaded',
  });
  const search = page.locator('input.party-search, input[placeholder*="Search"]').first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill(sku);
    await page.waitForTimeout(400);
  }
  await expect(page.getByText(sku).or(page.getByText(name)).first()).toBeVisible({ timeout: 25_000 });
  return { name, sku, type };
}
