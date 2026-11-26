import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryCommerceStore } from '../src/memory-store';
import { CommerceService } from '../src/service';
import { grantedScopeNames, parseScopes } from '../src/credentials';
import { decryptSecret, encryptSecret, kindMatches, parseKinds, retryDelayMs, signWebhook, validateWebhookUrl, verifyWebhook } from '../src/webhooks';
import { normalizeOrderInput, invoiceNotes } from '../src/order-view';
import type { OrderInput, PostingPort } from '../src/types';

const tenantId = '11111111-1111-1111-1111-111111111111';
const userId = '22222222-2222-2222-2222-222222222222';
const productId = '33333333-3333-3333-3333-333333333333';
const locationId = '44444444-4444-4444-4444-444444444444';

function order(id: string, extra: Partial<OrderInput> = {}): OrderInput {
  return {
    externalId: id,
    currency: 'LKR',
    placedAt: '2026-11-26T10:00:00.000Z',
    customer: { name: 'Nimal Perera', email: 'nimal@example.com', phone: '+94771234567' },
    lines: [{ externalLineId: `${id}-1`, sku: 'WC0001', quantity: '1', unitPrice: '1450.00' }],
    total: '1450.00',
    payment: { status: 'paid', method: 'card', amount: '1450.00' },
    ...extra,
  };
}

function make(qty = '1') {
  const store = new MemoryCommerceStore();
  store.seedProduct(
    { id: productId, sku: 'WC0001', name: 'Paint tube', unit: 'each', productType: 'physical', isActive: true, archived: false, sellPrice: '1450.00', revision: 1 },
    { productId, sku: 'WC0001', locationId, quantity: qty, revision: 1, asOf: new Date().toISOString(), stale: false },
  );
  const posted: Array<{ externalId: string; freight?: number; discount?: number }> = [];
  const parties: Array<{ name: string; email: string | null }> = [];
  const posting: PostingPort = {
    async postSalesInvoice(input) {
      const level = store.stock[0]!;
      level.quantity = String(Number(level.quantity) - input.lines.reduce((s, l) => s + l.quantity, 0));
      posted.push({ externalId: input.order.externalId, freight: input.freightAmount, discount: input.headerDiscount });
      return { documentId: `doc-${posted.length}`, documentNumber: `INV-${posted.length}` };
    },
    async postSalesReturn() {
      return { documentId: 'ret-1', documentNumber: 'SR-1' };
    },
    async upsertCustomerParty(input) {
      const hit = parties.findIndex((p) => p.email && p.email === input.email);
      if (hit >= 0) return { partyId: `party-${hit}`, matchedExisting: true };
      parties.push({ name: input.name, email: input.email });
      return { partyId: `party-${parties.length - 1}`, matchedExisting: false };
    },
    async partyInvoices(_t, partyId) {
      return partyId === 'party-0'
        ? [{ documentId: 'pos-1', documentNumber: 'POS-1', issueDate: '2026-11-20', total: '900.00', channel: 'pos', status: 'paid' }]
        : [];
    },
    async invoiceLink(_t, documentId) {
      return { documentNumber: 'INV-1', issuedAt: '2026-11-26', total: '1450.00', url: `https://books.example/i/${documentId}` };
    },
  };
  const service = new CommerceService(store, 'pepper', posting);
  return { store, service, posted, parties };
}

