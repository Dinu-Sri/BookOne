/**
 * End-to-end bank reconciliation demo.
 *
 * 1) Login
 * 2) Optionally create a new company (control-room) when E2E_CREATE_COMPANY=1
 * 3) Ensure cashbook / onboarding (personal)
 * 4) Post 6 demo book entries from fixtures
 * 5) Import bank-statement.csv through Import Studio (commit)
 * 6) Open Bank reconciliation, refresh, confirm matches, handle add/waiting
 * 7) Screenshots + result.json
 *
 * Usage (apps/e2e-runner):
 *   set E2E_BASE_URL=https://bookone.clossyan.com
 *   set E2E_EMAIL=info@clossyan.com
 *   set E2E_PASSWORD=...
 *   set E2E_CREATE_COMPANY=1
 *   node scripts/e2e-bank-recon-demo.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const fixtures = path.join(root, 'fixtures', 'bank-recon-demo');
const baseURL = (process.env.E2E_BASE_URL || 'https://bookone.clossyan.com').replace(/\/$/, '');
const email = process.env.E2E_EMAIL || '';
const password = process.env.E2E_PASSWORD || '';
const createCompany = process.env.E2E_CREATE_COMPANY === '1' || process.env.E2E_CREATE_COMPANY === 'true';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outRoot = path.resolve(root, process.env.E2E_UI_AUDIT_DIR || `ui-audit/bank-recon-demo-${stamp}`);

const bookEntries = JSON.parse(
  fs.readFileSync(path.join(fixtures, 'book-entries.json'), 'utf8'),
).entries;
const bankFile = [
  path.join(fixtures, 'bank-statement.csv'),
  path.join(fixtures, 'bank-statement.xlsx'),
  path.join(fixtures, 'bank-statement.xls'),
].find((p) => fs.existsSync(p));

const result = {
  startedAt: new Date().toISOString(),
  baseURL,
  email,
  createCompany,
  bankFile: bankFile ? path.basename(bankFile) : null,
  steps: [],
  errors: [],
  chips: null,
  urls: {},
};

function die(msg) {
  console.error(`ERROR: ${msg}`);
  result.errors.push(msg);
  writeResult();
  process.exit(1);
}

function log(step, detail = '') {
  const line = detail ? `${step}: ${detail}` : step;
  console.log(`  · ${line}`);
  result.steps.push({ step, detail, at: new Date().toISOString() });
}

function writeResult() {
  fs.mkdirSync(outRoot, { recursive: true });
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outRoot, 'result.json'), JSON.stringify(result, null, 2));
}

async function shot(page, name) {
  const file = path.join(outRoot, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  console.log(`  ✓ ${path.relative(root, file)}`);
}

async function login(page) {
  await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForTimeout(800);
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
  if (page.url().includes('/login')) die('Login failed');
  log('login', page.url());
  result.urls.afterLogin = page.url();
}

async function maybeCreateCompany(page) {
  if (!createCompany) {
    log('createCompany', 'skipped (E2E_CREATE_COMPANY not set)');
    return;
  }
  const name = `Recon Demo ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
  await page.goto(`${baseURL}/control-room/companies/new`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
  await shot(page, '01-company-new');

  if (page.url().includes('/login') || (await page.getByText(/not allowed|forbidden|access/i).count())) {
    log('createCompany', 'control-room not accessible — continue with current workspace');
    await shot(page, '01-company-no-access');
    return;
  }

  const nameInput = page.locator('#name, input[name="name"]').first();
  if (!(await nameInput.count())) {
    log('createCompany', 'no name field — skip');
    return;
  }
  await nameInput.fill(name);
  // Staging preferred for test data
  const env = page.locator('#environment, select[name="environment"]');
  if (await env.count()) await env.selectOption('staging').catch(() => {});

  // Owner tab if present
  const ownerTab = page.getByRole('tab', { name: /owner/i });
  if (await ownerTab.count()) {
    await ownerTab.click().catch(() => {});
    await page.locator('#ownerName, input[name="ownerName"]').fill('Demo Owner').catch(() => {});
    await page.locator('#ownerEmail, input[name="ownerEmail"]').fill(email).catch(() => {});
  }

  const submit = page.getByRole('button', { name: /create|save|submit/i }).first();
  if (await submit.count()) {
    await submit.click();
    await page.waitForTimeout(3000);
  }
  await shot(page, '02-company-created');
  log('createCompany', name);
  result.companyName = name;
}

async function ensureCashbook(page) {
  await page.goto(`${baseURL}/cashbook`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(1500);

  // Onboarding tiles
  if (await page.getByText(/What are you using BookOne for/i).count()) {
    log('onboarding', 'selecting personal');
    const personal = page.locator('button.onboard-tile').filter({ hasText: /Personal|my money/i }).first();
    if (await personal.count()) await personal.click();
    else await page.locator('button.onboard-tile').first().click();
    await page.getByRole('button', { name: /continue|get started|start/i }).click().catch(() => {});
    await page.waitForTimeout(2000);
    await page.goto(`${baseURL}/cashbook`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1500);
  }
  await shot(page, '03-cashbook-home');
  log('cashbook', page.url());
}

/** Pick YYYY-MM-DD in BookOne DateField calendar widget inside .cb-sheet */
async function pickDateField(page, iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const targetMonth = new Date(y, m - 1, 1);
  const trigger = page.locator('.cb-sheet .date-trigger, .cb-sheet button.date-trigger').first();
  if (!(await trigger.count())) return false;
  await trigger.click();
  await page.waitForTimeout(200);
  // Navigate months (max 24 steps)
  for (let i = 0; i < 24; i++) {
    const head = await page.locator('.date-menu-head strong, .date-menu strong').first().innerText().catch(() => '');
    const view = new Date(head); // e.g. "July 2026"
    if (!Number.isNaN(view.getTime()) && view.getFullYear() === y && view.getMonth() === m - 1) break;
    // Compare via label parse
    const want = targetMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    if (head && head.trim() === want) break;
    // Decide direction
    const headDate = Date.parse(head + ' 1');
    const wantDate = targetMonth.getTime();
    if (!Number.isNaN(headDate) && headDate > wantDate) {
      await page.locator('.date-nav-btn[aria-label="Previous month"]').click().catch(() => {});
    } else {
      await page.locator('.date-nav-btn[aria-label="Next month"]').click().catch(() => {});
    }
    await page.waitForTimeout(150);
  }
  // Click day number in calendar grid (not weekday headers)
  const dayBtn = page.locator('.date-menu .date-grid button').filter({ hasText: new RegExp(`^${d}$`) }).first();
  if (await dayBtn.count()) {
    await dayBtn.click();
    await page.waitForTimeout(200);
    return true;
  }
  await page.keyboard.press('Escape').catch(() => {});
  return false;
}

