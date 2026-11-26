import { describe, expect, it } from 'vitest';
import { MemoryCommerceStore } from '../src/memory-store';
import { CommerceService, holdForReview } from '../src/service';
import type { OrderInput, PostedDocument, PostingPort } from '../src/types';

const tenantId = '11111111-1111-1111-1111-111111111111';
const userId = '22222222-2222-2222-2222-222222222222';
const productId = '33333333-3333-3333-3333-333333333333';
const locationId = '44444444-4444-4444-4444-444444444444';

function paidOrder(id: string, extra: Partial<OrderInput> = {}): OrderInput {
  return {
    externalId: id,
    currency: 'LKR',
    placedAt: '2026-11-26T10:00:00.000Z',
    sourceTimezone: 'Asia/Colombo',
    customer: { name: 'Race Shopper' },
    lines: [{ externalLineId: `${id}-1`, sku: 'SKU-RACE', quantity: '1', unitPrice: '1000.00' }],
    total: '1000.00',
    payment: { status: 'paid', amount: '1000.00' },
    ...extra,
  };
}

/**
 * Posting port that behaves like the database after QA-1126-16: stock changes
 * are serialised per product and refused below zero.
 */
function make(opts: { handlesStoreTax?: boolean } = {}) {
  const store = new MemoryCommerceStore();
  store.seedProduct(
    { id: productId, sku: 'SKU-RACE', name: 'Race mug', unit: 'each', productType: 'physical', isActive: true, archived: false, sellPrice: '1000.00', revision: 1 },
    { productId, sku: 'SKU-RACE', locationId, quantity: '1', revision: 1, asOf: new Date().toISOString(), stale: false },
  );
  const posts: PostedDocument[] = [];
  const returns: PostedDocument[] = [];
  let lock: Promise<unknown> = Promise.resolve();
  const control = { failReturns: false };
  const posting: PostingPort = {
    handlesStoreTax: opts.handlesStoreTax,
    async postSalesInvoice(input) {
      const run = lock.then(async () => {
        await new Promise((r) => setTimeout(r, 5));
        const level = store.stock[0]!;
        const need = input.lines.reduce((s, l) => s + l.quantity, 0);
        if (Number(level.quantity) - need < 0) throw new Error('Insufficient stock for SKU-RACE: on hand 0.0000, need 1.0000.');
        level.quantity = String(Number(level.quantity) - need);
        const doc = { documentId: `doc-${posts.length + 1}`, documentNumber: `INV-${posts.length + 1}` };
        posts.push(doc);
        return doc;
      });
      lock = run.catch(() => undefined);
      return run;
    },
    async postSalesReturn() {
      if (control.failReturns) throw new Error('This return must use the same customer as the original invoice.');
      const doc = { documentId: `ret-${returns.length + 1}`, documentNumber: `SR-${returns.length + 1}` };
      returns.push(doc);
      return doc;
    },
  };
  const service = new CommerceService(store, 'pepper', posting);
  return { store, service, posts, returns, control };
}

async function postingActor(service: CommerceService) {
  const operator = { tenantId, userId, canWrite: true };
  const connection = await service.createConnection(operator, {
    name: 'Woo',
    kind: 'custom_website',
    environment: 'sandbox',
    locationId,
  });
  await service.updateConnection(operator, connection.id, { postingMode: 'posting' });
  await service.applyMappings(operator, connection.id, [
    { bookoneProductId: productId, sku: 'SKU-RACE', externalProductId: 'site-103' },
  ]);
  const issued = await service.issueCredential(operator, connection.id);
  return { actor: await service.authenticate(`Bearer ${issued.token}`), operator, connectionId: connection.id };
}

describe('QA-1126 commerce retest', () => {
  it('QA-1126-16: three concurrent paid orders for the last unit post exactly once', async () => {
    const { service, store, posts } = make();
    const { actor } = await postingActor(service);
    const results = await Promise.all(
      ['woo-401', 'woo-402', 'woo-403'].map((id) => service.submitOrder(actor, paidOrder(id), `key-${id}`)),
    );
    expect(results.filter((r) => r.status === 'posted')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'needs_review')).toHaveLength(2);
    expect(posts).toHaveLength(1);
    expect(store.stock[0]?.quantity).toBe('0');
  });

  it('QA-1126-18: a refused refund is held for review (not a 422) and Retry books it', async () => {
    const { service, returns, control } = make();
    const { actor, operator, connectionId } = await postingActor(service);
    await service.submitOrder(actor, paidOrder('woo-3005'), 'key-3005');
    control.failReturns = true;
    const held = await service.applyEvent(actor, 'woo-3005', {
      externalEventId: 'ev-refund-3005',
      kind: 'refunded',
      effectiveAt: '2026-11-26T12:00:00.000Z',
      amount: '1000.00',
      restock: false,
      externalRefundId: 'rf-3005',
    });
    expect(held.status).toBe('needs_review');
    expect(String(held.reviewReason)).toMatch(/Refund was not booked in BookOne: This return must use the same customer/);
    expect(returns).toHaveLength(0);

    control.failReturns = false;
    const orders = await service.listOperatorView(operator);
    const review = orders[0]!.reviews.find((o) => o.externalId === 'woo-3005')!;
    const retried = await service.retryReviewOrder(operator, connectionId, review.id);
    expect(retried.status).toBe('refunded');
    expect(returns).toHaveLength(1);
  });

  it('QA-1126-18: a refused cancel-after-post is held for review', async () => {
    const { service, control } = make();
    const { actor } = await postingActor(service);
    await service.submitOrder(actor, paidOrder('woo-3003'), 'key-3003');
    control.failReturns = true;
    const held = await service.applyEvent(actor, 'woo-3003', {
      externalEventId: 'ev-cancel-3003',
      kind: 'cancelled',
      effectiveAt: '2026-11-26T12:00:00.000Z',
    });
    expect(held.status).toBe('needs_review');
    expect(String(held.reviewReason)).toMatch(/Cancellation was not booked/);
  });

  it('QA-1126-21: a later review reason is added, not overwritten', () => {
    const order = { status: 'needs_review', reviewReason: 'Oversell under async stock policy.' };
    holdForReview(order, 'Refund arrived before its order was posted.');
    expect(order.reviewReason).toBe('Oversell under async stock policy. | Refund arrived before its order was posted.');
  });

  it('QA-1126-20: a tax-aware posting port receives taxed orders instead of the service holding them', async () => {
    const { service, posts } = make({ handlesStoreTax: true });
    const { actor } = await postingActor(service);
    const taxed = await service.submitOrder(
      actor,
      paidOrder('woo-vat', { taxAmount: '180.00', total: '1180.00', payment: { status: 'paid', amount: '1180.00' } }),
      'key-vat',
    );
    expect(taxed.status).toBe('posted');
    expect(posts).toHaveLength(1);
  });
});