async function setup(service: CommerceService, postingMode: 'preview' | 'posting' = 'posting') {
  const operator = { tenantId, userId, canWrite: true };
  const connection = await service.createConnection(operator, { name: 'watercolor', kind: 'custom_website', environment: 'sandbox', locationId });
  await service.updateConnection(operator, connection.id, { postingMode });
  await service.applyMappings(operator, connection.id, [{ bookoneProductId: productId, sku: 'WC0001', externalProductId: 'wc-1' }]);
  const issued = await service.issueCredential(operator, connection.id);
  const actor = await service.authenticate(`Bearer ${issued.token}`);
  return { operator, connectionId: connection.id, actor };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('WP3 reservations', () => {
  it('holds the last unit so a second checkout (or the POS) cannot take it', async () => {
    const { service, store } = make('1');
    const { actor } = await setup(service);
    const first = await service.createReservation(actor, { externalId: 'chk-1', lines: [{ sku: 'WC0001', quantity: '1' }] });
    expect(first).toMatchObject({ status: 'active', held: true, lines: [{ sku: 'WC0001', status: 'held', held: '1' }] });
    // The POS reads the same commitments.
    expect(await store.committedQty(tenantId, productId, locationId)).toBe(1);
    const inv = await service.inventory(actor);
    expect(inv.items[0]).toMatchObject({ onHand: '1', committed: '1', available: '0' });
    const second = await service.createReservation(actor, { externalId: 'chk-2', lines: [{ sku: 'WC0001', quantity: '1' }] });
    expect(second).toMatchObject({ status: 'released', held: false, lines: [{ status: 'insufficient', available: '0' }] });
    // Same checkout id again returns the existing hold.
    expect(await service.createReservation(actor, { externalId: 'chk-1', lines: [{ sku: 'WC0001', quantity: '1' }] })).toMatchObject({ replayed: true, reservationId: first.reservationId });
  });

  it('expires on time: the hold stops counting and a reservation change is emitted', async () => {
    const { service, store } = make('1');
    const { actor } = await setup(service);
    const r = await service.createReservation(actor, { externalId: 'chk-1', lines: [{ sku: 'WC0001', quantity: '1' }], ttlSeconds: 60 });
    const before = await service.changes(actor);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61_000);
    store.now = () => Date.now();
    expect(await store.committedQty(tenantId, productId, locationId)).toBe(0);
    const after = await service.changes(actor, before.nextCursor);
    expect(after.items.find((i) => i.kind === 'reservation')?.payload).toMatchObject({ action: 'expired', reservationId: r.reservationId });
    expect((await service.getReservation(actor, r.reservationId)).status).toBe('expired');
  });

  it('extends, changes and releases; partial holds what is there', async () => {
    const { service, store } = make('3');
    const { actor } = await setup(service);
    const r = await service.createReservation(actor, { externalId: 'chk-1', lines: [{ sku: 'WC0001', quantity: '1' }] });
    const extended = await service.updateReservation(actor, r.reservationId, { ttlSeconds: 3600 });
    expect(Date.parse(extended.expiresAt)).toBeGreaterThan(Date.parse(r.expiresAt));
    const changed = await service.updateReservation(actor, r.reservationId, { lines: [{ sku: 'WC0001', quantity: '2' }] });
    expect(changed.lines[0]).toMatchObject({ held: '2' });
    await expect(service.updateReservation(actor, r.reservationId, { lines: [{ sku: 'WC0001', quantity: '9' }] })).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(await store.committedQty(tenantId, productId, locationId)).toBe(2);
    await service.releaseReservation(actor, r.reservationId);
    expect(await store.committedQty(tenantId, productId, locationId)).toBe(0);
    const partial = await service.createReservation(actor, { externalId: 'chk-2', partial: true, lines: [{ sku: 'WC0001', quantity: '5' }] });
    expect(partial).toMatchObject({ status: 'active', lines: [{ status: 'insufficient', held: '3' }] });
    await expect(service.createReservation(actor, { externalId: 'x', lines: [{ sku: 'WC0001', quantity: '1' }], ttlSeconds: 4000 })).rejects.toThrow(/60 to 3600/);
  });

  it('POST /orders with reservationId converts the hold and never fails on stock for held lines', async () => {
    const { service, store, posted } = make('1');
    const { actor } = await setup(service);
    const r = await service.createReservation(actor, { externalId: 'chk-1', lines: [{ sku: 'WC0001', quantity: '1' }] });
    const receipt = await service.submitOrder(actor, order('WLK-1', { reservationId: r.reservationId }), 'k1');
    expect(receipt).toMatchObject({ status: 'posted', reservationStatus: 'converted' });
    expect(posted).toHaveLength(1);
    expect((await service.getReservation(actor, r.reservationId)).status).toBe('converted');
    expect(await store.committedQty(tenantId, productId, locationId)).toBe(0);
    expect(store.stock[0]!.quantity).toBe('0');
  });

  it('a pending (COD) order converts the hold into the order hold', async () => {
    const { service, store } = make('1');
    const { actor } = await setup(service);
    const r = await service.createReservation(actor, { externalId: 'chk-1', lines: [{ sku: 'WC0001', quantity: '1' }] });
    const receipt = await service.submitOrder(
      actor,
      order('WLK-2', { reservationId: r.reservationId, payment: { status: 'pending', method: 'cod', amount: '1450.00' } }),
      'k2',
    );
    expect(receipt).toMatchObject({ stock: 'committed', reservationStatus: 'converted' });
    expect(await store.committedQty(tenantId, productId, locationId)).toBe(1);
  });
});

