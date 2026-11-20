import { describe, expect, it } from 'vitest';
import { CommerceError } from '../src/errors';
import { MemoryCommerceStore } from '../src/memory-store';
import { COMMERCE_OPENAPI } from '../src/openapi';
import { CommerceService } from '../src/service';
import { COMMERCE_PLUGIN_VERSION } from '../src/types';
import type { OrderInput, PostedDocument, PostingPort } from '../src/types';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const pepper = 'test-pepper';
const tenantId = '11111111-1111-1111-1111-111111111111';
const userId = '22222222-2222-2222-2222-222222222222';
const productId = '33333333-3333-3333-3333-333333333333';
const variantId = '66666666-6666-6666-6666-666666666666';
const archivedId = '77777777-7777-7777-7777-777777777777';
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

function make() {
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
  store.seedProduct(
    {
      id: variantId,
      sku: 'SKU-VAR',
      name: 'Pilot mug blue',
      unit: 'each',
      productType: 'physical',
      isActive: true,
      archived: false,
      sellPrice: '1600.00',
      revision: 1,
    },
    {
      productId: variantId,
      sku: 'SKU-VAR',
      locationId,
      quantity: '2',
      revision: 1,
      asOf: new Date().toISOString(),
      stale: false,
    },
  );
  store.seedProduct(
    {
      id: archivedId,
      sku: 'SKU-OLD',
      name: 'Retired mug',
      unit: 'each',
      productType: 'physical',
      isActive: false,
      archived: true,
      sellPrice: '100.00',
      revision: 1,
    },
    {
      productId: archivedId,
      sku: 'SKU-OLD',
      locationId,
      quantity: '0',
      revision: 1,
      asOf: new Date().toISOString(),
      stale: false,
    },
  );
  const posts: PostedDocument[] = [];
  const posting: PostingPort = {
    async postSalesInvoice() {
      const doc = { documentId: `doc-${posts.length + 1}`, documentNumber: `INV-${posts.length + 1}` };
      posts.push(doc);
      const current = store.stock[0]!;
      current.quantity = String(Number(current.quantity) - 1);
      return doc;
    },
    async postSalesReturn() {
      return { documentId: 'ret-1', documentNumber: 'SR-1' };
    },
  };
  return { store, service: new CommerceService(store, pepper, posting), posts };
}

