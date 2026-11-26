import { describe, expect, it } from 'vitest';
import { MemoryCommerceStore } from '../src/memory-store';
import { CommerceService } from '../src/service';
import { catalogPage, etagFor, type CatalogProductRaw } from '../src/catalog';
import type { PostingPort } from '../src/types';

const tenantId = '11111111-1111-1111-1111-111111111111';
const userId = '22222222-2222-2222-2222-222222222222';
const locationId = '44444444-4444-4444-4444-444444444444';
const MEDIA = 'https://shop.example/api/commerce/media/t1';

function raw(over: Partial<CatalogProductRaw> & { id: string; sku: string; name: string }): CatalogProductRaw {
  return {
    shortName: null, description: null, longDescription: '<p>Nice <b>paint</b></p>', productType: 'physical', unit: 'each',
    sellPrice: '1250.00', categoryId: null, productBrandId: null, barcode: null, extraBarcodes: [], tags: [], attributeValues: [],
    weightGrams: 25, lengthMm: null, widthMm: null, heightMm: null, fragile: false, taxStatus: 'standard', minOrderQty: null,
    maxOrderQty: null, orderQtyStep: null, allowBackorder: false, parentProductId: null, variantOptions: [], productOptions: [],
    swatchHex: null, variantSortOrder: 0, isDefaultVariant: false, sellable: true, isActive: true, archived: false, imageKey: null,
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-20T00:00:00.000Z',
    ...over,
  };
}

const posting: PostingPort = {
  async postSalesInvoice() {
    return { documentId: 'd', documentNumber: 'INV-1' };
  },
  async postSalesReturn() {
    return { documentId: 'r', documentNumber: 'SR-1' };
  },
};

async function setup() {
  const store = new MemoryCommerceStore();
  store.catalog.categories = [
    { id: 'cat-paint', parentId: null, name: 'Paints', slug: null, description: null, imageUrl: null, sortOrder: 0, archived: false, updatedAt: '2026-11-01T00:00:00.000Z' },
    { id: 'cat-wc', parentId: 'cat-paint', name: 'Watercolour Paints', slug: null, description: null, imageUrl: null, sortOrder: 0, archived: false, updatedAt: '2026-11-01T00:00:00.000Z' },
  ];
  store.catalog.brands = [{ id: 'brd-wn', name: 'Winsor & Newton', slug: null, description: null, websiteUrl: null, logoUrl: null, archived: false, updatedAt: '2026-11-01T00:00:00.000Z' }];
  store.catalog.products = [
    raw({ id: 'p-parent', sku: 'WN-COT-8ML', name: 'Cotman 8ml Tube', productType: 'service', sellable: false, categoryId: 'cat-wc', productBrandId: 'brd-wn',
      productOptions: [{ name: 'Colour', values: ['Chinese White', 'Lemon Yellow'] }], weightGrams: 25, updatedAt: '2026-11-10T00:00:00.000Z' }),
    raw({ id: 'v-white', sku: 'WN-COT-8ML-CHW', name: 'Cotman Chinese White', parentProductId: 'p-parent', variantOptions: [{ name: 'Colour', value: 'Chinese White' }],
      swatchHex: '#F7F5EE', isDefaultVariant: true, weightGrams: null, updatedAt: '2026-11-11T00:00:00.000Z' }),
    raw({ id: 'v-lemon', sku: 'WN-COT-8ML-LEM', name: 'Cotman Lemon Yellow', parentProductId: 'p-parent', variantOptions: [{ name: 'Colour', value: 'Lemon Yellow' }],
      variantSortOrder: 2, updatedAt: '2026-11-12T00:00:00.000Z' }),
    raw({ id: 'p-brush', sku: 'BR-001', name: 'Round Brush', categoryId: 'cat-paint', weightGrams: null, attributeValues: [{ code: 'size', value: '6' }], updatedAt: '2026-11-15T00:00:00.000Z' }),
    raw({ id: 'p-hidden', sku: 'HID-1', name: 'Not online', updatedAt: '2026-11-16T00:00:00.000Z' }),
  ];
  store.catalog.images = [
    { id: 'img-2', productId: 'p-parent', width: 2000, height: 2000, alt: null, position: 2, checksum: 'sha256:bbbbbbbbbbbbbbbb', updatedAt: '2026-11-10T00:00:00.000Z' },
    { id: 'img-1', productId: 'p-parent', width: 1800, height: 1800, alt: 'Front', position: 1, checksum: 'sha256:aaaaaaaaaaaaaaaa', updatedAt: '2026-11-10T00:00:00.000Z' },
  ];
  store.stock.push(
    { productId: 'v-white', sku: 'WN-COT-8ML-CHW', locationId, quantity: '14', revision: 1, asOf: '', stale: false },
    { productId: 'p-brush', sku: 'BR-001', locationId, quantity: '3', revision: 1, asOf: '', stale: false },
  );
  const service = new CommerceService(store, 'pepper', posting);
  const operator = { tenantId, userId, canWrite: true };
  const connection = await service.createConnection(operator, { name: 'watercolor', kind: 'custom_website', environment: 'sandbox', locationId });
  const issued = await service.issueCredential(operator, connection.id);
  const actor = await service.authenticate(`Bearer ${issued.token}`);
  return { store, service, operator, connectionId: connection.id, actor };
}

