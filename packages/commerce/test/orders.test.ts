import { describe, expect, it } from 'vitest';
import { CommerceError } from '../src/errors';
import { MemoryCommerceStore } from '../src/memory-store';
import { CommerceService } from '../src/service';
import type { OrderInput, PostedDocument, PostingPort } from '../src/types';

const pepper = 'test-pepper';
const tenantId = '11111111-1111-1111-1111-111111111111';
const userId = '22222222-2222-2222-2222-222222222222';
const productId = '33333333-3333-3333-3333-333333333333';
const locationId = '44444444-4444-4444-4444-444444444444';
const otherLocationId = '55555555-5555-5555-5555-555555555555';

function paidOrder(id: string, sku = 'SKU-1'): OrderInput {
  return {
    externalId: id,
    currency: 'LKR',
    placedAt: '2026-11-20T10:00:00.000Z',
    sourceTimezone: 'Asia/Colombo',
    customer: { name: 'Walk-in' },
    lines: [{ externalLineId: `${id}-1`, sku, quantity: '1', unitPrice: '1500.00' }],
    total: '1500.00',
    payment: { status: 'paid', amount: '1500.00' },
  };
}

function make(stockQty = '1') {
  const store = new MemoryCommerceStore();
  store.seedProduct(
    {
      id: productId,
      sku: 'SKU-1',
      name: 'Pilot mug',
      unit: 'each',
      productType: 'physical',
      isActive: true,
      archived: false,
      sellPrice: '1500.00',
      revision: 1,
    },
    {
      productId,
      sku: 'SKU-1',
      locationId,
      quantity: stockQty,
      revision: 1,
      asOf: new Date().toISOString(),
      stale: false,
    },
  );
  const posts: PostedDocument[] = [];
  const returns: PostedDocument[] = [];
  const invoices: Array<{ headerDiscount?: number; freightAmount?: number; lines: Array<{ discountAmount?: number; quantity: number }> }> = [];
  const posting: PostingPort = {
    async postSalesInvoice(input) {
      invoices.push(input);
      const current = store.stock[0]!;
      const sold = input.lines.reduce((sum, line) => sum + line.quantity, 0) || 1;
      const qty = Number(current.quantity) - sold;
      if (qty < 0) throw new Error('negative stock');
      current.quantity = String(qty);
      const doc = { documentId: `doc-${posts.length + 1}`, documentNumber: `INV-${posts.length + 1}` };
      posts.push(doc);
      return doc;
    },
    async postSalesReturn(input) {
      if (input.restock) {
        const current = store.stock[0]!;
        const qty = input.lines.reduce((sum, line) => sum + line.quantity, 0) || 1;
        current.quantity = String(Number(current.quantity) + qty);
      }
      const doc = { documentId: `ret-${returns.length + 1}`, documentNumber: `SR-${returns.length + 1}` };
      returns.push(doc);
      return doc;
    },
  };
  const service = new CommerceService(store, pepper, posting);
  return { store, service, posts, returns, invoices };
}

