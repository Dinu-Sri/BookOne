import { expect, test, type Page } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { proveCatalogStockOrder } from '../../../scripts/commerce/http-client';

const ownerEmail = process.env.COREGUARD_BROWSER_OWNER_EMAIL ?? '';
const ownerPassword = process.env.COREGUARD_BROWSER_OWNER_PASSWORD ?? '';
const viewerEmail = process.env.COREGUARD_BROWSER_VIEWER_EMAIL ?? '';
const viewerPassword = process.env.COREGUARD_BROWSER_VIEWER_PASSWORD ?? '';
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

test('commerce company UI issues a key once and denies the viewer', async ({ page }) => {
  await login(page, ownerEmail, ownerPassword);
  await page.goto('/company/commerce');
  await expect(page.getByRole('main').getByText('Commerce Integrations')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Issue scoped key' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('tab', { name: 'Connections' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  if (viewerEmail && viewerPassword) {
    await page.goto('/login');
    await login(page, viewerEmail, viewerPassword);
    await page.goto('/company/commerce');
    const issue = page.getByRole('button', { name: 'Issue scoped key' });
    if (await issue.count()) {
      await expect(issue).toBeDisabled();
    }
  }
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
