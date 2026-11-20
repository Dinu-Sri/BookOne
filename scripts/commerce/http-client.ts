/**
 * Independent headless HTTP client for BookOne Commerce v1.
 * Does not import connector plugin source.
 *
 *   npx tsx scripts/commerce/http-client.ts --base URL --token TOKEN --sku SKU [--order-id ID]
 */
export type CommerceHttpResult = {
  status: number;
  json: Record<string, unknown> | null;
  retryAfter: string | null;
};

export async function commerceRequest(
  base: string,
  token: string,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<CommerceHttpResult> {
  const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'content-type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, json, retryAfter: res.headers.get('retry-after') };
}

export function paidOrder(externalId: string, sku: string, total = '1500.00') {
  return {
    externalId,
    currency: 'LKR',
    placedAt: new Date().toISOString(),
    sourceTimezone: 'Asia/Colombo',
    customer: { name: 'HTTP client' },
    lines: [{ externalLineId: `${externalId}-1`, sku, quantity: '1', unitPrice: total }],
    total,
    payment: { status: 'paid' as const, amount: total },
  };
}

export async function proveCatalogStockOrder(input: {
  base: string;
  token: string;
  sku: string;
  orderId: string;
}): Promise<{
  connection: CommerceHttpResult;
  inventoryBefore: CommerceHttpResult;
  first: CommerceHttpResult;
  replay: CommerceHttpResult;
  inventoryAfter: CommerceHttpResult;
  order: CommerceHttpResult;
}> {
  const connection = await commerceRequest(input.base, input.token, 'GET', '/connection');
  const inventoryBefore = await commerceRequest(input.base, input.token, 'GET', `/inventory?sku=${encodeURIComponent(input.sku)}`);
  const body = paidOrder(input.orderId, input.sku);
  const first = await commerceRequest(input.base, input.token, 'POST', '/orders', body, {
    'Idempotency-Key': input.orderId,
  });
  const replay = await commerceRequest(input.base, input.token, 'POST', '/orders', body, {
    'Idempotency-Key': input.orderId,
  });
  const inventoryAfter = await commerceRequest(input.base, input.token, 'GET', `/inventory?sku=${encodeURIComponent(input.sku)}`);
  const order = await commerceRequest(input.base, input.token, 'GET', `/orders/${encodeURIComponent(input.orderId)}`);
  return { connection, inventoryBefore, first, replay, inventoryAfter, order };
}

async function main() {
  const args = process.argv.slice(2);
  const get = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : '';
  };
  const base = get('base') || process.env.BOOKONE_COMMERCE_BASE || '';
  const token = get('token') || process.env.BOOKONE_COMMERCE_TOKEN || '';
  const sku = get('sku') || 'SKU-1';
  const orderId = get('order-id') || `http-${Date.now()}`;
  if (!base || !token) {
    console.error('Usage: npx tsx scripts/commerce/http-client.ts --base URL --token TOKEN --sku SKU');
    process.exit(2);
  }
  const result = await proveCatalogStockOrder({ base, token, sku, orderId });
  console.log(JSON.stringify(result, null, 2));
  if (result.connection.status !== 200 || result.first.status !== 202 || result.replay.status !== 202) {
    process.exit(1);
  }
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('http-client.ts') || entry.endsWith('http-client.js')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
