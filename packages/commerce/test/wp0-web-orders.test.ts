import { describe, expect, it } from 'vitest';
import { MemoryCommerceStore } from '../src/memory-store';
import { CommerceService } from '../src/service';
import type { OrderInput, PostingPort } from '../src/types';

const tenantId = '11111111-1111-1111-1111-111111111111';
const userId = '22222222-2222-2222-2222-222222222222';
const productId = '33333333-3333-3333-3333-333333333333';
const locationId = '44444444-4444-4444-4444-444444444444';

function codOrder(id: string, method = 'cod', status: 'pending' | 'paid' = 'pending'): OrderInput {
  return {
    externalId: id,
    currency: 'LKR',
    placedAt: '2026-11-26T10:00:00.000Z',
    customer: { name: 'Nimal Perera' },
    lines: [{ externalLineId: `${id}-1`, sku: 'WC0001', quantity: '1', unitPrice: '1450.00' }],
    total: '1450.00',
    payment: { status, method, amount: '1450.00' },
  };
}

function make(qty = '1') {
  const store = new MemoryCommerceStore();
  store.seedProduct(
    { id: productId, sku: 'WC0001', name: 'Paint tube', unit: 'each', productType: 'physical', isActive: true, archived: false, sellPrice: '1450.00', revision: 1 },
    { productId, sku: 'WC0001', locationId, quantity: qty, revision: 1, asOf: new Date().toISOString(), stale: false },
  );
  const posts: string[] = [];
  const returns: string[] = [];
  const posting: PostingPort = {
    async postSalesInvoice(input) {
      const level = store.stock[0]!;
      level.quantity = String(Number(level.quantity) - input.lines.reduce((s, l) => s + l.quantity, 0));
      posts.push(input.order.externalId);
      return { documentId: `doc-${posts.length}`, documentNumber: `INV-${posts.length}` };
    },
    async postSalesReturn(input) {
      if (input.restock) {
        const level = store.stock[0]!;
        level.quantity = String(Number(level.quantity) + input.lines.reduce((s, l) => s + l.quantity, 0));
      }
      returns.push(input.sourceDocumentId);
      return { documentId: `ret-${returns.length}`, documentNumber: `SR-${returns.length}` };
    },
  };
  return { store, service: new CommerceService(store, 'pepper', posting), posts, returns };
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

describe('WP0: web orders, held stock and staff actions', () => {
  it('a COD order holds stock on receipt and shows in the Web orders list', async () => {
    const { service } = make('2');
    const { operator, connectionId, actor } = await setup(service);
    const receipt = await service.submitOrder(actor, codOrder('WLK-100001'), 'order-create-WLK-100001');
    expect(receipt.status).toBe('received');
    expect(receipt.stock).toBe('committed');
    const inv = await service.inventory(actor);
    expect(inv.items[0]).toMatchObject({ onHand: '2', committed: '1', available: '1', quantity: '1' });
    const list = await service.listWebOrders(operator, connectionId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ externalId: 'WLK-100001', paymentMethod: 'cod', paymentStatus: 'pending', stock: 'committed', customerName: 'Nimal Perera' });
  });

  it('a second COD order for a held last unit goes to review and holds nothing', async () => {
    const { service } = make('1');
    const { actor } = await setup(service);
    await service.submitOrder(actor, codOrder('WLK-1'), 'k1');
    const second = await service.submitOrder(actor, codOrder('WLK-2', 'bank_transfer'), 'k2');
    expect(second.status).toBe('needs_review');
    expect(String(second.reviewReason)).toMatch(/Not enough stock to hold this order: SKU WC0001 needs 1, available 0/);
    expect((await service.inventory(actor)).items[0]).toMatchObject({ committed: '1', available: '0' });
  });

  it('a paid card order cannot take a unit held for a COD order', async () => {
    const { service, posts } = make('1');
    const { actor } = await setup(service);
    await service.submitOrder(actor, codOrder('WLK-1'), 'k1');
    const card = await service.submitOrder(actor, codOrder('WLK-2', 'card', 'paid'), 'k2');
    expect(card.status).toBe('needs_review');
    expect(posts).toHaveLength(0);
  });

  it('cancel releases the hold; methods outside the list do not hold', async () => {
    const { service } = make('1');
    const { operator, connectionId, actor } = await setup(service);
    await service.submitOrder(actor, codOrder('WLK-1'), 'k1');
    const order = (await service.listWebOrders(operator, connectionId))[0]!;
    const cancelled = await service.cancelWebOrder(operator, connectionId, order.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.stock).toBe('released');
    expect((await service.inventory(actor)).items[0]).toMatchObject({ committed: '0', available: '1' });
    const other = await service.submitOrder(actor, codOrder('WLK-3', 'pay_later'), 'k3');
    expect(other.stock).toBe('none');
  });

  it('Mark paid posts the invoice and turns the hold into the stock deduction', async () => {
    const { service, posts, store } = make('1');
    const { operator, connectionId, actor } = await setup(service);
    await service.submitOrder(actor, codOrder('WLK-1'), 'k1');
    const id = (await service.listWebOrders(operator, connectionId))[0]!.id;
    const paid = await service.markWebOrderPaid(operator, connectionId, id);
    expect(paid.status).toBe('posted');
    expect(paid.stock).toBe('consumed');
    expect(posts).toEqual(['WLK-1']);
    expect(store.stock[0]!.quantity).toBe('0');
    expect((await service.inventory(actor)).items[0]).toMatchObject({ onHand: '0', committed: '0', available: '0' });
  });

  it('confirm, dispatch with tracking and delivered are visible to the website and in the change feed', async () => {
    const { service } = make('1');
    const { operator, connectionId, actor } = await setup(service);
    await service.updatePaymentSettings(operator, connectionId, {
      defaultAccountCode: null,
      methods: {},
      seenMethods: [],
      couriers: [{ name: 'City Courier', trackingUrlTemplate: 'https://track.example/{tracking}' }],
    });
    await service.submitOrder(actor, codOrder('WLK-1'), 'k1');
    const id = (await service.listWebOrders(operator, connectionId))[0]!.id;
    await service.confirmWebOrder(operator, connectionId, id);
    await service.dispatchWebOrder(operator, connectionId, id, {
      carrier: 'City Courier',
      trackingNumber: 'TRK 1',
      trackingUrlTemplate: 'https://track.example/{tracking}',
    });
    await expect(service.markWebOrderDelivered(operator, connectionId, id)).resolves.toMatchObject({ fulfilment: { status: 'delivered' } });
    const read = await service.getOrder(actor, 'WLK-1');
    expect(read.fulfilment.status).toBe('delivered');
    expect(read.fulfilment.shipments[0]).toMatchObject({ carrier: 'City Courier', trackingNumber: 'TRK 1', trackingUrl: 'https://track.example/TRK%201' });
    const changes = await service.changes(actor);
    const actions = changes.items.filter((c) => c.kind === 'order').map((c) => (c.payload as { action: string }).action);
    expect(actions).toEqual(expect.arrayContaining(['stock_held', 'confirmed', 'dispatched', 'delivered']));
    expect(changes.items.some((c) => c.kind === 'mapping')).toBe(true);
  });

  it('dispatch needs a courier and tracking number; a viewer cannot act', async () => {
    const { service } = make('1');
    const { operator, connectionId, actor } = await setup(service);
    await service.submitOrder(actor, codOrder('WLK-1'), 'k1');
    const id = (await service.listWebOrders(operator, connectionId))[0]!.id;
    await expect(service.dispatchWebOrder(operator, connectionId, id, { carrier: '', trackingNumber: 'x' })).rejects.toThrow(/courier/);
    await expect(service.dispatchWebOrder(operator, connectionId, id, { carrier: 'X', trackingNumber: ' ' })).rejects.toThrow(/tracking/);
    await expect(service.confirmWebOrder({ ...operator, canWrite: false }, connectionId, id)).rejects.toThrow();
  });

  it('refund and restock from BookOne posts a linked return and restores stock', async () => {
    const { service, returns, store } = make('1');
    const { operator, connectionId, actor } = await setup(service);
    await service.submitOrder(actor, codOrder('WLK-1', 'card', 'paid'), 'k1');
    const id = (await service.listWebOrders(operator, connectionId))[0]!.id;
    const refunded = await service.refundWebOrder(operator, connectionId, id, { restock: true });
    expect(refunded.status).toBe('refunded');
    expect(returns).toEqual(['doc-1']);
    expect(store.stock[0]!.quantity).toBe('1');
  });

  it('GET /payment-methods lists used names with settlement and hold flags', async () => {
    const { service } = make('3');
    const { operator, connectionId, actor } = await setup(service);
    await service.updatePaymentSettings(operator, connectionId, {
      defaultAccountCode: '1201',
      methods: { cod: 'unpaid', bank_transfer: '1100' },
      seenMethods: [],
    });
    await service.submitOrder(actor, codOrder('WLK-9', 'gateway-x', 'paid'), 'k9');
    const out = await service.paymentMethods(actor);
    const by = Object.fromEntries(out.items.map((m) => [m.method, m]));
    expect(by.cod).toMatchObject({ settlementAccountCode: null, settlesOnPaid: false, holdsStockWhilePending: true });
    expect(by.bank_transfer).toMatchObject({ settlementAccountCode: '1100', holdsStockWhilePending: true });
    expect(by['gateway-x']).toMatchObject({ settlementAccountCode: '1201', settlesOnPaid: true, holdsStockWhilePending: false });
  });

  it('applying a mapping emits a mapping change with the store ids', async () => {
    const { service } = make('1');
    const { actor } = await setup(service);
    const changes = await service.changes(actor);
    const mapping = changes.items.find((c) => c.kind === 'mapping');
    expect(mapping?.payload).toMatchObject({ action: 'applied', sku: 'WC0001', externalProductId: 'wc-1' });
  });
});
