import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'path';
import { renderConsentPage } from '../../../packages/agent-bridge/src/consent-page';

const root = path.resolve(__dirname, '../../..');

const consentHtml = renderConsentPage({
  kind: 'consent',
  clientName: 'Codex',
  companyName: 'Clossyan Demo',
  accountName: 'Owner',
  accountEmail: 'owner@example.com',
  flags: { enabled: true, draftOnly: false, postingDisabled: true },
  fields: {
    client_id: 'bookone-codex',
    redirect_uri: 'http://127.0.0.1:9/callback/abc',
    state: 's1',
    code_challenge: 'x'.repeat(43),
    code_challenge_method: 'S256',
    resource: 'https://bookone.clossyan.com/api/agent-bridge/mcp',
    scope: 'read upload draft',
  },
});

const errorHtml = renderConsentPage({
  kind: 'untrusted_redirect',
  message: 'redirect_uri is not allowed for this client. BookOne will not send you elsewhere.',
});

test('BookOne consent page is keyboard operable and names Allow/Cancel', async ({ page }) => {
  await page.setContent(consentHtml);
  await expect(page.getByRole('heading', { name: 'Connect Codex to BookOne' })).toBeVisible();
  await expect(page.getByText('Company Clossyan Demo')).toBeVisible();
  await expect(page.getByText('owner@example.com')).toBeVisible();
  const allow = page.getByRole('button', { name: 'Allow Codex to connect to BookOne' });
  const cancel = page.getByRole('button', { name: 'Cancel' });
  await expect(allow).toBeVisible();
  await expect(cancel).toBeVisible();
  await allow.focus();
  await expect(allow).toBeFocused();
  const box = await allow.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(40);
  const body = await page.content();
  expect(body).not.toMatch(/BEGIN PRIVATE|code_verifier=|access_token=/);
});

test('untrusted redirect stays on a local BookOne error page', async ({ page }) => {
  await page.setContent(errorHtml);
  await expect(page.getByRole('heading', { name: 'This connection request is not trusted' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('will not send you elsewhere');
  expect(page.url()).not.toMatch(/evil\.example/);
});

test('records BookOne-owned consent and error screenshots at 375 and 1440', async ({ page }) => {
  const out = path.join(root, 'docs/qa/ab09');
  mkdirSync(out, { recursive: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.setContent(consentHtml, { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: path.join(out, 'consent-375.png'), fullPage: true });
  await page.setContent(errorHtml, { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: path.join(out, 'error-375.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(consentHtml, { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: path.join(out, 'consent-1440.png'), fullPage: true });
  await page.setContent(errorHtml, { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: path.join(out, 'error-1440.png'), fullPage: true });
});
