/**
 * UI audit: Bank reconciliation inbox + workbench (cashbook + ERP).
 *
 * Usage (from apps/e2e-runner):
 *   set E2E_BASE_URL=https://bookone.clossyan.com
 *   set E2E_EMAIL=...
 *   set E2E_PASSWORD=...
 *   node scripts/ui-audit-bank-recon.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const baseURL = (process.env.E2E_BASE_URL || 'https://bookone.clossyan.com').replace(/\/$/, '');
const email = process.env.E2E_EMAIL || '';
const password = process.env.E2E_PASSWORD || '';
const outRoot = path.resolve(
  root,
  process.env.E2E_UI_AUDIT_DIR ||
    `ui-audit/bank-recon-${new Date().toISOString().replace(/[:.]/g, '-')}`,
);

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

async function shot(page, dir, name) {
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ✓ ${path.relative(root, file)}`);
  return file;
}

async function login(page) {
  await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForTimeout(1000);
  if (await page.getByTestId('login-form').count()) {
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
  } else {
    await page.locator('input[type="email"], input[name="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('button[type="submit"]').first().click();
  }
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  if (page.url().includes('/login')) die('Login failed — check credentials / tenant');
  console.log(`  logged in → ${page.url()}`);
}

async function safeGoto(page, urlPath) {
  const url = `${baseURL}${urlPath}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForTimeout(1500);
  return page.url();
}

async function main() {
  if (!email || !password) die('E2E_EMAIL / E2E_PASSWORD required');
  fs.mkdirSync(outRoot, { recursive: true });
  console.log(`Base: ${baseURL}`);
  console.log(`Out:  ${outRoot}`);

  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    deviceScaleFactor: 1,
  });
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  const notes = [];

  try {
    // ── Desktop ─────────────────────────────────────────────
    const page = await desktop.newPage();
    await login(page);

    await safeGoto(page, '/cashbook');
    await shot(page, outRoot, 'd-01-cashbook-home');

    await safeGoto(page, '/cashbook/bank-imports');
    await shot(page, outRoot, 'd-02-cashbook-recon-inbox');
    notes.push(`cashbook inbox: ${page.url()}`);

    // Open first session if any
    const sessionLink = page.locator('a.bih-card').first();
    if (await sessionLink.count()) {
      await sessionLink.click();
      await page.waitForTimeout(2500);
      await shot(page, outRoot, 'd-03-cashbook-workbench');
      notes.push(`cashbook workbench: ${page.url()}`);
      // Tabs
      const tabs = page.locator('button.brw-tab');
      const n = await tabs.count();
      for (let i = 0; i < Math.min(n, 5); i++) {
        await tabs.nth(i).click().catch(() => {});
        await page.waitForTimeout(800);
        const label = (await tabs.nth(i).innerText().catch(() => `tab${i}`)).replace(/\s+/g, '-').slice(0, 24);
        await shot(page, outRoot, `d-04-tab-${i}-${label}`);
      }
    } else {
      await shot(page, outRoot, 'd-03-cashbook-inbox-empty');
      notes.push('cashbook inbox empty — no session cards');
    }

    await safeGoto(page, '/cashbook/import');
    await shot(page, outRoot, 'd-05-cashbook-import-studio');

    await safeGoto(page, '/reconciliation');
    await shot(page, outRoot, 'd-06-erp-recon-inbox');
    notes.push(`erp inbox: ${page.url()}`);

    const erpCard = page.locator('a.bih-card').first();
    if (await erpCard.count()) {
      await erpCard.click();
      await page.waitForTimeout(2500);
      await shot(page, outRoot, 'd-07-erp-workbench');
      notes.push(`erp workbench: ${page.url()}`);
    } else {
      await shot(page, outRoot, 'd-07-erp-inbox-empty');
    }

    await safeGoto(page, '/reconciliation/import');
    await shot(page, outRoot, 'd-08-erp-import-studio');

    // ── Phone ───────────────────────────────────────────────
    const p2 = await phone.newPage();
    await login(p2);
    await safeGoto(p2, '/cashbook/bank-imports');
    await shot(p2, outRoot, 'p-01-cashbook-inbox');
    const pCard = p2.locator('a.bih-card').first();
    if (await pCard.count()) {
      await pCard.click();
      await p2.waitForTimeout(2000);
      await shot(p2, outRoot, 'p-02-cashbook-workbench');
    }
    await safeGoto(p2, '/reconciliation');
    await shot(p2, outRoot, 'p-03-erp-inbox');

    fs.writeFileSync(
      path.join(outRoot, 'README.txt'),
      [
        'Bank reconciliation UI audit',
        `base=${baseURL}`,
        `user=${email}`,
        `time=${new Date().toISOString()}`,
        '',
        ...notes,
      ].join('\n'),
    );
    console.log('\nDone.');
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