async function ensureJuly2026(page) {
  // Cashbook is month-scoped; navigate until period shows Jul 2026
  for (let i = 0; i < 24; i++) {
    const body = await page.locator('body').innerText().catch(() => '');
    if (/Jul.*2026|2026-07|July 2026|2026 Jul/i.test(body)) return;
    // Prefer next if we're before July 2026, else previous
    const next = page.locator('button.cashbook-period-btn[aria-label="Next month"]');
    const prev = page.locator('button.cashbook-period-btn[aria-label="Previous month"]');
    if (await next.count()) await next.click().catch(() => {});
    else if (await prev.count()) await prev.click().catch(() => {});
    await page.waitForTimeout(500);
  }
  log('period', 'could not confirm July 2026 — continuing');
}

async function postBookEntry(page, entry, index) {
  const isIn = entry.direction === 'money_in';
  const modeBtn = isIn
    ? page.locator('button.cb-primary-tile.in').first()
    : page.locator('button.cb-primary-tile.out').first();
  if (!(await modeBtn.count())) throw new Error(`Cannot open ${entry.direction} tile`);
  await modeBtn.click();
  await page.waitForTimeout(700);

  const sheet = page.locator('.cb-sheet, .cb-sheet-body').first();
  await sheet.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});

  // Party (first text input in sheet)
  const party = page.locator('.cb-sheet-body input:not([type="date"]):not(.cb-amount-input)').first();
  if (await party.count()) {
    await party.fill('');
    await party.fill(entry.party);
  }

  // Amount
  const amount = page.locator('.cb-amount-input').first();
  if (await amount.count()) {
    await amount.click();
    await amount.fill('');
    await amount.fill(String(entry.amount));
  } else {
    throw new Error('Amount field missing');
  }

  // Date
  const dateInput = page.locator('.cb-sheet input[type="date"]').first();
  if (await dateInput.count()) await dateInput.fill(entry.date);

  // Expand "More details" for date + description (default date is today otherwise)
  const more = page
    .locator('.cb-sheet button')
    .filter({ hasText: /More details|date, note|▼/i })
    .first();
  if (await more.count()) {
    await more.click();
    await page.waitForTimeout(300);
  }

  // Description / short note
  const desc = page
    .locator('.cb-sheet input[placeholder*="note" i], .cb-sheet input[placeholder*="Short" i], .cb-sheet input[placeholder*="ATM" i]')
    .first();
  if (await desc.count()) {
    await desc.fill(entry.description);
  }

  // DateField is a custom calendar (not <input type=date>)
  await pickDateField(page, entry.date);

  // Category — first available category button inside sheet
  const cat = page
    .locator('.cb-sheet .cashbook-tile, .cb-sheet button.cashbook-tile, .cb-sheet .cb-cat button')
    .first();
  if (await cat.count()) await cat.click().catch(() => {});

  // Payment account — MUST be Bank (not Cash) so recon matchAll can find them
  const payTiles = page.locator(
    '.cb-sheet .cashbook-tile.pay, .cb-sheet button.cashbook-tile, .cb-sheet .cashbook-pay-tiles button',
  );
  const nPay = await payTiles.count();
  let bankClicked = false;
  for (let i = 0; i < nPay; i++) {
    const t = (await payTiles.nth(i).innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (/Cash|1000/i.test(t) && !/Bank/i.test(t)) continue;
    if (/Bank|HNB|BOC|Sampath|1100|1101|1102|Card|1200/i.test(t)) {
      await payTiles.nth(i).click().catch(() => {});
      bankClicked = true;
      break;
    }
  }
  if (!bankClicked && nPay > 1) {
    await payTiles.nth(1).click().catch(() => {});
  }

  // Save (class cashbook-save / cb-sheet-save)
  const save = page.locator('.cb-sheet button.cashbook-save, .cb-sheet button.cb-sheet-save').first();
  if (await save.count()) {
    await save.click();
  } else {
    const save2 = page
      .locator('.cb-sheet button')
      .filter({ hasText: /Save|Post|Record/i })
      .first();
    if (!(await save2.count())) throw new Error('No save button on cashbook sheet');
    await save2.click();
  }
  await page.waitForTimeout(1600);
  await page
    .locator('.cb-saved-toast')
    .first()
    .waitFor({ state: 'visible', timeout: 5000 })
    .catch(() => {});

  // Ensure sheet closed
  if (await page.locator('.cb-sheet').count()) {
    await page.locator('.cb-sheet-close, button[aria-label="Close"]').first().click().catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
  }
  log('bookEntry', `${index + 1}/6 ${entry.date} ${entry.description} ${entry.amount}`);
}