describe('commerce mapping proposals and BookOne-first catalog', () => {
  it('classifies SKU as a search aid and keeps store IDs as the durable link', async () => {
    const { service } = make();
    const operator = { tenantId, userId, canWrite: true };
    const connection = await service.createConnection(operator, {
      name: 'HTTP',
      kind: 'custom_website',
      environment: 'sandbox',
      locationId,
    });
    const preview = await service.previewMappingObservations(operator, connection.id, [
      { sku: 'SKU-1', externalProductId: 'woo-12', origin: 'agent' },
      { sku: 'SKU-1', externalProductId: '', origin: 'agent' },
      { sku: 'NOPE', externalProductId: 'woo-99', origin: 'verified_store' },
      { sku: 'SKU-OLD', externalProductId: 'woo-old', origin: 'agent' },
      { sku: 'SKU-1', externalProductId: 'woo-dup', origin: 'agent' },
    ]);
    expect(preview.items.map((row) => row.kind)).toEqual(['suggested', 'missing', 'missing', 'unsupported', 'suggested']);
    expect(preview.items[0]?.bookoneProductId).toBe(productId);
    expect(preview.items[0]?.reason).toMatch(/not verified store data/);
    expect(preview.items[1]?.reason).toMatch(/Store product ID is required/);

    await service.applyMappings(operator, connection.id, [
      { bookoneProductId: productId, sku: 'SKU-1', externalProductId: 'woo-12' },
    ]);
    const again = await service.previewMappingObservations(operator, connection.id, [
      { sku: 'SKU-1', externalProductId: 'woo-12', origin: 'verified_store' },
      { sku: 'SKU-VAR', externalProductId: 'woo-12', origin: 'agent' },
      { sku: 'SKU-VAR', externalProductId: 'woo-22', origin: 'verified_store' },
    ]);
    expect(again.items[0]?.kind).toBe('unchanged');
    expect(again.items[1]?.kind).toBe('conflicting');
    expect(again.items[2]?.kind).toBe('suggested');
  });

  it('saves a proposal, revalidates on apply, and replays an already-applied receipt', async () => {
    const { service } = make();
    const operator = { tenantId, userId, canWrite: true };
    const viewer = { tenantId, userId: 'viewer', canWrite: false };
    const connection = await service.createConnection(operator, {
      name: 'HTTP',
      kind: 'custom_website',
      environment: 'sandbox',
      locationId,
    });
    await expect(
      service.saveMappingProposal(viewer, connection.id, [{ sku: 'SKU-1', externalProductId: 'woo-12', origin: 'agent' }]),
    ).rejects.toBeInstanceOf(CommerceError);

    const proposal = await service.saveMappingProposal(operator, connection.id, [
      { sku: 'SKU-1', externalProductId: 'woo-12', origin: 'agent' },
    ]);
    expect(proposal.status).toBe('proposed');
    const applied = await service.applyMappingProposal(operator, connection.id, proposal.id);
    expect(applied.applied).toBe(1);
    expect(applied.replayed).toBe(false);
    const replay = await service.applyMappingProposal(operator, connection.id, proposal.id);
    expect(replay.replayed).toBe(true);

    const stale = await service.saveMappingProposal(operator, connection.id, [
      { sku: 'SKU-VAR', externalProductId: 'woo-22', origin: 'agent' },
    ]);
    await service.applyMappings(operator, connection.id, [
      { bookoneProductId: variantId, sku: 'SKU-VAR', externalProductId: 'woo-99' },
    ]);
    await expect(service.applyMappingProposal(operator, connection.id, stale.id)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('keeps GET /products mapped-only and bootstraps through queued claims plus acknowledge', async () => {
    const { service } = make();
    const operator = { tenantId, userId, canWrite: true };
    const connection = await service.createConnection(operator, {
      name: 'HTTP',
      kind: 'custom_website',
      environment: 'sandbox',
      locationId,
    });
    const issued = await service.issueCredential(operator, connection.id, ['catalog', 'inventory', 'order']);
    const actor = await service.authenticate(`Bearer ${issued.token}`);
    const emptyProducts = await service.products(actor);
    expect(emptyProducts.items).toEqual([]);
    const idle = await service.catalogCandidates(actor);
    expect(idle.bootstrap).toBe('idle');
    expect(idle.mappedOnlyProductsPath).toBe('/products');

    const preview = await service.previewPublish(operator, connection.id, [productId, variantId, archivedId]);
    expect(preview.items.find((row) => row.bookoneProductId === productId)?.kind).toBe('create');
    expect(preview.items.find((row) => row.bookoneProductId === archivedId)?.kind).toBe('unsupported');
    expect(preview.defaultWooStatus).toBe('draft');

    const queued = await service.queuePublish(operator, connection.id, [productId, variantId]);
    expect(queued.queued).toBe(2);
    const again = await service.queuePublish(operator, connection.id, [productId]);
    expect(again.claims[0]?.id).toBe(queued.claims[0]?.id);

    const candidates = await service.catalogCandidates(actor);
    expect(candidates.bootstrap).toBe('queued');
    expect(candidates.items).toHaveLength(2);
    const stillMappedOnly = await service.products(actor);
    expect(stillMappedOnly.items).toEqual([]);

    const ack = await service.acknowledgeCatalog(actor, [
      { bookoneProductId: productId, externalProductId: 'site-12' },
    ]);
    expect(ack.items[0]?.status).toBe('acknowledged');
    const replayAck = await service.acknowledgeCatalog(actor, [
      { bookoneProductId: productId, externalProductId: 'site-12' },
    ]);
    expect(replayAck.items[0]?.replayed).toBe(true);
    await expect(
      service.acknowledgeCatalog(actor, [{ bookoneProductId: productId, externalProductId: 'site-OTHER' }]),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const mapped = await service.products(actor);
    expect(mapped.items).toHaveLength(1);
    expect(mapped.items[0]?.externalProductId).toBe('site-12');
  });

  it('posts one document after bootstrap mapping and refuses a second create for the same BookOne id', async () => {
    const { service, posts } = make();
    const operator = { tenantId, userId, canWrite: true };
    const connection = await service.createConnection(operator, {
      name: 'HTTP',
      kind: 'custom_website',
      environment: 'sandbox',
      locationId,
    });
    await service.updateConnection(operator, connection.id, { postingMode: 'posting' });
    await service.queuePublish(operator, connection.id, [productId]);
    const issued = await service.issueCredential(operator, connection.id);
    const actor = await service.authenticate(`Bearer ${issued.token}`);
    await service.acknowledgeCatalog(actor, [{ bookoneProductId: productId, externalProductId: 'site-12' }]);
    const first = await service.submitOrder(actor, paidOrder('boot-1'), 'boot-1');
    expect(first.status).toBe('posted');
    expect(posts).toHaveLength(1);
    const replay = await service.submitOrder(actor, paidOrder('boot-1'), 'boot-1');
    expect(replay.replayed).toBe(true);
    expect(posts).toHaveLength(1);
  });

  it('keeps OpenAPI 3.1, catalog routes, complete error enum and plugin 1.2.0', () => {
    expect(COMMERCE_PLUGIN_VERSION).toBe('1.2.0');
    expect(COMMERCE_OPENAPI.openapi).toBe('3.1.0');
    expect(COMMERCE_OPENAPI.paths['/catalog/candidates']).toBeTruthy();
    expect(COMMERCE_OPENAPI.paths['/catalog/acknowledge']).toBeTruthy();
    expect(COMMERCE_OPENAPI.components.schemas.Error.properties.code.enum).toContain('RESERVATION_DISABLED');
    expect(COMMERCE_OPENAPI.components.schemas.Order.properties.payment.properties.externalRef).toBeTruthy();
    expect(COMMERCE_OPENAPI.components.schemas.OrderReceipt.required).toContain('httpStatusIsNotAccountingAcceptance');
    const yaml = readFileSync(path.resolve(__dirname, '../../../docs/commerce/openapi.yaml'), 'utf8');
    expect(yaml).toMatch(/openapi: ['"]?3\.1\.0/);
    expect(yaml).toMatch(/\/catalog\/candidates/);
    expect(yaml).toMatch(/\/catalog\/acknowledge/);
    expect(yaml).toMatch(/RESERVATION_DISABLED/);
    expect(yaml).toMatch(/httpStatusIsNotAccountingAcceptance/);
    expect(yaml).toMatch(/externalRef/);
  });
});
