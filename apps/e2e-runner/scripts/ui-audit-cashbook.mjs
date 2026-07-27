/**
 * UI visual audit for personal / sole cashbook shells.
 *
 * Usage (from apps/e2e-runner):
 *   set E2E_BASE_URL=https://bookone.clossyan.com
 *   set E2E_EMAIL=...
 *   set E2E_PASSWORD=...
 *   node scripts/ui-audit-cashbook.mjs
 *
 * Optional:
 *   E2E_UI_AUDIT_DIR=ui-audit/out   (output folder)
 *   E2E_UI_AUDIT_SI=1               (also capture Sinhala-on states)
 *
 * Does NOT print password. Prefer a dedicated staging/test user.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const baseURL = (process.env.E2E_BASE_URL || process.env.UI_AUDIT_BASE_URL || '').replace(/\/$/, '');
const email = process.env.E2E_EMAIL || process.env.UI_AUDIT_EMAIL || '';
const password = process.env.E2E_PASSWORD || process.env.UI_AUDIT_PASSWORD || '';
const outRoot = path.resolve(
  root,
  process.env.E2E_UI_AUDIT_DIR || `ui-audit/run-${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
const captureSi = process.env.E2E_UI_AUDIT_SI === '1' || process.env.E2E_UI_AUDIT_SI === 'true';

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

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
  await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByTestId('login-form').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45_000 }).catch(() => {});
  // Allow onboarding or cashbook or home
  await page.waitForTimeout(1500);
  const url = page.url();
  if (url.includes('/login')) {
    const err = await page.locator('[role="alert"], .error, .auth-error, .onboard-error').first().textContent().catch(() => '');
    die(`Login failed — still on /login. ${err || 'Check credentials / rate limit.'}`);
  }
  console.log(`  logged in → ${url}`);
}

async function safeGoto(page, pathSuffix) {
  await page.goto(`${baseURL}${pathSuffix}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(800);
}

async function tryClickSi(page, wantOn) {
  // Toggle shows සිංහල when off, English when on
  const siBtn = page.locator('button.si-toggle, button.cashbook-si-toggle').filter({ hasText: /සිංහල|English|SI/i }).first();
  if (!(await siBtn.count())) return false;
  const text = (await siBtn.textContent()) || '';
  const isOn = /English/i.test(text) || /✓/.test(text);
  if (wantOn && !isOn) await siBtn.click();
  if (!wantOn && isOn) await siBtn.click();
  await page.waitForTimeout(400);
  return true;
}

async function auditViewport(browser, vp) {
  const dir = path.join(outRoot, vp.name);
  fs.mkdirSync(dir, { recursive: true });
  console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) ===`);

  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await login(page);
    await shot(page, dir, '01-after-login');

    // Prefer cashbook shell routes
    await safeGoto(page, '/cashbook');
    await shot(page, dir, '02-cashbook-home');

    // Open money out if tile present
    const moneyOut = page.locator('button.cashbook-tile, button').filter({ hasText: /Money Out|වියදම/i }).first();
    if (await moneyOut.count()) {
      await moneyOut.click().catch(() => {});
      await page.waitForTimeout(500);
      await shot(page, dir, '03-cashbook-entry-open');
      const close = page.locator('button, a').filter({ hasText: /Close|වසන්න/i }).first();
      if (await close.count()) await close.click().catch(() => {});
    }

    await safeGoto(page, '/cashbook/summary');
    await shot(page, dir, '04-cashbook-summary');

    await safeGoto(page, '/cashbook/settings');
    await shot(page, dir, '05-cashbook-settings');

    // Domain switch if sole
    await safeGoto(page, '/cashbook?domain=business');
    await shot(page, dir, '06-cashbook-business-domain');

    await safeGoto(page, '/cashbook?domain=personal');
    await shot(page, dir, '07-cashbook-personal-domain');

    if (captureSi) {
      await safeGoto(page, '/cashbook');
      await tryClickSi(page, true);
      await shot(page, dir, '08-cashbook-home-si');
      await safeGoto(page, '/cashbook/summary');
      await tryClickSi(page, true);
      await shot(page, dir, '09-summary-si');
      await safeGoto(page, '/cashbook/settings');
      await tryClickSi(page, true);
      await shot(page, dir, '10-settings-si');
    }

    // Full ERP home (may redirect for personal)
    await safeGoto(page, '/');
    await shot(page, dir, '11-root-home');

    // Onboarding only if pending
    if (page.url().includes('/onboarding')) {
      await shot(page, dir, '12-onboarding');
    }

    // Manifest
    const meta = {
      viewport: vp,
      finalUrl: page.url(),
      baseURL,
      email,
      capturedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  } finally {
    await context.close();
  }
}

async function main() {
  if (!baseURL) die('Set E2E_BASE_URL (e.g. https://bookone.clossyan.com)');
  if (!email || !password) die('Set E2E_EMAIL and E2E_PASSWORD (use a test user, not owner password if possible)');

  fs.mkdirSync(outRoot, { recursive: true });
  console.log('BookOne UI audit');
  console.log(`  base:   ${baseURL}`);
  console.log(`  email:  ${email}`);
  console.log(`  out:    ${outRoot}`);
  console.log(`  si:     ${captureSi ? 'yes' : 'no'}`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });

  try {
    for (const vp of VIEWPORTS) {
      await auditViewport(browser, vp);
    }
    fs.writeFileSync(
      path.join(outRoot, 'README.txt'),
      [
        'BookOne cashbook UI audit screenshots',
        `Base: ${baseURL}`,
        `User: ${email}`,
        `When: ${new Date().toISOString()}`,
        '',
        'Folders: phone / tablet / desktop',
        'Share this folder (or key PNGs) for layout review.',
      ].join('\n'),
    );
    console.log(`\nDone. Screenshots in:\n  ${outRoot}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
