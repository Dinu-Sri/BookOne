import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'path';
import { connectionSetupHtml, sampleConnectionDetails } from '../src/components/agent-bridge/connection-setup-markup';
import { buildConnectionPromptBundle } from '../../../packages/agent-bridge/src/connection-prompts';

const root = path.resolve(__dirname, '../../..');

test('Company AgentBridge is the canonical connection screen and keeps AB-07 login public', () => {
  const page = readFileSync(path.join(root, 'apps/web/src/app/company/agent-bridge/page.tsx'), 'utf8');
  const client = readFileSync(
    path.join(root, 'apps/web/src/components/agent-bridge/company-agent-bridge.tsx'),
    'utf8',
  );
  const purchase = readFileSync(path.join(root, 'apps/web/src/app/company/purchase/page.tsx'), 'utf8');
  const legacy = readFileSync(
    path.join(root, 'apps/web/src/app/purchase/inbox/connections/page.tsx'),
    'utf8',
  );
  const nav = readFileSync(path.join(root, 'apps/web/src/lib/nav-suites.ts'), 'utf8');
  const authorize = readFileSync(
    path.join(root, 'apps/web/src/app/api/agent-bridge/oauth/authorize/route.ts'),
    'utf8',
  );
  const jwks = readFileSync(path.join(root, 'apps/web/src/app/api/agent-bridge/oauth/jwks/route.ts'), 'utf8');
  const middleware = readFileSync(path.join(root, 'apps/web/src/middleware.ts'), 'utf8');
  const authorizeAlias = readFileSync(path.join(root, 'apps/web/src/app/authorize/route.ts'), 'utf8');
  expect(page).toMatch(/CompanyAgentBridge/);
  expect(page).toMatch(/ensureOauthSigningPem/);
  expect(page).toMatch(/buildConnectionPromptBundle/);
  expect(page).not.toMatch(/BEGIN PRIVATE|PRIVATE KEY/);
  expect(client).not.toMatch(/from ['"]@bookone\/agent-bridge['"]/);
  expect(client).toMatch(/Copy connection prompt/);
  expect(purchase).not.toMatch(/name="agentBridgeEnabled"/);
  expect(purchase).toMatch(/\/company\/agent-bridge/);
  expect(legacy).toMatch(/redirect\('\/company\/agent-bridge'\)/);
  expect(legacy).not.toMatch(/if \(!flags.enabled\) redirect/);
  expect(nav).toMatch(/label: 'AgentBridge'/);
  expect(nav).toMatch(/href: '\/company\/agent-bridge'/);
  expect(authorize).toMatch(/\/login\?from=/);
  expect(jwks).toMatch(/ensureOauthSigningPem/);
  expect(middleware).toMatch(/pathname === '\/authorize'/);
  expect(middleware).toMatch(/\/api\/agent-bridge\//);
  expect(authorizeAlias).toMatch(/api\/agent-bridge\/oauth\/authorize/);
});

test('connection screen shows Codex and Claude prompts without secrets', async ({ page }) => {
  const details = sampleConnectionDetails(true);
  const bundle = buildConnectionPromptBundle(details.publicUrl, true);
  await page.setContent(connectionSetupHtml(details));
  await expect(page.getByRole('heading', { name: 'AgentBridge', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Connect with Codex' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Connect with Claude' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy connection prompt' })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Save AgentBridge settings' })).toBeVisible();
  const codex = page.getByLabel('Connect with Codex prompt');
  const claude = page.getByLabel('Connect with Claude prompt');
  await expect(codex).toHaveValue(bundle.prompts[0].prompt);
  await expect(claude).toHaveValue(bundle.prompts[1].prompt);
  await expect(codex).toHaveValue(/oauth-client-id bookone-codex/);
  await expect(claude).toHaveValue(/bookone-claude/);
  await expect(page.getByText(/Copying a connection prompt does not itself connect/)).toBeVisible();
  // Long prompts are folded: visible on request, never required to read the screen.
  await expect(codex).toBeHidden();
  await expect(page.getByRole('switch', { name: 'Allow AI assistants for this company' })).toBeVisible();
  const body = await page.content();
  expect(body).not.toMatch(/BEGIN PRIVATE|PRIVATE KEY/);
  expect(body).not.toMatch(/client_secret=/);
  expect(await page.getByRole('heading', { name: /Connect with / }).count()).toBe(2);
});

test('connection screen stays readable at a phone width and stacks the two prompts', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.setContent(connectionSetupHtml());
  const title = page.getByRole('heading', { name: 'AgentBridge', level: 1 });
  await expect(title).toBeVisible();
  const box = await title.boundingBox();
  expect(box?.width).toBeGreaterThan(200);
  const save = page.getByRole('button', { name: 'Save AgentBridge settings' });
  await expect(save).toBeVisible();
  const saveBox = await save.boundingBox();
  expect(saveBox?.y).toBeGreaterThan(0);
  const cards = page.locator('.ab-prompt-card');
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect(first && second).toBeTruthy();
  expect((second?.y ?? 0) > (first?.y ?? 0) + 40).toBeTruthy();
});

test('desktop width places Codex and Claude prompts side by side', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.setContent(connectionSetupHtml());
  const cards = page.locator('.ab-prompt-card');
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect(first && second).toBeTruthy();
  expect(Math.abs((first?.y ?? 0) - (second?.y ?? 0))).toBeLessThan(8);
  expect((second?.x ?? 0) > (first?.x ?? 0) + 100).toBeTruthy();
});

test('records 375 and 1440 screenshots', async ({ page }) => {
  const out = path.join(root, 'docs/qa/ab08');
  mkdirSync(out, { recursive: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.setContent(connectionSetupHtml(), { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: path.join(out, 'agent-bridge-375.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(connectionSetupHtml(), { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: path.join(out, 'agent-bridge-1440.png'), fullPage: true });
});
