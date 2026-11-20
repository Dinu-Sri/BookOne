#!/usr/bin/env node
/**
 * Server-side BookOne Commerce v1 quickstart.
 * Keep BOOKONE_COMMERCE_TOKEN off the shopper browser and out of theme files.
 *
 *   BOOKONE_COMMERCE_BASE=https://example/api/commerce/v1 \
 *   BOOKONE_COMMERCE_TOKEN=bkc_sand_prefix_secret \
 *   node docs/commerce/quickstart-node.mjs
 */
const base = String(process.env.BOOKONE_COMMERCE_BASE || '').replace(/\/$/, '');
const token = String(process.env.BOOKONE_COMMERCE_TOKEN || '');
if (!base || !token) {
  console.error('Set BOOKONE_COMMERCE_BASE and BOOKONE_COMMERCE_TOKEN on the server.');
  process.exit(1);
}

async function call(method, path, body, extra = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...extra,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const connection = await call('GET', '/connection');
console.log('connection', connection.status, connection.json?.id, connection.json?.apiVersion);

const products = await call('GET', '/products');
console.log('mapped products', products.status, products.json?.items?.length ?? 0);

const inventory = await call('GET', '/inventory');
console.log('inventory', inventory.status, inventory.json?.mode, inventory.json?.authority);

const candidates = await call('GET', '/catalog/candidates');
console.log('catalog candidates', candidates.status, candidates.json?.bootstrap, candidates.json?.mappedOnlyProductsPath);

const order = {
  externalId: process.env.BOOKONE_SAMPLE_ORDER || 'quickstart-1001',
  currency: 'LKR',
  placedAt: '2026-11-20T10:00:00.000Z',
  sourceTimezone: 'Asia/Colombo',
  customer: { name: 'Walk-in' },
  lines: [{ externalLineId: 'quickstart-1001-1', sku: 'SKU-1', quantity: '1', unitPrice: '1500.00' }],
  total: '1500.00',
  payment: { status: 'paid', method: 'card', amount: '1500.00', externalRef: 'pay_quickstart' },
};
const submitted = await call('POST', '/orders', order, { 'Idempotency-Key': order.externalId });
console.log('order submit', submitted.status, submitted.json?.status, submitted.json?.httpStatusIsNotAccountingAcceptance);
console.log('HTTP 2xx is not accounting acceptance. Read the order, inventory and journals.');

const readback = await call('GET', `/orders/${encodeURIComponent(order.externalId)}`);
console.log('order readback', readback.status, readback.json?.status, readback.json?.documentNumber);