describe('WP4 change feed and webhooks', () => {
  it('filters /changes by kind (variant selects variant product changes) and adds entityId / occurredAt', async () => {
    expect(parseKinds('price,inventory')).toEqual(['price', 'inventory']);
    expect(() => parseKinds('nope')).toThrow(/Unknown change kind/);
    expect(kindMatches(['variant'], { kind: 'product', payload: { variantId: 'v1' } })).toBe(true);
    expect(kindMatches(['variant'], { kind: 'product', payload: { variantId: null } })).toBe(false);
    const { service } = make('2');
    const { actor } = await setup(service);
    await service.createReservation(actor, { externalId: 'chk-1', lines: [{ sku: 'WC0001', quantity: '1' }] });
    const onlyRes = await service.changes(actor, undefined, 'reservation');
    expect(onlyRes.items.length).toBeGreaterThan(0);
    expect(onlyRes.items.every((i) => i.kind === 'reservation')).toBe(true);
    expect(onlyRes.items[0]).toMatchObject({ entityId: expect.any(String), occurredAt: expect.any(String) });
  });

  it('signs, verifies, retries with backoff and keeps the secret encrypted', () => {
    const body = '{"id":"x"}';
    const header = signWebhook(['whsec_a'], body, 1_700_000_000);
    expect(verifyWebhook('whsec_a', header, body, 1_700_000_100)).toBe(true);
    expect(verifyWebhook('whsec_b', header, body, 1_700_000_100)).toBe(false);
    expect(verifyWebhook('whsec_a', header, body, 1_700_000_000 + 301)).toBe(false);
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(30)).toBe(6 * 60 * 60 * 1000);
    expect(decryptSecret(encryptSecret('whsec_a', 'app'), 'app')).toBe('whsec_a');
    expect(() => validateWebhookUrl('http://shop.example/hook', 'live')).toThrow(/https/);
    expect(() => validateWebhookUrl('https://10.0.0.5/hook', 'live')).toThrow(/private/);
    expect(validateWebhookUrl('http://127.0.0.1:9999/hook', 'sandbox')).toContain('127.0.0.1');
  });

  it('delivers matching changes, retries failures and marks a long-failing endpoint', async () => {
    const { service, store } = make('2');
    const { actor, connectionId } = await setup(service);
    const hook = await service.createWebhook(tenantId, connectionId, { url: 'https://shop.example/hook', kinds: ['reservation'] });
    expect(hook.secret).toMatch(/^whsec_/);
    expect(store.webhooks[0]!.secretEnc).not.toContain(hook.secret);
    await service.createReservation(actor, { externalId: 'chk-1', lines: [{ sku: 'WC0001', quantity: '1' }] });
    const sent: Array<{ body: string; headers: Record<string, string> }> = [];
    const ok = async (_url: string, body: string, headers: Record<string, string>) => {
      sent.push({ body, headers });
      return { status: 200 };
    };
    const first = await service.runBackground(tenantId, ok);
    expect(first.queued).toBe(1);
    expect(JSON.parse(sent[0]!.body)).toMatchObject({ kind: 'reservation', payload: { action: 'held' } });
    expect(verifyWebhook(hook.secret, sent[0]!.headers['X-BookOne-Signature']!, sent[0]!.body)).toBe(true);
    // Test delivery, failing endpoint.
    await service.testWebhook(tenantId, connectionId, hook.id);
    const fail500 = async () => ({ status: 500 });
    await service.runBackground(tenantId, fail500);
    const log = await service.webhookDeliveries(tenantId, connectionId, hook.id);
    expect(log.find((d) => d.kind === 'ping')).toMatchObject({ status: 'pending', attempts: 1, lastStatusCode: 500 });
    // After 24 h of failures the endpoint is marked failing.
    store.deliveries.forEach((d) => {
      if (d.status === 'pending') {
        d.firstAttemptAt = new Date(Date.now() - 25 * 3600_000).toISOString();
        d.nextAttemptAt = new Date(Date.now() - 1000).toISOString();
      }
    });
    await service.runBackground(tenantId, fail500);
    expect((await service.listWebhooks(tenantId, connectionId))[0]).toMatchObject({ status: 'failing' });
    // Rotation keeps the old secret signing for 24 h.
    const rotated = await service.rotateWebhookSecret(tenantId, connectionId, hook.id);
    expect(rotated.secret).not.toBe(hook.secret);
    expect(rotated.rotationOverlapUntil).toBeTruthy();
  });
});

