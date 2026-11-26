import { describe, expect, it } from 'vitest';
import { MemoryCommerceStore } from '../src/memory-store';
import { CommerceService } from '../src/service';
import { normalizePaymentSettings, resolvePaymentAccount, withSeenMethod } from '../src/payments';
import type { OrderInput, PostingPort } from '../src/types';

const tenantId = '11111111-1111-1111-1111-111111111111';
const userId = '22222222-2222-2222-2222-222222222222';
const productId = '33333333-3333-3333-3333-333333333333';
const locationId = '44444444-4444-4444-4444-444444444444';

function order(id: string, method?: string, status: 'paid' | 'pending' = 'paid'): OrderInput {
  return {
    externalId: id,
    currency: 'LKR',
    placedAt: '2026-11-26T10:00:00.000Z',
    customer: { name: 'Web Shopper' },
    lines: [{ externalLineId: `${id}-1`, sku: 'SKU-1', quantity: '1', unitPrice: '1000.00' }],
    total: '1000.00',
    payment: { status, amount: '1000.00', ...(method ? { method } : {}) },
  };
}

describe('resolvePaymentAccount', () => {
  const settings = normalizePaymentSettings({
    defaultAccountCode: '1201',
    methods: { 'Gateway-A': '1202', bacs: '1100', cod: 'unpaid' },
  });

  it('uses the method account, then the default; names are case-insensitive', () => {
    expect(resolvePaymentAccount(settings, order('a', 'gateway-a '))).toEqual({ accountCode: '1202', source: 'method' });
    expect(resolvePaymentAccount(settings, order('b', 'BACS'))).toEqual({ accountCode: '1100', source: 'method' });
    expect(resolvePaymentAccount(settings, order('c', 'gateway-b'))).toEqual({ accountCode: '1201', source: 'default' });
  });

  it('respects "leave unpaid", unpaid orders and the legacy 4-digit code', () => {
    expect(resolvePaymentAccount(settings, order('d', 'cod'))).toMatchObject({ accountCode: null, source: 'unpaid_rule' });
    expect(resolvePaymentAccount(settings, order('e', 'gateway-a', 'pending'))).toMatchObject({ accountCode: null, source: 'not_paid' });
    expect(resolvePaymentAccount(settings, order('f', '1000'))).toEqual({ accountCode: '1000', source: 'order_code' });
  });

  it('reports not_configured when nothing is set', () => {
    expect(resolvePaymentAccount(normalizePaymentSettings({}), order('g', 'gateway-c'))).toMatchObject({
      accountCode: null,
      source: 'not_configured',
      method: 'gateway-c',
    });
  });

  it('remembers new method names once', () => {
    const first = withSeenMethod(normalizePaymentSettings({}), 'Gateway-X');
    expect(first?.seenMethods).toEqual(['gateway-x']);
    expect(withSeenMethod(first!, 'gateway-x')).toBeNull();
    expect(withSeenMethod(first!, '1100')).toBeNull();
  });
});

describe('commerce settlement from Payments settings', () => {
  function make() {
    const store = new MemoryCommerceStore();
    store.seedProduct(
      { id: productId, sku: 'SKU-1', name: 'Mug', unit: 'each', productType: 'physical', isActive: true, archived: false, sellPrice: '1000.00', revision: 1 },
      { productId, sku: 'SKU-1', locationId, quantity: '10', revision: 1, asOf: new Date().toISOString(), stale: false },
    );
    const settledWith: Array<string | undefined> = [];
    const posting: PostingPort = {
      async postSalesInvoice(input) {
        settledWith.push(input.paymentAccountCode);
        return { documentId: `doc-${settledWith.length}`, documentNumber: `INV-${settledWith.length}`, settled: Boolean(input.paymentAccountCode) };
      },
      async postSalesReturn() {
        return { documentId: 'ret', documentNumber: 'SR' };
      },
    };
    return { store, service: new CommerceService(store, 'pepper', posting), settledWith };
  }

  it('settles into the chosen account, records it, and flags unsettled paid orders in Activity', async () => {
    const { store, service, settledWith } = make();
    const operator = { tenantId, userId, canWrite: true };
    const connection = await service.createConnection(operator, { name: 'Shop', kind: 'custom_website', environment: 'sandbox', locationId });
    await service.updateConnection(operator, connection.id, { postingMode: 'posting' });
    await service.applyMappings(operator, connection.id, [{ bookoneProductId: productId, sku: 'SKU-1', externalProductId: 'p1' }]);
    const issued = await service.issueCredential(operator, connection.id);
    const actor = await service.authenticate(`Bearer ${issued.token}`);

    const unsettled = await service.submitOrder(actor, order('w1', 'gateway-a'), 'k1');
    expect(unsettled.settlement).toBe('not_configured');
    expect(settledWith[0]).toBeUndefined();
    const view = await service.listOperatorView(operator);
    expect(view[0]!.connection.paymentSettings?.seenMethods).toEqual(['gateway-a']);
    expect(view[0]!.activity.some((a) => a.action === 'order.unsettled')).toBe(true);

    await service.updatePaymentSettings(operator, connection.id, {
      defaultAccountCode: '1201',
      methods: { 'gateway-a': '1202' },
      seenMethods: [],
    });
    const settled = await service.submitOrder(actor, order('w2', 'Gateway-A'), 'k2');
    expect(settled.settlement).toBe('settled');
    expect(settledWith[1]).toBe('1202');
    const other = await service.submitOrder(actor, order('w3', 'bank-transfer'), 'k3');
    expect(other.settlement).toBe('settled');
    expect(settledWith[2]).toBe('1201');
    const kept = await store.getConnection(tenantId, connection.id);
    expect(kept?.paymentSettings?.seenMethods).toEqual(['gateway-a', 'bank-transfer']);
  });

  it('refuses a non-code account value and needs write access', async () => {
    const { service } = make();
    const operator = { tenantId, userId, canWrite: true };
    const connection = await service.createConnection(operator, { name: 'Shop', kind: 'custom_website', environment: 'sandbox', locationId });
    await expect(
      service.updatePaymentSettings(operator, connection.id, { defaultAccountCode: 'bank', methods: {}, seenMethods: [] }),
    ).rejects.toThrow(/not a valid account code/);
    await expect(
      service.updatePaymentSettings({ ...operator, canWrite: false }, connection.id, { defaultAccountCode: '1201', methods: {}, seenMethods: [] }),
    ).rejects.toThrow();
  });
});