async function postAllBookEntries(page) {
  // Cashbook supports ?period=YYYY-MM
  await page.goto(`${baseURL}/cashbook?period=2026-07`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForTimeout(1000);
  await ensureJuly2026(page);
  await shot(page, '03b-period');
  for (let i = 0; i < bookEntries.length; i++) {
    try {
      if (i > 0) {
        await page.goto(`${baseURL}/cashbook?period=2026-07`, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
        await page.waitForTimeout(800);
      }
      await postBookEntry(page, bookEntries[i], i);
      if (i === 0) await shot(page, '04-after-first-entry');
    } catch (e) {
      result.errors.push(`bookEntry ${i + 1}: ${e.message}`);
      log('bookEntry-error', e.message);
      await shot(page, `04-entry-error-${i + 1}`);
      await page.keyboard.press('Escape').catch(() => {});
      await page.goto(`${baseURL}/cashbook?period=2026-07`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);
    }
  }
  await shot(page, '05-cashbook-after-entries');
}

async function clickStudioNext(page) {
  // Do not click "Save bank lines" here — that commits; handled separately
  const btn = page
    .locator('button.bis-btn.primary')
    .filter({ hasText: /Next|Continue|Review|Done|…/i })
    .filter({ hasNotText: /Save bank lines|Import/i })
    .first();
  if (await btn.count()) {
    const text = await btn.innerText().catch(() => '');
    await btn.click({ timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(900);
    return text;
  }
  return null;
}

async function importBankStatement(page) {
  if (!bankFile) die('No bank statement file in fixtures');
  await page.goto(`${baseURL}/cashbook/import`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForTimeout(1200);
  await shot(page, '06-import-upload');

  const input = page.locator('input[type="file"]').first();
  if (!(await input.count())) die('No file input on import studio');
  await input.setInputFiles(bankFile);
  await page.waitForTimeout(2500);
  await shot(page, '07-import-after-upload');

  // Account
  const bankCards = page.locator('button.bis-card');
  if ((await bankCards.count()) > 0) {
    // Prefer Bank over Cash
    const bank = page.locator('button.bis-card').filter({ hasText: /Bank|HNB|110/i }).first();
    if (await bank.count()) await bank.click();
    else await bankCards.first().click();
    await page.waitForTimeout(400);
    await clickStudioNext(page);
  }

  // Sheet
  if (await page.getByText(/Which sheet|sheet/i).count()) {
    const sheets = page.locator('button.bis-card');
    if (await sheets.count()) await sheets.first().click().catch(() => {});
    await clickStudioNext(page);
    await page.waitForTimeout(1500);
  }

  // Walk mapping until Import
  for (let step = 0; step < 12; step++) {
    await page.waitForTimeout(500);
    await shot(page, `08-import-step-${step}`);

    // Set opening/closing if fields present
    const openBal = page.locator('input').filter({ has: page.locator('xpath=..') });
    const openField = page.locator('input[placeholder*="opening" i], input[name*="opening" i]').first();
    if (await openField.count()) await openField.fill('100000').catch(() => {});
    const closeField = page.locator('input[placeholder*="closing" i], input[name*="closing" i]').first();
    if (await closeField.count()) await closeField.fill('153350').catch(() => {});

    // Resolve unknown labels if any
    const outBtn = page.getByRole('button', { name: /^Out$|Money out|Debit/i }).first();
    if (await outBtn.count()) await outBtn.click().catch(() => {});

    // Commit CTAs (studio uses "Save bank lines", not bare "Import")
    const commitBtn = page
      .locator('button.bis-btn.primary')
      .filter({ hasText: /Save bank lines|Import good|Import \d|Save good/i })
      .first();
    if (await commitBtn.count()) {
      await shot(page, '09-import-ready');
      await commitBtn.click();
      await page.waitForTimeout(5000);
      await shot(page, '10-import-done');
      // Done screen link to recon hub
      const hub = page.locator('a.bis-btn, a').filter({ hasText: /reconcil|Bank import|Match|Continue/i }).first();
      if (await hub.count()) await hub.click().catch(() => {});
      log('import', 'committed Save bank lines');
      return;
    }

    const label = await clickStudioNext(page);
    if (!label) {
      const alt = page
        .locator('button.bis-btn')
        .filter({ hasText: /Save bank lines|Import|Save good|finish/i })
        .first();
      if (await alt.count()) {
        await shot(page, '09-import-ready-alt');
        await alt.click().catch(() => {});
        await page.waitForTimeout(4000);
        await shot(page, '10-import-done');
        log('import', 'committed via alt button');
        return;
      }
      break;
    }
  }
  await shot(page, '10-import-end');
  log('import', 'walk finished WITHOUT commit — check screenshots');
  result.errors.push('Import studio did not click commit (Save bank lines)');
}

async function openReconAndWork(page) {
  await page.goto(`${baseURL}/cashbook/bank-imports`, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });
  await page.waitForTimeout(2500);
  await shot(page, '11-recon-inbox');
  result.urls.inbox = page.url();

  let card = page.locator('a.bih-card').first();
  if (!(await card.count())) {
    await page.waitForTimeout(3000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
  }
  if (!(await card.count())) {
    result.errors.push('No recon session cards after import');
    await shot(page, '11-recon-inbox-empty');
    return;
  }

  // Prefer newest card with Jul 2026 / 6–8 bank lines; never prefer multi-year or Apr 2025 leftovers
  const nCards = await page.locator('a.bih-card').count();
  let bestIdx = 0;
  let bestScore = -1e9;
  for (let i = 0; i < nCards; i++) {
    const t = (await page.locator('a.bih-card').nth(i).innerText()).replace(/\s+/g, ' ');
    let score = 0;
    if (/Jul 2026|1–31 Jul|July 2026|2026-07|1–30 Jul/i.test(t)) score += 1000;
    const linesM = t.match(/(\d+)\s+bank lines/i);
    const nLines = linesM ? Number(linesM[1]) : 0;
    if (nLines >= 5 && nLines <= 10) score += 400; // demo-sized import
    if (nLines > 40) score -= 500;
    if (/Apr 2025|2025-04|Statement\.xls/i.test(t)) score -= 800;
    if (/2025\s*[–→-].*2026|2025.*2026/i.test(t)) score -= 400;
    if (/Ready to reconcile/i.test(t)) score += 40;
    // Newest first in list
    score += Math.max(0, 20 - i * 2);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  card = page.locator('a.bih-card').nth(bestIdx);
  const cardText = (await card.innerText()).replace(/\s+/g, ' ').trim();
  log('sessionCard', `idx=${bestIdx} score=${bestScore} ${cardText.slice(0, 160)}`);
  result.sessionCard = cardText;

  await card.click();
  // Rebuild on open can take a while
  await page.waitForTimeout(10_000);
  await shot(page, '12-workbench-open');
  result.urls.workbench = page.url();

  // Refresh suggestions for stats
  const refresh = page.getByRole('button', { name: /Refresh/i });
  if (await refresh.count()) {
    await refresh.click();
    await page.waitForTimeout(15_000);
  }
  await shot(page, '13-workbench-after-refresh');

  const chips = await page.locator('.brw-chip').allTextContents().catch(() => []);
  result.chips = chips.map((t) => t.replace(/\s+/g, ' ').trim());
  log('chips', result.chips.join(' | '));

  const info = await page.locator('.bis-match-info').innerText().catch(() => '');
  if (info) {
    result.rebuildInfo = info.replace(/\s+/g, ' ').trim();
    log('rebuildInfo', result.rebuildInfo);
  }

  // Confirm safe matches if available
  const bulk = page.getByRole('button', { name: /Confirm safe matches/i });
  if (await bulk.count()) {
    const disabled = await bulk.isDisabled().catch(() => true);
    if (!disabled) {
      page.once('dialog', (d) => d.accept());
      await bulk.click();
      await page.waitForTimeout(4000);
      log('bulkConfirm', 'clicked');
      await shot(page, '14-after-bulk-confirm');
    } else {
      log('bulkConfirm', 'disabled (0 ready)');
    }
  }

  // Try Add tab — add first fee if present
  const addChip = page.locator('.brw-chip, .brw-tab').filter({ hasText: /Add/i }).first();
  if (await addChip.count()) {
    await addChip.click();
    await page.waitForTimeout(1000);
    await shot(page, '15-tab-add');
    const addBtn = page.locator('button').filter({ hasText: /Add to BookOne/i }).first();
    if (await addBtn.count()) {
      page.once('dialog', (d) => d.accept());
      await addBtn.click();
      await page.waitForTimeout(2500);
      log('addEntry', 'posted first add case');
      await shot(page, '16-after-add');
    }
  }

  // Waiting tab — mark still waiting
  const waitChip = page.locator('.brw-chip, .brw-tab').filter({ hasText: /Waiting/i }).first();
  if (await waitChip.count()) {
    await waitChip.click();
    await page.waitForTimeout(1000);
    await shot(page, '17-tab-waiting');
    const still = page.locator('button').filter({ hasText: /Still waiting/i }).first();
    if (await still.count()) {
      await still.click();
      await page.waitForTimeout(1500);
      log('waiting', 'marked still waiting');
      await shot(page, '18-after-waiting');
    }
  }

  // Decision / ready tabs screenshots
  for (const [name, re] of [
    ['19-tab-decision', /Decide|decision/i],
    ['20-tab-ready', /Ready/i],
    ['21-tab-all', /^All/i],
  ]) {
    const t = page.locator('.brw-chip, .brw-tab').filter({ hasText: re }).first();
    if (await t.count()) {
      await t.click().catch(() => {});
      await page.waitForTimeout(800);
      await shot(page, name);
    }
  }

  // Review panel
  const reviewBtn = page.getByRole('button', { name: /Review/i });
  if (await reviewBtn.count()) {
    await reviewBtn.click();
    await page.waitForTimeout(800);
    await shot(page, '22-review-panel');
  }

  // Report page
  const reportLink = page.locator('a').filter({ hasText: /Report/i }).first();
  if (await reportLink.count()) {
    await reportLink.click();
    await page.waitForTimeout(2000);
    await shot(page, '23-report');
    result.urls.report = page.url();
  }

  // Guided
  await page.goto(result.urls.workbench || page.url(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const guided = page.locator('a').filter({ hasText: /Fix one by one/i }).first();
  if (await guided.count()) {
    await guided.click();
    await page.waitForTimeout(2000);
    await shot(page, '24-guided');
    result.urls.guided = page.url();
  }

  // Final chips snapshot
  if (result.urls.workbench) {
    await page.goto(result.urls.workbench, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const chips2 = await page.locator('.brw-chip').allTextContents().catch(() => []);
    result.chipsFinal = chips2.map((t) => t.replace(/\s+/g, ' ').trim());
    await shot(page, '25-workbench-final');
  }
}

async function main() {
  if (!email || !password) die('E2E_EMAIL / E2E_PASSWORD required');
  fs.mkdirSync(outRoot, { recursive: true });
  console.log(`Base: ${baseURL}`);
  console.log(`Out:  ${outRoot}`);
  console.log(`Bank: ${bankFile}`);

  // Generate xlsx if possible
  try {
    const { spawnSync } = await import('node:child_process');
    spawnSync(process.execPath, [path.join(fixtures, 'generate-xlsx.mjs')], {
      cwd: fixtures,
      stdio: 'inherit',
    });
  } catch {
    /* ignore */
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await login(page);
    await maybeCreateCompany(page);
    await ensureCashbook(page);
    await postAllBookEntries(page);
    await importBankStatement(page);
    await openReconAndWork(page);

    fs.writeFileSync(
      path.join(outRoot, 'README.txt'),
      [
        'Bank recon demo E2E',
        `base=${baseURL}`,
        `user=${email}`,
        `time=${new Date().toISOString()}`,
        `company=${result.companyName || '(current workspace)'}`,
        `bankFile=${result.bankFile}`,
        `workbench=${result.urls.workbench || ''}`,
        `chips=${(result.chips || []).join(' | ')}`,
        `errors=${result.errors.length}`,
        ...result.errors.map((e) => `  - ${e}`),
      ].join('\n'),
    );

    writeResult();
    console.log('\nDone.');
    console.log('Result:', path.join(outRoot, 'result.json'));
    if (result.errors.length) {
      console.log('Errors:', result.errors.length);
      process.exitCode = 2;
    }
  } catch (e) {
    result.errors.push(e.message || String(e));
    await shot(page, '99-fatal').catch(() => {});
    writeResult();
    console.error(e);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
