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
  const posting: PostingPort = {
    async postSalesInvoice() {
      const current = store.stock[0]!;
      const qty = Number(current.quantity) - 1;
      if (qty < 0) throw new Error('negative stock');
      current.quantity = String(qty);
      const doc = { documentId: `doc-${posts.length + 1}`, documentNumber: `INV-${posts.length + 1}` };
      posts.push(doc);
      return doc;
    },
    async postSalesReturn(input) {
      if (input.restock) {
        const current = store.stock[0]!;
        current.quantity = String(Number(current.quantity) + 1);
      }
      const doc = { documentId: `ret-${returns.length + 1}`, documentNumber: `SR-${returns.length + 1}` };
      returns.push(doc);
      return doc;
    },
  };
  const service = new CommerceService(store, pepper, posting);
  return { store, service, posts, returns };
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
  });
});
