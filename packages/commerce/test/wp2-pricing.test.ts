import { describe, expect, it } from 'vitest';
import { MemoryCommerceStore } from '../src/memory-store';
import { CommerceService } from '../src/service';
import { channelPrice, parseTiers, pickPriceList, unitPriceFor, type PriceListRaw } from '../src/pricing';
import type { CatalogProductRaw } from '../src/catalog';
import type { PostingPort } from '../src/types';

const tenantId = '11111111-1111-1111-1111-111111111111';
const userId = '22222222-2222-2222-2222-222222222222';
const locationId = '44444444-4444-4444-4444-444444444444';
const MEDIA = 'https://shop.example/media';
const NOW = Date.parse('2026-12-03T00:00:00Z');

function raw(id: string, sku: string, sellPrice: string): CatalogProductRaw {
  return {
    id, sku, name: sku, shortName: null, description: null, longDescription: null, productType: 'physical', unit: 'each', sellPrice,
    categoryId: null, productBrandId: null, barcode: null, extraBarcodes: [], tags: [], attributeValues: [], weightGrams: 10,
    lengthMm: null, widthMm: null, heightMm: null, fragile: false, taxStatus: 'standard', minOrderQty: null, maxOrderQty: null,
    orderQtyStep: null, allowBackorder: false, parentProductId: null, variantOptions: [], productOptions: [], swatchHex: null,
    variantSortOrder: 0, isDefaultVariant: false, sellable: true, isActive: true, archived: false, imageKey: null,
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-20T00:00:00.000Z',
  };
}

function list(id: string, group: string | null, entries: PriceListRaw['entries']): PriceListRaw {
  return { id, name: id, currency: 'LKR', customerGroup: group, entries, updatedAt: '2026-11-20T00:00:00.000Z' };
}

describe('pricing rules', () => {
  const product = raw('p1', 'WN-COT', '1250.00');
  const online = list(
    'pl-online',
    null,
    new Map([
      ['p1', {
        productId: 'p1', price: '1119.00', compareAtPrice: '1250.00', salePrice: '999.00',
        saleStartsAt: '2026-12-01T00:00:00+05:30', saleEndsAt: '2026-12-07T23:59:59+05:30',
        tiers: [{ minQty: '6', price: '1050.00' }], updatedAt: '2026-11-25T00:00:00.000Z',
      }],
    ]),
  );

  it('uses the BookOne sell price without a list', () => {
    expect(channelPrice(product, null, 'LKR', NOW)).toMatchObject({ priceListId: 'default', price: '1250.00', compareAtPrice: null, sale: null, effectivePrice: '1250.00' });
  });

  it('list price, compare-at, active scheduled sale and tiers', () => {
    const p = channelPrice(product, online, 'LKR', NOW);
    expect(p).toMatchObject({
      priceListId: 'pl-online',
      price: '1119.00',
      compareAtPrice: '1250.00',
      sale: { price: '999.00', active: true },
      tiers: [{ minQty: '6', price: '1050.00' }],
      effectivePrice: '999.00',
    });
    expect(unitPriceFor(p, 1)).toBe('999.00');
    const after = channelPrice(product, online, 'LKR', Date.parse('2026-12-10T00:00:00Z'));
    expect(after.effectivePrice).toBe('1119.00');
    expect(unitPriceFor(after, 6)).toBe('1050.00');
    expect(unitPriceFor(after, 5)).toBe('1119.00');
  });

  it('hides a compare-at price that is not higher than the price', () => {
    const l = list('x', null, new Map([['p1', { productId: 'p1', price: '1300.00', compareAtPrice: '1250.00', salePrice: null, saleStartsAt: null, saleEndsAt: null, tiers: [], updatedAt: '2026-11-25T00:00:00.000Z' }]]));
    expect(channelPrice(product, l, 'LKR', NOW).compareAtPrice).toBeNull();
  });

  it('picks the customer-group list when asked and present', () => {
    const wholesale = list('pl-wh', 'wholesale', new Map());
    expect(pickPriceList([online, wholesale], 'pl-online', 'Wholesale')?.id).toBe('pl-wh');
    expect(pickPriceList([online, wholesale], 'pl-online', 'school')?.id).toBe('pl-online');
    expect(pickPriceList([online], null, null)).toBeNull();
  });

  it('parses tiers', () => {
    expect(parseTiers('6=1050; 12=990')).toEqual([{ minQty: '6', price: '1050.00' }, { minQty: '12', price: '990.00' }]);
    expect(() => parseTiers('1=100')).toThrow(/quantity 2 or more/);
  });
});

