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
  await login(page, ownerEmail, ownerPassword);
  await page.goto('/company/commerce');
  await expect(page.getByRole('heading', { name: 'Commerce Integrations' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Issue scoped key' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const connections = page.getByRole('tab', { name: 'Connections' });
  await expect(connections).toBeVisible();
  await connections.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Mapping' })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Mapping' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply mapping' })).toBeDisabled();
  const product = page.getByRole('combobox', { name: 'BookOne product' });
  await product.click();
  await page.getByRole('option', { name: /^SKU-1 ·/ }).click();
  const external = page.getByRole('textbox', { name: 'Store product ID' });
  await external.fill('ui-preview-test');
  await page.getByRole('button', { name: 'Preview mapping' }).click();
  await expect(page.getByRole('heading', { name: 'Mapping preview' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply mapping' })).toBeEnabled();
  await external.fill('changed-after-preview');
  await expect(page.getByRole('button', { name: 'Apply mapping' })).toBeDisabled();
  await page.getByRole('tab', { name: 'Mapping' }).press('End');
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
