import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'path';
import { connectionSetupHtml, sampleConnectionDetails } from '../src/components/agent-bridge/connection-setup-markup';

const root = path.resolve(__dirname, '../../..');

test('connections page shows public client details and stays reachable when Inbox is off', () => {
  const connections = readFileSync(
    path.join(root, 'apps/web/src/app/purchase/inbox/connections/page.tsx'),
    'utf8',
  );
  const purchase = readFileSync(path.join(root, 'apps/web/src/app/company/purchase/page.tsx'), 'utf8');
  const authorize = readFileSync(
    path.join(root, 'apps/web/src/app/api/agent-bridge/oauth/authorize/route.ts'),
    'utf8',
  );
  const jwks = readFileSync(path.join(root, 'apps/web/src/app/api/agent-bridge/oauth/jwks/route.ts'), 'utf8');
  expect(connections).not.toMatch(/if \(!flags.enabled\) redirect/);
  expect(connections).toMatch(/AgentBridgeConnectionSetup/);
  expect(connections).toMatch(/ensureOauthSigningPem/);
  expect(connections).not.toMatch(/BEGIN PRIVATE|PRIVATE KEY/);
  expect(purchase).toMatch(/Connect Codex or Claude/);
  expect(purchase).toMatch(/\/purchase\/inbox\/connections/);
  expect(authorize).toMatch(/\/login\?from=/);
  expect(jwks).toMatch(/ensureOauthSigningPem/);
});

test('connection screen shows Codex and Claude copy fields without secrets', async ({ page }) => {
  const details = sampleConnectionDetails(true);
  await page.setContent(connectionSetupHtml(details));
  await expect(page.getByRole('heading', { name: 'Connect a supported AI client' })).toBeVisible();
  await expect(page.getByLabel('Public URL')).toHaveValue('https://bookone.clossyan.com');
  await expect(page.getByLabel('Issuer')).toHaveValue('https://bookone.clossyan.com');
  await expect(page.getByLabel('JWKS URL')).toHaveValue('https://bookone.clossyan.com/api/agent-bridge/oauth/jwks');
  await expect(page.getByLabel('MCP URL')).toHaveValue('https://bookone.clossyan.com/api/agent-bridge/mcp');
  await expect(page.getByLabel('Codex client ID')).toHaveValue('bookone-codex');
  await expect(page.getByLabel('Claude client ID')).toHaveValue('bookone-claude');
  await expect(page.getByRole('textbox', { name: 'Codex CLI', exact: true })).toHaveValue(
    /oauth-client-id bookone-codex/,
  );
  await expect(page.getByRole('textbox', { name: 'Claude connector', exact: true })).toHaveValue(/bookone-claude/);
  await expect(page.getByRole('status')).toContainText('Signing is ready');
  const body = await page.content();
  expect(body).not.toMatch(/BEGIN PRIVATE|PRIVATE KEY/);
});

test('connection screen stays readable at a phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.setContent(connectionSetupHtml());
  const title = page.getByRole('heading', { name: 'Connect a supported AI client' });
  await expect(title).toBeVisible();
  const box = await title.boundingBox();
  expect(box?.width).toBeGreaterThan(200);
});