describe('WP5 orders', () => {
  it('folds fees and coupons into shipping and discount; notes print ship-to and coupons', () => {
    const n = normalizeOrderInput(
      order('X', {
        fees: [{ kind: 'shipping', amount: '450.00' }, { kind: 'cod', amount: '0.00' }],
        discounts: [{ code: 'WELCOME500', type: 'coupon', amount: '500.00' }],
        shippingAddress: { name: 'Nimal', line1: '78/A2, Pattiyagama', city: 'Madampe', country: 'LK' },
        customerNote: 'Gift wrap please',
      }),
    );
    expect(n).toMatchObject({ shippingAmount: '450.00', discountAmount: '500.00' });
    const notes = invoiceNotes(n);
    expect(notes).toContain('Ship to: Nimal, 78/A2, Pattiyagama, Madampe, LK');
    expect(notes).toContain('WELCOME500');
    expect(notes).toContain('Gift wrap please');
    // Explicit v1 fields win.
    expect(normalizeOrderInput(order('Y', { shippingAmount: '100.00', fees: [{ kind: 'shipping', amount: '450.00' }] })).shippingAmount).toBe('100.00');
  });

  it('posts an order with address, coupon and shipping fee; GET /orders/{id} shows lines, payment, invoice and shipments', async () => {
    const { service, posted } = make('2');
    const { actor, operator, connectionId } = await setup(service);
    const input = order('WLK-100245', {
      displayNumber: 'WLK-100245',
      shippingAddress: { name: 'Nimal', line1: '78/A2', city: 'Madampe', country: 'LK' },
      delivery: { method: 'standard', carrier: 'fardar', fee: '450.00' },
      discounts: [{ code: 'WELCOME500', type: 'coupon', amount: '500.00' }],
      fees: [{ kind: 'shipping', amount: '450.00' }],
      total: '1400.00',
      payment: { status: 'paid', method: 'payhere', amount: '1400.00', externalRef: 'PH-1', gatewayFee: '42.00' },
    });
    expect((await service.validateOrder(actor, input)).ok).toBe(true);
    const receipt = await service.submitOrder(actor, input, 'order-create-WLK-100245');
    expect(receipt.status).toBe('posted');
    expect(posted[0]).toMatchObject({ freight: 450, discount: 500 });
    const list = await service.listWebOrders(operator, connectionId);
    await service.dispatchWebOrder(operator, connectionId, list[0]!.id, { carrier: 'fardar', trackingNumber: 'FE1', trackingUrlTemplate: 'https://t.example/{tracking}' });
    const view = await service.getOrder(actor, 'WLK-100245');
    expect(view).toMatchObject({
      displayNumber: 'WLK-100245',
      shippingAddress: { city: 'Madampe' },
      payment: { method: 'payhere', status: 'paid', gatewayFee: '42.00' },
      invoice: { documentNumber: 'INV-1' },
      fulfilment: { status: 'shipped', shipments: [{ carrier: 'fardar', trackingNumber: 'FE1', trackingUrl: 'https://t.example/FE1', lines: [{ externalLineId: 'WLK-100245-1' }] }] },
      lines: [{ fulfilledQuantity: '1' }],
    });
    const all = await service.listOrdersForChannel(actor, { updatedSince: '2026-01-01T00:00:00Z' });
    expect(all.items).toHaveLength(1);
    expect(await service.orderInvoice(actor, 'WLK-100245')).toMatchObject({ documentNumber: 'INV-1', pdfUrl: 'https://books.example/i/doc-1' });
  });

  it('applies payment_pending_verification, address_updated and payment_failed', async () => {
    const { service, store } = make('2');
    const { actor } = await setup(service);
    await service.submitOrder(actor, order('B1', { payment: { status: 'pending', method: 'bank_transfer', amount: '1450.00' } }), 'b1');
    expect(await store.committedQty(tenantId, productId, locationId)).toBe(1);
    await service.applyEvent(actor, 'B1', { externalEventId: 'e1', kind: 'payment_pending_verification', effectiveAt: '2026-11-26T11:00:00Z', attachment: { kind: 'bank_slip', url: 'https://x/slip.jpg' } });
    await service.applyEvent(actor, 'B1', { externalEventId: 'e2', kind: 'address_updated', effectiveAt: '2026-11-26T11:05:00Z', shippingAddress: { city: 'Kandy' } });
    let view = await service.getOrder(actor, 'B1');
    expect(view).toMatchObject({ shippingAddress: { city: 'Kandy' }, reviewReason: expect.stringMatching(/Bank slip/) });
    await service.applyEvent(actor, 'B1', { externalEventId: 'e3', kind: 'payment_failed', effectiveAt: '2026-11-26T11:10:00Z', reason: 'declined' });
    view = await service.getOrder(actor, 'B1');
    expect(view.payment.status).toBe('failed');
    expect(await store.committedQty(tenantId, productId, locationId)).toBe(0);
    // Idempotent on externalEventId.
    await service.applyEvent(actor, 'B1', { externalEventId: 'e3', kind: 'payment_failed', effectiveAt: '2026-11-26T11:10:00Z' });
  });

  it('POST /orders/{id}/returns records a line return', async () => {
    const { service } = make('2');
    const { actor } = await setup(service);
    await service.submitOrder(actor, order('R1'), 'r1');
    const ret = await service.createReturn(actor, 'R1', { externalReturnId: 'ret-1', restock: true, lines: [{ externalLineId: 'R1-1', quantity: '1', reason: 'damaged' }] });
    expect(ret).toMatchObject({ externalReturnId: 'ret-1', amount: '1450.00', restock: true });
    await expect(service.createReturn(actor, 'R1', { externalReturnId: 'ret-2', lines: [{ externalLineId: 'nope', quantity: '1' }] })).rejects.toThrow(/not on this order/);
  });
});

