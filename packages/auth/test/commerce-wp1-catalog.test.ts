import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  catalogColumns,
  catalogValuesFromForm,
  parseAttributeValues,
  parseProductOptions,
  parseVariantOptions,
} from '../../../apps/web/src/lib/product-catalog-fields';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe('WP1 product form: Online store fields', () => {
  it('ignores forms without the Online store section (other callers keep working)', () => {
    expect(catalogValuesFromForm(form({ name: 'x' }))).toBeNull();
  });

  it('parses weight, dimensions, tags, specs and order quantities', () => {
    const v = catalogValuesFromForm(
      form({
        catalogFields: '1',
        weightGrams: '25',
        lengthMm: '90',
        tags: 'student-grade, gift, gift',
        extraBarcodes: '0884955043936',
        attributeValues: 'Volume ML=8\npigment=PW6',
        minOrderQty: '1',
        orderQtyStep: '6',
        allowBackorder: 'on',
        fragile: 'on',
      }),
    )!;
    expect(v).toMatchObject({
      weightGrams: 25,
      lengthMm: 90,
      tags: ['student-grade', 'gift'],
      extraBarcodes: ['0884955043936'],
      attributeValues: [
        { code: 'volume_ml', value: '8' },
        { code: 'pigment', value: 'PW6' },
      ],
      minOrderQty: '1.0000',
      orderQtyStep: '6.0000',
      allowBackorder: '1',
      fragile: '1',
    });
    expect(() => catalogValuesFromForm(form({ catalogFields: '1', weightGrams: '-3' }))).toThrow(/Weight/);
  });

  it('a parent listing needs options and never sells or holds stock itself', () => {
    expect(() => catalogValuesFromForm(form({ catalogFields: '1', isParentListing: 'on' }))).toThrow(/needs its options/);
    const v = catalogValuesFromForm(form({ catalogFields: '1', isParentListing: 'on', productOptions: 'Colour: Chinese White, Lemon Yellow; Size: 8ml' }))!;
    expect(v.productOptions).toEqual([
      { name: 'Colour', values: ['Chinese White', 'Lemon Yellow'] },
      { name: 'Size', values: ['8ml'] },
    ]);
    expect(catalogColumns(v)).toMatchObject({ sellable: '0', purchasable: '0' });
  });

  it('a variant needs a parent and option values; swatch must be a hex colour', () => {
    const parent = '11111111-1111-1111-1111-111111111111';
    expect(() => catalogValuesFromForm(form({ catalogFields: '1', parentProductId: parent }))).toThrow(/option values/);
    expect(() => catalogValuesFromForm(form({ catalogFields: '1', parentProductId: parent, variantOptions: 'Colour=Red', swatchHex: 'red' }))).toThrow(/Swatch/);
    const v = catalogValuesFromForm(form({ catalogFields: '1', parentProductId: parent, variantOptions: 'Colour=Lemon Yellow', swatchHex: '#f2e14c', isDefaultVariant: 'on' }))!;
    expect(v).toMatchObject({ parentProductId: parent, variantOptions: [{ name: 'Colour', value: 'Lemon Yellow' }], swatchHex: '#F2E14C', isDefaultVariant: '1' });
    expect(() => catalogValuesFromForm(form({ catalogFields: '1', parentProductId: parent, variantOptions: 'Colour=Red' }), parent)).toThrow(/itself/);
  });

  it('option parsers reject malformed input with a readable message', () => {
    expect(() => parseProductOptions('Colour Red')).toThrow(/Name: value/);
    expect(() => parseVariantOptions('Colour Red')).toThrow(/Name=value/);
    expect(() => parseAttributeValues('nothing')).toThrow(/code=value/);
  });
});

describe('WP1 wiring', () => {
  it('migration 056 adds catalog tables with tenant isolation and is additive', () => {
    const sql = read('packages/db/migrations/056_catalog_channels.sql');
    for (const t of ['inventory_product_brands', 'inventory_product_images', 'inventory_attributes', 'commerce_channel_products']) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
      expect(sql).toContain(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
    }
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS weight_grams integer/);
    expect(sql).not.toMatch(/DROP (TABLE|COLUMN)/i);
  });

  it('API routes, public media route and change notifications are wired', () => {
    const route = read('apps/web/src/app/api/commerce/v1/[...path]/route.ts');
    for (const r of ["'catalog/products'", "'catalog/products/'", "'catalog/categories'", "'catalog/brands'", "'catalog/attributes'"]) {
      expect(route).toContain(r);
    }
    expect(route).toMatch(/If-None-Match|if-none-match/);
    expect(route).toMatch(/X-RateLimit-Remaining/);
    expect(read('apps/web/src/app/api/commerce/media/[tenantId]/[imageId]/[file]/route.ts')).toMatch(/immutable/);
    expect(read('apps/web/src/app/actions/inventory.ts')).toMatch(/notifyCommerce\(user\.tenantId, \[id\], 'product'\)/);
    expect(read('apps/web/src/app/actions/commercial-docs.ts')).toMatch(/notifyCommerce\(\s*user\.tenantId,/);
  });

  it('new catalog UI uses registry controls only', () => {
    for (const f of [
      'apps/web/src/components/inventory/product-catalog-fields.tsx',
      'apps/web/src/components/inventory/product-gallery.tsx',
      'apps/web/src/components/inventory/product-brands-card.tsx',
      'apps/web/src/components/commerce/commerce-channel-catalog.tsx',
    ]) {
      const src = read(f);
      expect(src, f).not.toMatch(/<select\b/);
      expect(src, f).not.toMatch(/type="date"/);
    }
  });

  it('the sample catalog only runs on sandbox connections and posts no journals', () => {
    const action = read('apps/web/src/app/actions/commerce.ts');
    expect(action).toMatch(/connection\.environment !== 'sandbox'/);
    const seed = read('apps/web/src/lib/commerce-sample-catalog.ts');
    expect(seed).toMatch(/unitCost: 0/);
    expect(seed).not.toMatch(/journalEntries|journalLines/);
  });
});
