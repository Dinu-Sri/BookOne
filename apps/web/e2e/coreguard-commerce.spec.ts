import { expect, test, type Page } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { proveCatalogStockOrder } from '../../../scripts/commerce/http-client';

const ownerEmail = process.env.COREGUARD_BROWSER_OWNER_EMAIL ?? '';
const ownerPassword = process.env.COREGUARD_BROWSER_OWNER_PASSWORD ?? '';
const httpToken = process.env.COREGUARD_COMMERCE_HTTP_TOKEN ?? '';
const wooToken = process.env.COREGUARD_COMMERCE_WOO_TOKEN ?? '';
const base = `${process.env.AUTH_URL ?? 'http://127.0.0.1:3000'}/api/commerce/v1`;

test.skip(!ownerEmail || !httpToken, 'BLOCKED: commerce seed env is missing.');

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

test('Commerce settings support keyboard tabs and invalidate an edited mapping preview', async ({ page }) => {
  // CI diagnostics: browser errors and requests still open when a form stays busy.
  const inflight = new Map<string, string>();
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') console.log(`[browser ${msg.type()}]`, msg.text().slice(0, 400));
  });
  page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 400)));
  page.on('request', (req) => inflight.set(req.url() + '#' + req.method(), `${req.method()} ${req.url()} ${new Date().toISOString()}`));
  page.on('requestfinished', (req) => inflight.delete(req.url() + '#' + req.method()));
  page.on('requestfailed', (req) => {
    console.log('[requestfailed]', req.method(), req.url(), req.failure()?.errorText);
    inflight.delete(req.url() + '#' + req.method());
  });
  page.on('response', (res) => {
    if (res.request().method() === 'POST') console.log('[POST response]', res.status(), res.url(), JSON.stringify(res.headers()).slice(0, 300));
  });
  await login(page, ownerEmail, ownerPassword);
  await page.goto('/company/commerce');
  await expect(page.getByRole('heading', { name: 'Commerce API' })).toBeVisible();
  // v2.20.0: keys live on the Developer tab; the screen opens on Overview.
  await page.getByRole('tab', { name: 'Developer' }).click();
  await expect(page.getByRole('button', { name: 'Issue scoped key' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const overview = page.getByRole('tab', { name: 'Overview' });
  await expect(overview).toBeVisible();
  await overview.click();
  await overview.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Orders' })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Orders' })).toBeVisible();
  await page.getByRole('tab', { name: 'Orders' }).press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Products' })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Products' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply mapping' })).toBeDisabled();
  const product = page.getByRole('combobox', { name: 'BookOne product' });
  // v2.21: "Products on this store" sits above the link form, so bring the field into view first.
  await product.scrollIntoViewIfNeeded();
  await product.click();
  await page.getByRole('option', { name: /^SKU-1 ·/ }).click();
  const external = page.getByRole('textbox', { name: 'Store product ID' });
  await external.fill('ui-preview-test');
  await page.getByRole('button', { name: 'Preview mapping' }).click();
  await expect(page.getByRole('heading', { name: 'Mapping preview' })).toBeVisible();
  // Diagnostic for CI logs: the preview line says "ready to apply" or names the issue.
  console.log('mapping preview:', (await page.getByRole('status').filter({ hasText: 'Mapping preview' }).innerText()).replace(/\s+/g, ' '));
  // The submit stays busy until the server action and any router refresh finish.
  try {
    await expect(page.getByRole('button', { name: 'Apply mapping' })).toBeEnabled({ timeout: 10_000 });
  } catch (err) {
    console.log('[still in flight]', JSON.stringify([...inflight.values()]));
    console.log(
      '[busy buttons]',
      await page.evaluate(() =>
        [...document.querySelectorAll('[aria-busy="true"]')].map((el) => `${el.textContent?.trim()} in form ${el.closest('form')?.className ?? 'none'}`),
      ),
    );
    console.log('[url]', page.url());
    throw err;
  }
  await external.fill('changed-after-preview');
  await expect(page.getByRole('button', { name: 'Apply mapping' })).toBeDisabled();
  await page.getByRole('tab', { name: 'Products' }).press('End');
  await expect(page.getByRole('tabpanel', { name: 'Activity' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('headless HTTP client sells the last unit once and replays without a second post', async () => {
  const http = await proveCatalogStockOrder({
    base,
    token: httpToken,
    sku: 'SKU-1',
    orderId: `http-last-${Date.now()}`,
  });
  expect(http.connection.status).toBe(200);
  expect(http.first.status).toBe(202);
  expect(http.replay.status).toBe(202);
  expect(http.first.json?.status, String(http.first.json?.reviewReason ?? '')).toBe('posted');
  expect(http.first.json?.documentId).toBeTruthy();
  expect(http.first.json?.documentNumber).toBeTruthy();
  expect(http.replay.json?.replayed === true || http.replay.json?.documentId === http.first.json?.documentId).toBe(true);
  expect(http.replay.json?.documentId).toBe(http.first.json?.documentId);
  const before = http.inventoryBefore.json as { items?: Array<{ sku: string; quantity: string }> };
  const after = http.inventoryAfter.json as { items?: Array<{ sku: string; quantity: string }> };
  const beforeRow = before.items?.find((i) => i.sku === 'SKU-1');
  const row = after.items?.find((i) => i.sku === 'SKU-1');
  expect(beforeRow?.quantity).toBe('1');
  expect(row?.quantity).toBe('0');

  const conflict = await fetch(`${base}/orders`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${httpToken}`,
      'content-type': 'application/json',
      'Idempotency-Key': String(http.first.json && 'externalId'),
    },
    body: JSON.stringify({
      externalId: 'conflict-1',
      currency: 'LKR',
      placedAt: new Date().toISOString(),
      customer: { name: 'HTTP' },
      lines: [{ externalLineId: 'c-1', sku: 'SKU-1', quantity: '1', unitPrice: '9.99' }],
      total: '1.00',
      payment: { status: 'paid' },
    }),
  });
  expect([202, 409, 422].includes(conflict.status)).toBe(true);

  const reservations = await fetch(`${base}/reservations`, {
    method: 'POST',
    headers: { authorization: `Bearer ${httpToken}`, 'content-type': 'application/json' },
    body: '{}',
  });
  expect(reservations.status).toBe(422);

  const other = await fetch(`${base}/connection`, { headers: { authorization: `Bearer ${wooToken || 'bkc_sand_nope_nope'}` } });
  expect([200, 401, 403].includes(other.status)).toBe(true);

  const root = process.env.COREGUARD_ROOT || path.resolve(__dirname, '../../..');
  const dir = path.join(root, '.local');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'commerce-results.json'),
    JSON.stringify(
      {
        httpLastUnit: {
          firstStatus: http.first.status,
          replayStatus: http.replay.status,
          orderStatus: http.first.json?.status,
          documentId: http.first.json?.documentId ?? null,
          documentNumber: http.first.json?.documentNumber ?? null,
          remaining: row?.quantity ?? null,
          settlement: http.first.json?.settlement ?? null,
        },
        reservations: reservations.status,
        ranAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
});

test('WP3-WP7 over HTTP: health, reservations, webhooks, customers, orders and stats', async () => {
  const { createServer } = await import('node:http');
  const { verifyWebhook } = await import('../../../packages/commerce/src/webhooks');
  const call = async (method: string, p: string, body?: unknown, extra?: Record<string, string>) => {
    const res = await fetch(`${base}${p}`, {
      method,
      headers: { authorization: `Bearer ${httpToken}`, 'content-type': 'application/json', ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, any> | null };
  };

  const health = await fetch(`${base}/health`);
  expect(health.status).toBe(200);
  expect(((await health.json()) as { apiVersion: string }).apiVersion).toBe('v1');

  // WP3: reservation (stock may already be sold by the previous test, so held or released).
  const res = await call('POST', '/reservations', { externalId: `chk-${Date.now()}`, lines: [{ sku: 'SKU-1', quantity: '1' }], ttlSeconds: 120 });
  expect(res.status, JSON.stringify(res.json)).toBe(201);
  expect(['active', 'released']).toContain(res.json?.status);
  const got = await call('GET', `/reservations/${res.json?.reservationId}`);
  expect(got.status).toBe(200);
  const released = await call('DELETE', `/reservations/${res.json?.reservationId}`);
  expect(released.status).toBe(200);
  expect(released.json?.status).toBe('released');

  const inv = await call('GET', '/inventory?sku=SKU-1');
  expect(inv.status).toBe(200);
  expect(inv.json?.items?.[0]).toHaveProperty('incoming');

  // WP4: webhook to a local receiver; the test delivery arrives signed.
  const received: Array<{ body: string; signature: string }> = [];
  const server = createServer((req, resp) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      received.push({ body: data, signature: String(req.headers['x-bookone-signature'] ?? '') });
      resp.writeHead(200).end('ok');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  try {
    const hook = await call('POST', '/webhooks', { url: `http://127.0.0.1:${port}/hook`, kinds: ['reservation', 'customer'] });
    expect(hook.status, JSON.stringify(hook.json)).toBe(201);
    const secret = String(hook.json?.secret);
    expect(secret).toMatch(/^whsec_/);
    expect((await call('GET', '/webhooks')).json?.items?.length).toBeGreaterThan(0);
    expect((await call('POST', `/webhooks/${hook.json?.id}/test`)).status).toBe(202);
    await expect.poll(() => received.length, { timeout: 30_000, intervals: [1000] }).toBeGreaterThan(0);
    const ping = received.find((r) => r.body.includes('"ping"')) ?? received[0]!;
    expect(verifyWebhook(secret, ping.signature, ping.body)).toBe(true);
    const log = await call('GET', `/webhooks/${hook.json?.id}/deliveries`);
    expect(log.status).toBe(200);
    expect((await call('DELETE', `/webhooks/${hook.json?.id}`)).status).toBe(200);
  } finally {
    server.close();
  }

  // WP6: customers (idempotent PUT with Idempotency-Key).
  const cust = await call('PUT', '/customers/http-cust-1', { name: 'HTTP Customer', email: 'http.customer@example.com', phone: '+94770000001' }, { 'Idempotency-Key': 'cust-1' });
  expect(cust.status, JSON.stringify(cust.json)).toBe(200);
  const replay = await call('PUT', '/customers/http-cust-1', { name: 'HTTP Customer', email: 'http.customer@example.com', phone: '+94770000001' }, { 'Idempotency-Key': 'cust-1' });
  expect(replay.json?.replayed).toBe(true);
  expect((await call('GET', `/customers/${cust.json?.customerId}`)).status).toBe(200);
  expect((await call('GET', `/customers/${cust.json?.customerId}/orders`)).status).toBe(200);

  // WP5: order list, full order view and invoice link.
  const orders = await call('GET', '/orders?updatedSince=2020-01-01T00:00:00Z');
  expect(orders.status).toBe(200);
  const posted = (orders.json?.items ?? []).find((o: { invoice: unknown }) => o.invoice);
  if (posted) {
    const invoice = await call('GET', `/orders/${encodeURIComponent(posted.externalId)}/invoice`);
    expect(invoice.status, JSON.stringify(invoice.json)).toBe(200);
    expect(String(invoice.json?.pdfUrl)).toContain('/i/');
  }

  // WP4/WP7: filtered feed and stats.
  const feed = await call('GET', '/changes?kinds=reservation,customer');
  expect(feed.status).toBe(200);
  expect((feed.json?.items ?? []).every((i: { kind: string }) => ['reservation', 'customer'].includes(i.kind))).toBe(true);
  const stats = await call('GET', '/catalog/products?scope=all&include=stats');
  expect(stats.status).toBe(200);
  const conn = await call('GET', '/connection');
  expect(conn.json?.capabilities?.reservations).toBe(true);
});