describe('WP6 customers and WP7', () => {
  it('upserts a customer (matching an existing BookOne customer by email) and lists web + POS orders', async () => {
    const { service, parties } = make('2');
    const { actor } = await setup(service);
    parties.push({ name: 'Nimal (POS)', email: 'nimal@example.com' });
    const c = await service.upsertChannelCustomer(actor, 'usr_812', { name: 'Nimal Perera', email: 'Nimal@Example.com', customerGroup: 'Wholesale' });
    expect(c).toMatchObject({ created: true, matchedExisting: true, channelCustomerId: 'usr_812', customerGroup: 'wholesale' });
    const again = await service.upsertChannelCustomer(actor, 'usr_812', { name: 'Nimal P', email: 'nimal@example.com' });
    expect(again).toMatchObject({ created: false, customerId: c.customerId, name: 'Nimal P' });
    await service.submitOrder(actor, order('C1', { channelCustomerId: 'usr_812' }), 'c1');
    const orders = await service.channelCustomerOrders(actor, c.customerId);
    expect(orders.items.map((o) => o.source).sort()).toEqual(['pos', 'web']);
    expect((await service.getChannelCustomer(actor, 'usr_812')).customerId).toBe(c.customerId);
    await expect(service.upsertChannelCustomer(actor, 'u2', { name: 'X', email: 'not-an-email' })).rejects.toThrow(/Email/);
  });

  it('maps fine-grained scope names onto v1 scopes', async () => {
    expect(parseScopes('catalog:read pricing:read orders:write reservations:write')).toEqual(['catalog', 'order', 'inventory']);
    expect(grantedScopeNames(['order'])).toEqual(['orders:write', 'orders:read', 'customers:read', 'customers:write']);
    const { service } = make();
    const { actor } = await setup(service);
    const conn = await service.connection(actor);
    expect(conn.grantedScopes).toContain('reservations:write');
    expect(conn.capabilities).toMatchObject({ reservations: true, webhooks: true, customers: true, productStats: true });
  });

  it('include=stats, related products and new arrivals', async () => {
    const { service, store } = make('2');
    const { actor } = await setup(service);
    store.sold.set(productId, { d30: 3, d90: 7, all: 12 });
    const page = await service.catalogProducts(actor, { mediaBase: 'https://m', include: [], stats: true });
    expect(page.items[0]).toMatchObject({ stats: { unitsSold30d: '3', unitsSold90d: '7', unitsSoldAllTime: '12' } });
    const related = await service.relatedProducts(actor, 'WC0001', [], 'https://m');
    expect(related.items).toEqual([]);
    await expect(service.relatedProducts(actor, 'NOPE', [], 'https://m')).rejects.toThrow(/not found/);
    await expect(service.newArrivals(actor, 0, [], 'https://m')).rejects.toThrow(/1 to 365/);
  });
});