describe('WP2 service', () => {
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
    store.catalog.products = [raw('p1', 'SKU-1', '1250.00'), raw('p2', 'SKU-2', '500.00')];
    store.seedProduct(
      { id: 'p1', sku: 'SKU-1', name: 'SKU-1', unit: 'each', productType: 'physical', isActive: true, archived: false, sellPrice: '1250.00', revision: 1 },
      { productId: 'p1', sku: 'SKU-1', locationId, quantity: '10', revision: 1, asOf: '', stale: false },
    );
    const service = new CommerceService(store, 'pepper', posting);
    const operator = { tenantId, userId, canWrite: true };
    const connection = await service.createConnection(operator, { name: 'web', kind: 'custom_website', environment: 'sandbox', locationId });
    await service.setChannelPublishing(operator, connection.id, ['p1', 'p2'], true);
    const issued = await service.issueCredential(operator, connection.id);
    const actor = await service.authenticate(`Bearer ${issued.token}`);
    return { store, service, operator, connectionId: connection.id, actor };
  }

  it('assigns a list to the channel, saves prices and serves them on /pricing and the catalog', async () => {
    const { service, operator, connectionId, actor } = await setup();
    const { id } = await service.savePriceList(operator, { name: 'Online Retail' });
    await service.savePriceEntries(operator, id, [
      { productId: 'p1', price: '1119.00', compareAtPrice: '1250.00', salePrice: null, saleStartsAt: null, saleEndsAt: null, tiers: [{ minQty: '6', price: '1050.00' }] },
    ]);
    await service.setChannelPriceList(operator, connectionId, id);
    expect((await service.connection(actor)).priceListId).toBe(id);
    const priced = await service.pricing(actor, ['SKU-1', 'SKU-2', 'NOPE']);
    expect(priced.items.find((i) => i.sku === 'SKU-1')!.price).toMatchObject({ price: '1119.00', compareAtPrice: '1250.00', priceListId: id });
    expect(priced.items.find((i) => i.sku === 'SKU-2')!.price.price).toBe('500.00');
    expect(priced.missing).toEqual(['NOPE']);
    const product = await service.catalogProduct(actor, { sku: 'SKU-1' }, ['prices'], MEDIA);
    expect(product.price).toMatchObject({ price: '1119.00', tiers: [{ minQty: '6', price: '1050.00' }] });
  });

  it('emits price changes when prices or the channel list change', async () => {
    const { service, operator, connectionId, actor } = await setup();
    const { id } = await service.savePriceList(operator, { name: 'Online' });
    await service.setChannelPriceList(operator, connectionId, id);
    const before = await service.changes(actor);
    await service.savePriceEntries(operator, id, [
      { productId: 'p2', price: '450.00', compareAtPrice: null, salePrice: null, saleStartsAt: null, saleEndsAt: null, tiers: [] },
    ]);
    const after = await service.changes(actor, before.nextCursor);
    const price = after.items.find((c) => c.kind === 'price');
    expect(price?.payload).toMatchObject({ sku: 'SKU-2', price: { price: '450.00', priceListId: id } });
  });

  it('flags PRICE_MISMATCH on validate but keeps the order acceptable', async () => {
    const { service, operator, connectionId, actor } = await setup();
    await service.applyMappings(operator, connectionId, [{ bookoneProductId: 'p1', sku: 'SKU-1', externalProductId: 'e1' }]);
    const preview = await service.validateOrder(actor, {
      externalId: 'W1',
      currency: 'LKR',
      placedAt: '2026-11-26T10:00:00Z',
      customer: { name: 'A' },
      lines: [{ externalLineId: '1', sku: 'SKU-1', quantity: '1', unitPrice: '1000.00' }],
      total: '1000.00',
      payment: { status: 'paid' },
    });
    expect(preview.ok).toBe(true);
    expect(preview.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PRICE_MISMATCH', message: 'PRICE_MISMATCH:SKU-1', blocking: false })]));
  });

  it('validates prices and sale dates; archiving a list moves its channels back to the sell price', async () => {
    const { service, operator, connectionId, actor } = await setup();
    const { id } = await service.savePriceList(operator, { name: 'Sale' });
    await expect(
      service.savePriceEntries(operator, id, [
        { productId: 'p1', price: null, compareAtPrice: null, salePrice: '900.00', saleStartsAt: '2026-12-07T00:00:00Z', saleEndsAt: '2026-12-01T00:00:00Z', tiers: [] },
      ]),
    ).rejects.toThrow(/end after it starts/);
    await expect(
      service.savePriceEntries(operator, id, [
        { productId: 'p1', price: '-1', compareAtPrice: null, salePrice: null, saleStartsAt: null, saleEndsAt: null, tiers: [] },
      ]),
    ).rejects.toThrow(/0 or more/);
    await service.setChannelPriceList(operator, connectionId, id);
    await service.savePriceList(operator, { id, name: 'Sale', archive: true });
    expect((await service.connection(actor)).priceListId).toBe('default');
    await expect(service.setChannelPriceList({ ...operator, canWrite: false }, connectionId, null)).rejects.toThrow();
  });

  it('/pricing needs 1 to 100 SKUs', async () => {
    const { service, actor } = await setup();
    await expect(service.pricing(actor, [])).rejects.toThrow(/at least one/);
    await expect(service.pricing(actor, Array.from({ length: 101 }, (_, i) => `S${i}`))).rejects.toThrow(/at most 100/);
  });
});