const ALL = ['variants', 'images', 'prices', 'inventory', 'attributes'] as const;

describe('WP1 catalog', () => {
  it('returns only published products; publishing a parent publishes its variants', async () => {
    const { service, operator, connectionId, actor } = await setup();
    expect((await service.catalogProducts(actor, { mediaBase: MEDIA })).items).toHaveLength(0);
    await service.setChannelPublishing(operator, connectionId, ['p-parent', 'p-brush'], true);
    const page = await service.catalogProducts(actor, { mediaBase: MEDIA, include: [...ALL] });
    expect(page.items.map((p) => p.sku)).toEqual(['WN-COT-8ML', 'BR-001']);
    const parent = page.items[0]!;
    expect(parent).toMatchObject({
      type: 'variable',
      brand: { id: 'brd-wn', name: 'Winsor & Newton' },
      categories: [{ id: 'cat-wc', path: ['Paints', 'Watercolour Paints'], primary: true }],
      options: [{ name: 'Colour', values: ['Chinese White', 'Lemon Yellow'] }],
      descriptionText: 'Nice paint',
      slugHint: 'cotman-8ml-tube',
    });
    const variants = parent.variants as Array<Record<string, unknown>>;
    expect(variants.map((v) => v.sku)).toEqual(['WN-COT-8ML-CHW', 'WN-COT-8ML-LEM']);
    expect(variants[0]).toMatchObject({ isDefault: true, swatch: { hex: '#F7F5EE' }, shipping: { weightGrams: 25 }, price: { price: '1250.00' } });
    expect(variants[0]!.inventory).toMatchObject({ onHand: '14', available: '14', trackInventory: true });
    const images = parent.images as Array<{ id: string; url: string; position: number }>;
    expect(images.map((i) => i.id)).toEqual(['img-1', 'img-2']);
    expect(images[0]!.url).toBe(`${MEDIA}/img-1/aaaaaaaaaaaa.webp`);
    expect(page.items.some((p) => p.sku === 'HID-1')).toBe(false);
    expect((await service.catalogProducts(actor, { mediaBase: MEDIA, scope: 'all' })).items.some((p) => p.sku === 'HID-1')).toBe(true);
  });

  it('pages with a keyset cursor, filters by category tree, brand, sku and updatedSince', async () => {
    const { service, operator, connectionId, actor } = await setup();
    await service.setChannelPublishing(operator, connectionId, ['p-parent', 'p-brush'], true);
    const first = await service.catalogProducts(actor, { mediaBase: MEDIA, limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    const second = await service.catalogProducts(actor, { mediaBase: MEDIA, limit: 1, cursor: first.nextCursor });
    expect(second.items[0]!.sku).not.toBe(first.items[0]!.sku);
    expect(second.nextCursor).toBeNull();
    expect((await service.catalogProducts(actor, { mediaBase: MEDIA, categoryId: 'cat-paint' })).items).toHaveLength(2);
    expect((await service.catalogProducts(actor, { mediaBase: MEDIA, brandId: 'brd-wn' })).items.map((p) => p.sku)).toEqual(['WN-COT-8ML']);
    expect((await service.catalogProducts(actor, { mediaBase: MEDIA, skus: ['WN-COT-8ML-LEM'] })).items.map((p) => p.sku)).toEqual(['WN-COT-8ML']);
    expect((await service.catalogProducts(actor, { mediaBase: MEDIA, updatedSince: '2026-11-14T00:00:00.000Z' })).items.map((p) => p.sku)).toEqual(['BR-001']);
  });

  it('finds a product by id or by a variant sku; categories, brands and attributes are listed', async () => {
    const { service, operator, connectionId, actor } = await setup();
    await service.setChannelPublishing(operator, connectionId, ['p-parent', 'p-brush'], true);
    expect((await service.catalogProduct(actor, { sku: 'WN-COT-8ML-LEM' }, [], MEDIA)).id).toBe('p-parent');
    await expect(service.catalogProduct(actor, { sku: 'HID-1' }, [], MEDIA)).rejects.toThrow(/not found/i);
    const cats = await service.catalogCategories(actor);
    expect(cats.items.find((c) => c.id === 'cat-wc')).toMatchObject({ parentId: 'cat-paint', slugHint: 'watercolour-paints' });
    expect((await service.catalogBrands(actor)).items[0]).toMatchObject({ name: 'Winsor & Newton', slugHint: 'winsor-and-newton' });
    expect((await service.catalogAttributes(actor)).items.map((a) => a.code)).toEqual(['size']);
  });

  it('applies the safety buffer and backorder flag to the catalog and /inventory; held stock reduces available', async () => {
    const { store, service, operator, connectionId, actor } = await setup();
    await service.setChannelPublishing(operator, connectionId, ['p-brush'], true);
    await service.updateChannelSettings(operator, connectionId, { safetyBuffer: 1, allowBackorder: true });
    store.commitments.push({ tenantId, orderId: 'o1', productId: 'p-brush', locationId, quantity: 1, status: 'active' });
    const inv = await service.inventory(actor);
    expect(inv.items.find((i) => i.sku === 'BR-001')).toMatchObject({ onHand: '3', committed: '1', available: '1', quantity: '1', allowBackorder: true });
    const product = await service.catalogProduct(actor, { sku: 'BR-001' }, ['inventory'], MEDIA);
    expect(product.inventory).toMatchObject({ available: '1', allowBackorder: true });
  });

  it('lists published products without a weight; publishing emits product changes', async () => {
    const { service, operator, connectionId, actor } = await setup();
    await service.setChannelPublishing(operator, connectionId, ['p-parent', 'p-brush'], true);
    const view = await service.channelCatalogForOperator(operator, connectionId);
    expect(view.missingWeight.map((m) => m.sku)).toEqual(['BR-001']);
    const changes = await service.changes(actor);
    expect(changes.items.filter((c) => c.kind === 'product').map((c) => (c.payload as { action: string }).action)).toEqual(['published', 'published']);
  });

  it('describes the channel on GET /connection and keeps a stable ETag', async () => {
    const { service, actor } = await setup();
    const conn = await service.connection(actor);
    expect(conn).toMatchObject({ channel: { name: 'watercolor' }, stockLocationIds: [locationId], taxMode: 'inclusive', timezone: 'Asia/Colombo' });
    expect(conn.capabilities).toMatchObject({ catalogProducts: true, variants: true, channelPublishing: true, priceLists: true, priceExport: true });
    const a = { items: [{ x: 1, asOf: '2026-01-01' }], requestId: 'a' };
    const b = { items: [{ x: 1, asOf: '2026-02-02' }], requestId: 'b' };
    expect(etagFor(a)).toBe(etagFor(b));
    expect(etagFor(a)).not.toBe(etagFor({ items: [{ x: 2 }] }));
  });

  it('a variant can be published on its own without its siblings', async () => {
    const { store, service, operator, connectionId, actor } = await setup();
    void store;
    await service.setChannelPublishing(operator, connectionId, ['v-lemon'], true);
    const page = await service.catalogProducts(actor, { mediaBase: MEDIA, include: ['variants'] });
    expect(page.items).toHaveLength(1);
    expect((page.items[0]!.variants as Array<{ sku: string }>).map((v) => v.sku)).toEqual(['WN-COT-8ML-LEM']);
    void catalogPage;
  });
});
