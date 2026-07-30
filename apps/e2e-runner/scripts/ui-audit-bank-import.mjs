/**
 * UI audit: Smart Bank Import Studio steps + screenshots.
 *
 * Usage (from apps/e2e-runner):
 *   set E2E_BASE_URL=https://bookone.clossyan.com
 *   set E2E_EMAIL=...
 *   set E2E_PASSWORD=...
 *   set E2E_BANK_XLSX=C:\Users\dinus\Downloads\Statement.xlsx
 *   set E2E_BANK_XLS=C:\Users\dinus\Downloads\42504_SRReport_1785226727445.xls
 *   node scripts/ui-audit-bank-import.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const baseURL = (process.env.E2E_BASE_URL || '').replace(/\/$/, '');
const email = process.env.E2E_EMAIL || '';
const password = process.env.E2E_PASSWORD || '';
const xlsx = process.env.E2E_BANK_XLSX || '';
const xls = process.env.E2E_BANK_XLS || '';
const outRoot = path.resolve(
  root,
  process.env.E2E_UI_AUDIT_DIR || `ui-audit/bank-import-${new Date().toISOString().replace(/[:.]/g, '-')}`,
);

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

async function shot(page, dir, name) {
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ✓ ${path.relative(root, file)}`);
}

async function login(page) {
  await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(800);
  // Prefer testids; fall back to common inputs
  const form = page.getByTestId('login-form');
  if (await form.count()) {
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
  } else {
    await page.locator('input[type="email"], input[name="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('button[type="submit"]').first().click();
  }
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  if (page.url().includes('/login')) die('Login failed');
  console.log(`  logged in → ${page.url()}`);
}

async function clickNext(page) {
  const btn = page.locator('button.bis-btn.primary').filter({ hasText: /Next|Review|Import|Continue|…/i }).first();
  if (await btn.count()) {
    await btn.click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(700);
    return true;
  }
  return false;
}

async function walkImport(page, dir, filePath, tag) {
  const prefix = tag;
  console.log(`\n--- file ${tag}: ${path.basename(filePath)} ---`);
  await page.goto(`${baseURL}/cashbook/import`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(1200);
  await shot(page, dir, `${prefix}-01-upload`);

  // Upload via file input
  const input = page.locator('input[type="file"]').first();
  if (!(await input.count())) {
    await shot(page, dir, `${prefix}-99-no-file-input`);
    console.log('  no file input');
    return;
  }
  await input.setInputFiles(filePath);
  await page.waitForTimeout(2500);
  await shot(page, dir, `${prefix}-02-after-upload`);

  // Account step if present
  const bankCards = page.locator('button.bis-card');
  if ((await bankCards.count()) > 0 && (await page.getByText(/Which bank|බැංකු/i).count())) {
    await bankCards.first().click().catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, dir, `${prefix}-03-account`);
    await clickNext(page);
    await page.waitForTimeout(800);
  }

  // Sheet step
  if (await page.getByText(/Which sheet|sheet/i).count()) {
    await shot(page, dir, `${prefix}-04-sheet`);
    const sheets = page.locator('button.bis-card');
    if (await sheets.count()) await sheets.first().click().catch(() => {});
    await clickNext(page);
    await page.waitForTimeout(2500);
  }

  // Mapping steps with grid
  const steps = ['05-table', '06-date', '07-details', '08-money', '09-review'];
  for (const name of steps) {
    await page.waitForTimeout(600);
    await shot(page, dir, `${prefix}-${name}`);
    // Prefer clicking Next unless Import
    const importBtn = page.locator('button.bis-btn.primary').filter({ hasText: /^Import$/i });
    if (await importBtn.count()) {
      await shot(page, dir, `${prefix}-10-ready-import`);
      // Don't commit real data in audit — stop
      break;
    }
    const advanced = await clickNext(page);
    if (!advanced) break;
    await page.waitForTimeout(900);
  }

  // Capture scroll metrics
  const metrics = await page.evaluate(() => ({
    scrollH: document.documentElement.scrollHeight,
    clientH: document.documentElement.clientHeight,
    bodyScroll: document.body.scrollHeight,
    bisH: document.querySelector('.bis-workspace')?.getBoundingClientRect().height ?? null,
    paneStepH: document.querySelector('.bis-pane-step')?.scrollHeight ?? null,
    paneStepClient: document.querySelector('.bis-pane-step')?.clientHeight ?? null,
  }));
  fs.writeFileSync(path.join(dir, `${prefix}-metrics.json`), JSON.stringify(metrics, null, 2));
  console.log('  metrics', metrics);
}

async function main() {
  if (!baseURL) die('E2E_BASE_URL required');
  if (!email || !password) die('E2E_EMAIL / E2E_PASSWORD required');
  fs.mkdirSync(outRoot, { recursive: true });
  console.log(`Output: ${outRoot}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1360, height: 800 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await login(page);
    await page.goto(`${baseURL}/cashbook`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(1000);
    await shot(page, outRoot, '00-cashbook-home');

    if (xlsx && fs.existsSync(xlsx)) {
      await walkImport(page, outRoot, xlsx, 'sampath');
    } else {
      console.log('skip xlsx — missing path');
    }

    if (xls && fs.existsSync(xls)) {
      await walkImport(page, outRoot, xls, 'hnb');
    } else {
      console.log('skip xls — missing path');
    }

    fs.writeFileSync(
      path.join(outRoot, 'README.txt'),
      `Bank import UI audit\nbase=${baseURL}\nuser=${email}\n`,
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