describe('commerce order intake', () => {
  it('issues a secret once, then redacts it, and rejects a revoked key', async () => {
    const { service } = make();
    const operator = { tenantId, userId, canWrite: true };
    const connection = await service.createConnection(operator, {
      name: 'Generic HTTP',
      kind: 'custom_website',
      environment: 'sandbox',
      locationId,
    });
    const issued = await service.issueCredential(operator, connection.id);
    expect(issued.token.startsWith('bkc_sand_')).toBe(true);
    expect(issued.secretShownOnce).toBe(true);
    const listed = await service.listOperatorView(operator);
    expect(listed[0]?.credentials[0]?.secret).toBeNull();
    expect(listed[0]?.credentials[0]?.prefix).toBe(issued.prefix);
    await service.revokeCredential(operator, connection.id, listed[0]!.credentials[0]!.id);
    await expect(service.authenticate(`Bearer ${issued.token}`)).rejects.toBeInstanceOf(CommerceError);
    // QA-1126-13: a malformed or unknown token is called invalid, not "required".
    await expect(service.authenticate('Bearer bkc_sand_bad_x')).rejects.toThrow(/invalid, revoked or expired/);
    await expect(service.authenticate(null)).rejects.toThrow(/required/);
  });

  it('posts the last unit once, replays the same idempotency key, and reviews a competing claim', async () => {
    const { service, store, posts } = make('1');
    const operator = { tenantId, userId, canWrite: true };
    const connection = await service.createConnection(operator, {
      name: 'HTTP',
      kind: 'custom_website',
      environment: 'sandbox',
      locationId,
    });
    await service.updateConnection(operator, connection.id, { postingMode: 'posting' });
    await service.applyMappings(operator, connection.id, [
      { bookoneProductId: productId, sku: 'SKU-1', externalProductId: 'woo-1' },
    ]);
    const issued = await service.issueCredential(operator, connection.id);
    const actor = await service.authenticate(`Bearer ${issued.token}`);
    const first = await service.submitOrder(actor, paidOrder('1001'), 'key-1001');
    expect(first.status).toBe('posted');
    expect(posts).toHaveLength(1);
    const replay = await service.submitOrder(actor, paidOrder('1001'), 'key-1001');
    expect(replay.replayed).toBe(true);
    expect(posts).toHaveLength(1);
    await expect(service.submitOrder(actor, paidOrder('1001', 'SKU-OTHER'), 'key-1001')).rejects.toBeInstanceOf(CommerceError);
    const second = await service.submitOrder(actor, paidOrder('1002'), 'key-1002');
    expect(second.status).toBe('needs_review');
    expect(String(second.reviewReason)).toMatch(/Oversell/);
    expect(posts).toHaveLength(1);
    expect(store.stock[0]?.quantity).toBe('0');
  });

  it('stages invalid totals and unmapped SKUs with zero posting', async () => {
    const { service, posts } = make('1');
    const operator = { tenantId, userId, canWrite: true };
    const connection = await service.createConnection(operator, {
      name: 'HTTP',
      kind: 'custom_website',
      environment: 'sandbox',
      locationId,
    });
    await service.updateConnection(operator, connection.id, { postingMode: 'posting' });
    await service.applyMappings(operator, connection.id, [
      { bookoneProductId: productId, sku: 'SKU-1', externalProductId: 'woo-1' },
    ]);
    const issued = await service.issueCredential(operator, connection.id, ['order']);
    const actor = await service.authenticate(`Bearer ${issued.token}`);
    const bad = await service.submitOrder(actor, { ...paidOrder('bad-total'), total: '9.99' }, 'key-bad');
    expect(bad.status).toBe('needs_review');
    const missing = await service.submitOrder(actor, paidOrder('missing', 'NOPE'), 'key-missing');
    expect(missing.status).toBe('needs_review');
    expect(posts).toHaveLength(0);
  });

  it('applies a money-only refund without restocking and a restock refund with stock return', async () => {
    const { service, store, posts, returns } = make('1');
    const operator = { tenantId, userId, canWrite: true };
    const connection = await service.createConnection(operator, {
      name: 'HTTP',
      kind: 'custom_website',
      environment: 'sandbox',
      locationId,
    });
    await service.updateConnection(operator, connection.id, { postingMode: 'posting' });
    await service.applyMappings(operator, connection.id, [
      { bookoneProductId: productId, sku: 'SKU-1', externalProductId: 'woo-1' },
    ]);
    const issued = await service.issueCredential(operator, connection.id);
    const actor = await service.authenticate(`Bearer ${issued.token}`);
    await service.submitOrder(actor, paidOrder('r1'), 'key-r1');
    expect(store.stock[0]?.quantity).toBe('0');
    await service.applyEvent(actor, 'r1', {
      externalEventId: 'ref-money',
      kind: 'refunded',
      effectiveAt: '2026-11-20T12:00:00.000Z',
      amount: '1500.00',
      restock: false,
      externalRefundId: 'rf-1',
    });
    expect(store.stock[0]?.quantity).toBe('0');
    expect(returns).toHaveLength(1);
    store.stock[0]!.quantity = '1';
    await service.submitOrder(actor, paidOrder('r2'), 'key-r2');
    await service.applyEvent(actor, 'r2', {
      externalEventId: 'ref-stock',
      kind: 'refunded',
      effectiveAt: '2026-11-20T12:00:00.000Z',
      amount: '1500.00',
      restock: true,
      externalRefundId: 'rf-2',
      lines: [{ externalLineId: 'r2-1', quantity: '1' }],
    });
    expect(store.stock[0]?.quantity).toBe('1');
    expect(posts).toHaveLength(2);
  });

  it('keeps tenant credentials isolated and refuses reservations', async () => {
    const { service } = make();
    const a = { tenantId, userId, canWrite: true };
    const connection = await service.createConnection(a, {
      name: 'A',
      kind: 'woocommerce',
      environment: 'sandbox',
      locationId,
    });
    const issued = await service.issueCredential(a, connection.id);
    const actor = await service.authenticate(`Bearer ${issued.token}`);
    expect(() => service.reservations()).toThrowError(/Reservation mode is disabled/);
    const other = new MemoryCommerceStore();
    const otherService = new CommerceService(other, pepper, {
      async postSalesInvoice() {
        return { documentId: 'x', documentNumber: 'x' };
      },
      async postSalesReturn() {
        return { documentId: 'y', documentNumber: 'y' };
      },
    });
    await expect(otherService.authenticate(`Bearer ${issued.token}`)).rejects.toBeInstanceOf(CommerceError);
    const viewer = { tenantId, userId: 'viewer', canWrite: false };
    await expect(service.issueCredential(viewer, connection.id)).rejects.toBeInstanceOf(CommerceError);
    expect(actor.kind).toBe('woocommerce');
  });

  it('returns the original receipt after a lost response', async () => {
    const { service, posts } = make('1');
    const operator = { tenantId, userId, canWrite: true };
    const connection = await service.createConnection(operator, {
      name: 'HTTP',
      kind: 'custom_website',
      environment: 'sandbox',
      locationId,
    });
    await service.updateConnection(operator, connection.id, { postingMode: 'posting' });
    await service.applyMappings(operator, connection.id, [
      { bookoneProductId: productId, sku: 'SKU-1', externalProductId: 'woo-1' },
    ]);
    const issued = await service.issueCredential(operator, connection.id);
    const actor = await service.authenticate(`Bearer ${issued.token}`);
    const first = await service.submitOrder(actor, paidOrder('lost'), 'lost-key');
    const second = await service.submitOrder(actor, paidOrder('lost'), 'lost-key');
    expect(second.externalId).toBe(first.externalId);
    expect(second.documentId).toBe(first.documentId);
    expect(posts).toHaveLength(1);
  });

  it('keeps a rotated key usable during the overlap window and pauses inbound independently', async () => {
    const { service, posts } = make('2');
    const operator = { tenantId, userId, canWrite: true };
    const connection = await service.createConnection(operator, {
      name: 'HTTP',
      kind: 'custom_website',
      environment: 'sandbox',
      locationId,
    });
    await service.updateConnection(operator, connection.id, { postingMode: 'posting' });
    await service.applyMappings(operator, connection.id, [
      { bookoneProductId: productId, sku: 'SKU-1', externalProductId: 'woo-1' },
    ]);
    const firstKey = await service.issueCredential(operator, connection.id);
    const rotated = await service.rotateCredential(operator, connection.id, firstKey.id);
    const oldActor = await service.authenticate(`Bearer ${firstKey.token}`);
    const newActor = await service.authenticate(`Bearer ${rotated.token}`);
    expect(oldActor.credentialId).toBe(firstKey.id);
    expect(newActor.credentialId).toBe(rotated.id);
    await service.updateConnection(operator, connection.id, { inboundPaused: true });
    const paused = await service.authenticate(`Bearer ${rotated.token}`);
    await expect(service.submitOrder(paused, paidOrder('paused'), 'key-paused')).rejects.toMatchObject({
      code: 'INBOUND_PAUSED',
      httpStatus: 409,
    });
    expect(posts).toHaveLength(0);
  });

  it('returns catalog and absolute stock after mapping, and stages pending payment without posting', async () => {
    const { service, posts } = make('1');
    const operator = { tenantId, userId, canWrite: true };
    const connection = await service.createConnection(operator, {
      name: 'HTTP',
      kind: 'custom_website',
      environment: 'sandbox',
      locationId,
    });
    await service.applyMappings(operator, connection.id, [
      { bookoneProductId: productId, sku: 'SKU-1', externalProductId: 'http-1' },
    ]);
    const issued = await service.issueCredential(operator, connection.id);
    const actor = await service.authenticate(`Bearer ${issued.token}`);
    const products = await service.products(actor);
    expect(products.items.some((p) => p && p.sku === 'SKU-1')).toBe(true);
    const inventory = await service.inventory(actor, ['SKU-1']);
    expect(inventory.items[0]?.quantity).toBe('1');
    const pending = await service.submitOrder(
      actor,
      { ...paidOrder('pending-1'), payment: { status: 'pending', amount: '1500.00' } },
      'key-pending',
    );
    expect(pending.status).toBe('received');
    expect(posts).toHaveLength(0);
    const preview = await service.validateOrder(actor, paidOrder('preview-only'));
    expect(preview.ok).toBe(true);
    expect(posts).toHaveLength(0);
  });

  it('stages a posting failure as needs_review instead of throwing', async () => {
    const store = new MemoryCommerceStore();
    store.seedProduct(
      {
        id: productId,
        sku: 'SKU-1',
        name: 'Pilot mug',
        unit: 'each',
        productType: 'physical',
        isActive: true,
        archived: false,
        sellPrice: '1500.00',
        revision: 1,
      },
      {
        productId,
        sku: 'SKU-1',
        locationId,
        quantity: '1',
        revision: 1,
        asOf: new Date().toISOString(),
        stale: false,
      },
    );
    const service = new CommerceService(store, pepper, {
      async postSalesInvoice() {
        throw new Error('period locked');
      },
      async postSalesReturn() {
        return { documentId: 'y', documentNumber: 'y' };
      },
    });
    const operator = { tenantId, userId, canWrite: true };
    const connection = await service.createConnection(operator, {
      name: 'HTTP',
      kind: 'custom_website',
      environment: 'sandbox',
      locationId,
    });
    await service.updateConnection(operator, connection.id, { postingMode: 'posting' });
    await service.applyMappings(operator, connection.id, [
      { bookoneProductId: productId, sku: 'SKU-1', externalProductId: 'woo-1' },
    ]);
    const issued = await service.issueCredential(operator, connection.id);
    const actor = await service.authenticate(`Bearer ${issued.token}`);
    const receipt = await service.submitOrder(actor, paidOrder('fail-post'), 'key-fail');
    expect(receipt.status).toBe('needs_review');
    expect(String(receipt.reviewReason)).toMatch(/period locked/);
    expect(store.stock[0]?.quantity).toBe('1');
    expect(store.orders).toHaveLength(1);
  });

  it('posts line discounts and shipping, and stages non-zero store tax', async () => {
    const { service, posts, invoices, store } = make('2');
    const operator = { tenantId, userId, canWrite: true };
    const connection = await service.createConnection(operator, {
      name: 'HTTP',
      kind: 'custom_website',
      environment: 'sandbox',
      locationId,
    });
    await service.updateConnection(operator, connection.id, { postingMode: 'posting' });
    await service.applyMappings(operator, connection.id, [
      { bookoneProductId: productId, sku: 'SKU-1', externalProductId: 'woo-1' },
    ]);
    const issued = await service.issueCredential(operator, connection.id);
    const actor = await service.authenticate(`Bearer ${issued.token}`);
    const priced: OrderInput = {
      externalId: 'disc-1',
      currency: 'LKR',
      placedAt: '2026-11-20T10:00:00.000Z',
      customer: { name: 'Walk-in' },
      lines: [{ externalLineId: 'disc-1-1', sku: 'SKU-1', quantity: '1', unitPrice: '1500.00', discountAmount: '100.00' }],
      shippingAmount: '50.00',
      discountAmount: '25.00',
      taxAmount: '0.00',
      total: '1425.00',
      payment: { status: 'paid', amount: '1425.00' },
    };
    const posted = await service.submitOrder(actor, priced, 'key-disc');
    expect(posted.status).toBe('posted');
    expect(posted.documentNumber).toMatch(/^INV-/);
    expect(invoices[0]?.headerDiscount).toBe(25);
    expect(invoices[0]?.freightAmount).toBe(50);
    expect(invoices[0]?.lines[0]?.discountAmount).toBe(100);
    expect(posted.settlement).toBe('not_configured');
    const taxed = await service.submitOrder(
      actor,
      { ...paidOrder('tax-1'), taxAmount: '50.00', total: '1550.00' },
      'key-tax',
    );
    expect(taxed.status).toBe('needs_review');
    expect(String(taxed.reviewReason)).toMatch(/tax/);
    expect(posts).toHaveLength(1);
    expect(store.orders).toHaveLength(2);
  });

  it('restocks only the referenced unit on a multi-line order and cancels the remainder', async () => {
    const { service, store, returns } = make('2');
    const operator = { tenantId, userId, canWrite: true };
    const connection = await service.createConnection(operator, {
      name: 'HTTP',
      kind: 'custom_website',
      environment: 'sandbox',
      locationId,
    });
    await service.updateConnection(operator, connection.id, { postingMode: 'posting' });
    await service.applyMappings(operator, connection.id, [
      { bookoneProductId: productId, sku: 'SKU-1', externalProductId: 'woo-1' },
    ]);
    const issued = await service.issueCredential(operator, connection.id);
    const actor = await service.authenticate(`Bearer ${issued.token}`);
    const multi: OrderInput = {
      externalId: 'multi-1',
      currency: 'LKR',
      placedAt: '2026-11-20T10:00:00.000Z',
      customer: { name: 'Walk-in' },
      lines: [
        { externalLineId: 'm-1', sku: 'SKU-1', quantity: '1', unitPrice: '1500.00' },
        { externalLineId: 'm-2', sku: 'SKU-1', quantity: '1', unitPrice: '1500.00' },
      ],
      total: '3000.00',
      payment: { status: 'paid', amount: '3000.00' },
    };
    await service.submitOrder(actor, multi, 'key-multi');
    expect(store.stock[0]?.quantity).toBe('0');
    await expect(
      service.applyEvent(actor, 'multi-1', {
        externalEventId: 'ref-no-lines',
        kind: 'refunded',
        effectiveAt: '2026-11-20T12:00:00.000Z',
        amount: '1500.00',
        restock: true,
        externalRefundId: 'rf-bad',
      }),
    ).rejects.toBeInstanceOf(CommerceError);
    expect(store.stock[0]?.quantity).toBe('0');
    await service.applyEvent(actor, 'multi-1', {
      externalEventId: 'ref-one',
      kind: 'refunded',
      effectiveAt: '2026-11-20T12:00:00.000Z',
      amount: '1500.00',
      restock: true,
      externalRefundId: 'rf-one',
      lines: [{ externalLineId: 'm-1', quantity: '1', amount: '1500.00' }],
    });
    expect(store.stock[0]?.quantity).toBe('1');
    const order = store.orders.find((row) => row.externalId === 'multi-1');
    expect(order?.lines.find((line) => line.externalLineId === 'm-1')?.restockedQty).toBe('1');
    expect(order?.lines.find((line) => line.externalLineId === 'm-2')?.restockedQty).toBe('0');
    await service.applyEvent(actor, 'multi-1', {
      externalEventId: 'cancel-rest',
      kind: 'cancelled',
      sourceVersion: '2',
      effectiveAt: '2026-11-20T13:00:00.000Z',
    });
    expect(store.stock[0]?.quantity).toBe('2');
    expect(returns.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects a stale lifecycle version and retries an interrupted post', async () => {
    let fail = true;
    const store = new MemoryCommerceStore();
    store.seedProduct(
      {
        id: productId,
        sku: 'SKU-1',
        name: 'Pilot mug',
        unit: 'each',
        productType: 'physical',
        isActive: true,
        archived: false,
        sellPrice: '1500.00',
        revision: 1,
      },
      {
        productId,
        sku: 'SKU-1',
        locationId,
        quantity: '1',
        revision: 1,
        asOf: new Date().toISOString(),
        stale: false,
      },
    );
    const service = new CommerceService(store, pepper, {
      async postSalesInvoice() {
        if (fail) throw new Error('interrupted commit');
        store.stock[0]!.quantity = '0';
        return { documentId: 'doc-retry', documentNumber: 'INV-RETRY' };
      },
      async postSalesReturn() {
        return { documentId: 'y', documentNumber: 'y' };
      },
    });
    const operator = { tenantId, userId, canWrite: true };
    const connection = await service.createConnection(operator, {
      name: 'HTTP',
      kind: 'custom_website',
      environment: 'sandbox',
      locationId,
    });
    await service.updateConnection(operator, connection.id, { postingMode: 'posting' });
    await service.applyMappings(operator, connection.id, [
      { bookoneProductId: productId, sku: 'SKU-1', externalProductId: 'woo-1' },
    ]);
    const issued = await service.issueCredential(operator, connection.id);
    const actor = await service.authenticate(`Bearer ${issued.token}`);
    const first = await service.submitOrder(actor, paidOrder('stale-1'), 'key-stale');
    expect(first.status).toBe('needs_review');
    expect(store.orders).toHaveLength(1);
    await service.applyEvent(actor, 'stale-1', {
      externalEventId: 'paid-2',
      kind: 'paid',
      sourceVersion: '2',
      effectiveAt: '2026-11-20T12:00:00.000Z',
    });
    await expect(
      service.applyEvent(actor, 'stale-1', {
        externalEventId: 'paid-1',
        kind: 'paid',
        sourceVersion: '1',
        effectiveAt: '2026-11-20T11:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    fail = false;
    const retried = await service.retryReviewOrder(operator, connection.id, store.orders[0]!.id);
    expect(retried.status).toBe('posted');
    expect(retried.documentNumber).toBe('INV-RETRY');
    expect(store.stock[0]?.quantity).toBe('0');
  });

  it('refuses a zero-item stock publish and does not set a publication timestamp', async () => {
    const { service } = make('1');
    const operator = { tenantId, userId, canWrite: true };
    const connection = await service.createConnection(operator, {
      name: 'HTTP',
      kind: 'custom_website',
      environment: 'sandbox',
      locationId,
    });
    await expect(service.publishStock(operator, connection.id)).rejects.toMatchObject({ code: 'VALIDATION' });
    const listed = await service.listOperatorView(operator);
    expect(listed[0]?.connection.lastStockSyncAt).toBeNull();
    const applied = await service.applyMappings(operator, connection.id, [
      { bookoneProductId: productId, sku: 'SKU-1', externalProductId: 'http-1' },
    ]);
    expect(applied.applied).toBe(1);
    const published = await service.publishStock(operator, connection.id);
    expect(published.published).toBe(1);
    expect(published.locationId).toBe(locationId);
    const after = await service.listOperatorView(operator);
    expect(after[0]?.connection.lastStockSyncAt).toBeTruthy();
  });

  it('fans a paid last-unit out to every mapped connection at the same location', async () => {
    const { service, store, posts } = make('1');
    store.stock.push({
      productId,
      sku: 'SKU-1',
      locationId: otherLocationId,
      quantity: '9',
      revision: 1,
      asOf: new Date().toISOString(),
      stale: false,
    });
    const operator = { tenantId, userId, canWrite: true };
    const http = await service.createConnection(operator, {
      name: 'Generic HTTP',
      kind: 'custom_website',
      environment: 'sandbox',
      locationId,
    });
    const woo = await service.createConnection(operator, {
      name: 'Woo',
      kind: 'woocommerce',
      environment: 'sandbox',
      locationId,
    });
    const other = await service.createConnection(operator, {
      name: 'Other location',
      kind: 'custom_website',
      environment: 'sandbox',
      locationId: otherLocationId,
    });
    const paused = await service.createConnection(operator, {
      name: 'Paused',
      kind: 'custom_website',
      environment: 'sandbox',
      locationId,
    });
    await service.updateConnection(operator, http.id, { postingMode: 'posting' });
    await service.updateConnection(operator, paused.id, { outboundPaused: true });
    await service.applyMappings(operator, http.id, [
      { bookoneProductId: productId, sku: 'SKU-1', externalProductId: 'http-1' },
    ]);
    await service.applyMappings(operator, woo.id, [
      { bookoneProductId: productId, sku: 'SKU-1', externalProductId: 'woo-1', externalVariantId: 'woo-1-v' },
    ]);
    await service.applyMappings(operator, other.id, [
      { bookoneProductId: productId, sku: 'SKU-1', externalProductId: 'other-1' },
    ]);
    await service.applyMappings(operator, paused.id, [
      { bookoneProductId: productId, sku: 'SKU-1', externalProductId: 'paused-1' },
    ]);
    const httpKey = await service.issueCredential(operator, http.id);
    const wooKey = await service.issueCredential(operator, woo.id);
    const otherKey = await service.issueCredential(operator, other.id);
    const httpActor = await service.authenticate(`Bearer ${httpKey.token}`);
    const wooActor = await service.authenticate(`Bearer ${wooKey.token}`);
    const otherActor = await service.authenticate(`Bearer ${otherKey.token}`);
    const wooBefore = await service.changes(wooActor);
    const otherBefore = await service.changes(otherActor);
    const first = await service.submitOrder(httpActor, paidOrder('fan-1'), 'key-fan');
    expect(first.status).toBe('posted');
    expect(first.settlement).toBe('not_configured');
    expect(posts).toHaveLength(1);
    expect(store.stock.find((row) => row.locationId === locationId)?.quantity).toBe('0');
    expect(store.stock.find((row) => row.locationId === otherLocationId)?.quantity).toBe('9');
    const delta = await service.changes(wooActor, wooBefore.nextCursor);
    const inventory = delta.items.filter((item) => item.kind === 'inventory' && item.sku === 'SKU-1');
    expect(inventory).toHaveLength(1);
    expect(inventory[0]?.payload).toMatchObject({ sku: 'SKU-1', quantity: '0', locationId });
    const snapshot = await service.inventory(wooActor, ['SKU-1']);
    expect(snapshot.items[0]?.quantity).toBe('0');
    const otherDelta = await service.changes(otherActor, otherBefore.nextCursor);
    expect(otherDelta.items.filter((item) => item.kind === 'inventory')).toHaveLength(0);
    expect(
      store.outbox.filter((row) => row.connectionId === paused.id && row.kind === 'inventory' && row.payload.quantity === '0'),
    ).toHaveLength(0);
  });
});
