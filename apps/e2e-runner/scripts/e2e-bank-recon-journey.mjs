/**
 * Full bank recon journey (what the product owner asked for):
 *
 *  A) Create NEW account (Sign Up) OR login with E2E_EMAIL
 *  B) Onboarding → cashbook
 *  C) Enter transactions manually (set 1)
 *  D) Import excel/csv sheet 1 → reconcile
 *  E) Enter more transactions (set 2) + import sheet 2 → reconcile
 *  F) Open reports / review finish
 *  G) PROCESS_AUDIT.md + screenshots each step
 *
 * Usage (apps/e2e-runner):
 *   set E2E_BASE_URL=https://bookone.clossyan.com
 *   set E2E_SIGNUP=1
 *   set E2E_PASSWORD=DemoPass123!
 *   node scripts/e2e-bank-recon-journey.mjs
 *
 * Or reuse existing account:
 *   set E2E_EMAIL=...
 *   set E2E_PASSWORD=...
 *   set E2E_SIGNUP=0
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const fixtures = path.join(root, 'fixtures', 'bank-recon-demo');
const baseURL = (process.env.E2E_BASE_URL || 'https://bookone.clossyan.com').replace(/\/$/, '');
const doSignup = process.env.E2E_SIGNUP !== '0';
const password = process.env.E2E_PASSWORD || 'DemoPass123!';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outRoot = path.resolve(
  root,
  process.env.E2E_UI_AUDIT_DIR || `ui-audit/bank-recon-journey-${stamp}`,
);

const books1 = JSON.parse(fs.readFileSync(path.join(fixtures, 'book-entries.json'), 'utf8')).entries;
const books2 = JSON.parse(fs.readFileSync(path.join(fixtures, 'book-entries-2.json'), 'utf8')).entries;
const bank1 = path.join(fixtures, 'bank-statement.csv');
const bank2 = path.join(fixtures, 'bank-statement-2.csv');

const email =
  process.env.E2E_EMAIL ||
  `recon.demo.${Date.now().toString(36)}@clossyan-demo.test`;

const audit = {
  startedAt: new Date().toISOString(),
  baseURL,
  email,
  doSignup,
  steps: [],
  processNotes: [],
  uiIssues: [],
  errors: [],
  chips: {},
  urls: {},
};

function note(step, status, detail = '', ui = []) {
  const row = { step, status, detail, ui, at: new Date().toISOString() };
  audit.steps.push(row);
  audit.processNotes.push(`[${status}] ${step}${detail ? ' — ' + detail : ''}`);
  for (const u of ui) audit.uiIssues.push({ step, issue: u });
  console.log(`  [${status}] ${step}${detail ? ': ' + detail : ''}`);
  if (ui.length) console.log(`       UI: ${ui.join('; ')}`);
}

function writeAll() {
  fs.mkdirSync(outRoot, { recursive: true });
  audit.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outRoot, 'result.json'), JSON.stringify(audit, null, 2));
  const md = [
    '# Bank reconciliation journey audit',
    '',
    `- Base: ${baseURL}`,
    `- User: ${email}`,
    `- Signup: ${doSignup}`,
    `- Started: ${audit.startedAt}`,
    `- Finished: ${audit.finishedAt}`,
    '',
    '## Process checklist',
    '',
    ...audit.processNotes.map((n) => `- ${n}`),
    '',
    '## UI issues found',
    '',
    ...(audit.uiIssues.length
      ? audit.uiIssues.map((u) => `- **${u.step}**: ${u.issue}`)
      : ['- (none logged yet)']),
    '',
    '## Errors',
    '',
    ...(audit.errors.length ? audit.errors.map((e) => `- ${e}`) : ['- none']),
    '',
    '## Screenshots',
    '',
    'See PNGs in this folder (numbered by step).',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(outRoot, 'PROCESS_AUDIT.md'), md);
}

async function shot(page, name) {
  const file = path.join(outRoot, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  console.log(`  ✓ ${path.relative(root, file)}`);
}

async function pickDateField(page, iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const trigger = page.locator('.cb-sheet .date-trigger').first();
  if (!(await trigger.count())) return false;
  await trigger.click();
  await page.waitForTimeout(200);
  const want = new Date(y, m - 1, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
  for (let i = 0; i < 30; i++) {
    const head = (
      await page.locator('.date-menu strong').first().innerText().catch(() => '')
    ).trim();
    if (head === want) break;
    const headT = Date.parse(`${head} 1`);
    const wantT = new Date(y, m - 1, 1).getTime();
    if (!Number.isNaN(headT) && headT > wantT) {
      await page.locator('.date-nav-btn[aria-label="Previous month"]').click().catch(() => {});
    } else {
      await page.locator('.date-nav-btn[aria-label="Next month"]').click().catch(() => {});
    }
    await page.waitForTimeout(120);
  }
  const dayBtn = page
    .locator('.date-menu .date-grid button')
    .filter({ hasText: new RegExp(`^${d}$`) })
    .first();
  if (await dayBtn.count()) {
    await dayBtn.click();
    return true;
  }
  await page.keyboard.press('Escape').catch(() => {});
  return false;
}

async function signupOrLogin(page) {
  await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForTimeout(800);
  await shot(page, 'A00-login');

  if (doSignup) {
    await page.getByRole('button', { name: /^Sign Up$/i }).click().catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, 'A01-signup-form');

    // Fill signup fields
    const inputs = page.locator('.auth-card input');
    // first/last name if present
    const first = page.locator('.auth-card input').nth(0);
    const last = page.locator('.auth-card input').nth(1);
    // After mode switch, order: first, last, email, password, confirm
    if (await page.getByText(/First name/i).count()) {
      await page.locator('.auth-card input').nth(0).fill('Recon');
      await page.locator('.auth-card input').nth(1).fill('Demo');
      await page.getByTestId('login-email').fill(email);
      await page.getByTestId('login-password').fill(password);
      // confirm password = last password-type input
      const pwds = page.locator('.auth-card input[type="password"]');
      if ((await pwds.count()) >= 2) await pwds.nth(1).fill(password);
      else await page.locator('.auth-card input').last().fill(password);
    } else {
      await page.getByTestId('login-email').fill(email);
      await page.getByTestId('login-password').fill(password);
    }

    await page.getByTestId('login-submit').click();
    await page.waitForTimeout(2500);
    await shot(page, 'A02-after-signup');

    const err = await page.locator('.auth-error').innerText().catch(() => '');
    const msg = await page.locator('.auth-message').innerText().catch(() => '');
    if (err) {
      note('A-signup', 'WARN', err);
      audit.errors.push(`signup: ${err}`);
      // fall through to login attempt
    } else if (msg && /verify|email/i.test(msg)) {
      note('A-signup', 'WARN', msg + ' — attempting immediate login');
    } else {
      note('A-signup', 'OK', `created ${email}`);
    }

    // Switch to sign in and login
    await page.getByRole('button', { name: /^Sign In$/i }).click().catch(() => {});
    await page.waitForTimeout(300);
  }

  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  if (page.url().includes('/login')) {
    const err = await page.locator('.auth-error').innerText().catch(() => 'login failed');
    note('A-login', 'FAIL', err);
    audit.errors.push(err);
    throw new Error(err);
  }
  note('A-login', 'OK', page.url());
  audit.urls.home = page.url();
  await shot(page, 'A03-logged-in');
}

async function onboarding(page) {
  await page.goto(`${baseURL}/cashbook`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(1500);
  if (await page.getByText(/What are you using BookOne for/i).count()) {
    await shot(page, 'B01-onboarding');
    const personal = page.locator('button.onboard-tile').first();
    await personal.click();
    await page.getByRole('button', { name: /continue|get started|start|next/i }).click().catch(() => {});
    await page.waitForTimeout(2500);
    note('B-onboarding', 'OK', 'selected first entity tile');
  } else {
    note('B-onboarding', 'OK', 'already onboarded');
  }
  await page.goto(`${baseURL}/cashbook?period=2026-07`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await shot(page, 'B02-cashbook');
  // UI notes for cashbook vs recon later
  note('B-cashbook-home', 'OK', 'cashbook shell loaded', [
    'Recon pages should reuse cashbook card radius, primary tile green, and bottom nav spacing',
  ]);
}

async function postEntry(page, entry, period) {
  await page.goto(`${baseURL}/cashbook?period=${period}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForTimeout(600);
  const isIn = entry.direction === 'money_in';
  await page.locator(isIn ? 'button.cb-primary-tile.in' : 'button.cb-primary-tile.out').click();
  await page.waitForTimeout(600);

  const sheet = page.locator('.cb-sheet, .cb-sheet-body').first();
  const party = sheet.locator('input:not([type="date"]):not(.cb-amount-input)').first();
  if (await party.count()) await party.fill(entry.party);

  const amount = page.locator('.cb-amount-input').first();
  await amount.fill(String(entry.amount));

  // Category first (Where from / Category) — not Account liquid tiles
  const catTiles = page.locator('.cb-field').filter({ hasText: /Where from|Category|මුදල්|ප්‍රවර්ගය/i });
  const catBtn = catTiles.locator('button.cashbook-tile').first();
  if (await catBtn.count()) await catBtn.click().catch(() => {});

  // Account liquid tiles — scope ONLY to cb-liquid-tiles (not category pay tiles)
  async function pickBankAccount() {
    await page.waitForTimeout(400);
    const liquid = page.locator('.cb-sheet .cb-liquid-tiles button.cashbook-tile');
    const ln = await liquid.count();
    for (let i = 0; i < ln; i++) {
      const t = (await liquid.nth(i).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      if (/^Cash$/i.test(t)) continue;
      if (/Bank|1100|HNB|BOC|Sampath|Commercial/i.test(t)) {
        await liquid.nth(i).click({ force: true });
        return t;
      }
    }
    if (ln > 1) {
      await liquid.nth(1).click({ force: true });
      return (await liquid.nth(1).innerText()).trim();
    }
    return null;
  }
  let bankLabel = await pickBankAccount();
  if (!bankLabel) {
    // Absolute last resort: second cashbook-tile in sheet that is not Cash category
    const tiles = page.locator('.cb-sheet button.cashbook-tile.pay');
    const tn = await tiles.count();
    for (let i = 0; i < tn; i++) {
      const t = (await tiles.nth(i).innerText()).replace(/\s+/g, ' ').trim();
      if (t === 'Bank' || /^Bank /i.test(t) || t.includes('1100')) {
        await tiles.nth(i).click({ force: true });
        bankLabel = t;
        break;
      }
    }
  }

  const more = page
    .locator('.cb-sheet button.cb-details-toggle, .cb-sheet button')
    .filter({ hasText: /More details|date, note|▼/i })
    .first();
  if (await more.count()) await more.click();
  await page.waitForTimeout(200);

  const desc = page
    .locator('.cb-sheet input[placeholder*="note" i], .cb-sheet input[placeholder*="Short" i]')
    .first();
  if (await desc.count()) await desc.fill(entry.description);
  await pickDateField(page, entry.date);

  // Re-assert Bank right before save (openMode / last-pay can leave Cash selected)
  bankLabel = (await pickBankAccount()) || bankLabel;

  await page.locator('.cb-sheet button.cashbook-save, .cb-sheet button.cb-sheet-save').first().click();
  await page.waitForTimeout(1200);
  await page
    .locator('.cb-saved-toast, .cb-sheet')
    .filter({ hasText: /Saved/i })
    .first()
    .waitFor({ state: 'visible', timeout: 4000 })
    .catch(() => {});
  if (entry.id === 'book-1' || entry.id === 'book-entries-2-1') {
    note('post-bank-account', bankLabel ? 'OK' : 'WARN', bankLabel || 'Bank account tile not clicked');
  }
}

async function postBooks(page, entries, period, tag) {
  for (let i = 0; i < entries.length; i++) {
    try {
      await postEntry(page, entries[i], period);
      if (i === 0) await shot(page, `${tag}-entry-1`);
    } catch (e) {
      audit.errors.push(`${tag} entry ${i + 1}: ${e.message}`);
      note(`${tag}-entry-${i + 1}`, 'FAIL', e.message);
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  await page.goto(`${baseURL}/cashbook?period=${period}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await shot(page, `${tag}-ledger`);
  const body = await page.locator('.cashbook-ledger, .cashbook-sheet').innerText().catch(() => '');
  const rows = (body.match(/\d{1,2} \w{3} 2026/g) || []).length;
  note(`${tag}-manual-entries`, rows >= entries.length ? 'OK' : 'WARN', `${rows} dated rows visible, expected ~${entries.length}`);
}

async function clickStudioNext(page) {
  const btn = page
    .locator('button.bis-btn.primary')
    .filter({ hasText: /Next|Continue|Review|Done/i })
    .filter({ hasNotText: /Save bank lines/i })
    .first();
  if (await btn.count()) {
    await btn.click().catch(() => {});
    await page.waitForTimeout(800);
    return true;
  }
  return false;
}

/** Click standard BookOne ConfirmDialog primary action if open. */
async function clickModalConfirm(page, labelRe = /Confirm|Save|Delete|Yes|Add to BookOne/i) {
  const modal = page.locator('.modal-panel, [role="dialog"]').first();
  if (!(await modal.count())) return false;
  if (!(await modal.isVisible().catch(() => false))) return false;
  const btn = modal.locator('button').filter({ hasText: labelRe }).last();
  if (await btn.count()) {
    await btn.click().catch(() => {});
    await page.waitForTimeout(600);
    return true;
  }
  return false;
}

async function importBank(page, filePath, tag) {
  await page.goto(`${baseURL}/cashbook/import`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForTimeout(1000);
  await shot(page, `${tag}-import-upload`);
  await page.locator('input[type="file"]').first().setInputFiles(filePath);
  await page.waitForTimeout(2000);
  await shot(page, `${tag}-import-after-upload`);

  const bankCards = page.locator('button.bis-card');
  if (await bankCards.count()) {
    const bank = page.locator('button.bis-card').filter({ hasText: /Bank|HNB|110/i }).first();
    if (await bank.count()) await bank.click();
    else await bankCards.first().click();
    await clickStudioNext(page);
  }
  if (await page.getByText(/Which sheet|sheet/i).count()) {
    const sheets = page.locator('button.bis-card');
    if (await sheets.count()) await sheets.first().click().catch(() => {});
    await clickStudioNext(page);
    await page.waitForTimeout(1200);
  }

  for (let step = 0; step < 14; step++) {
    await page.waitForTimeout(400);
    await shot(page, `${tag}-import-step-${step}`);
    const commit = page
      .locator('button.bis-btn.primary')
      .filter({ hasText: /Save bank lines|Import good|Save good/i })
      .first();
    if (await commit.count()) {
      await shot(page, `${tag}-import-ready`);
      note(`${tag}-import-ui`, 'OK', 'import studio ready', [
        'Import studio uses bis-* design — recon inbox/workbench should feel as polished as this, not a separate grey system',
      ]);
      // Accept browser confirm if still present; prefer standard modal ConfirmDialog
      page.once('dialog', (d) => d.accept().catch(() => {}));
      await commit.click();
      // Standard BookOne ConfirmDialog
      const modalConfirm = page
        .locator('.modal-panel button, [role="dialog"] button')
        .filter({ hasText: /Save bank lines|Confirm|Yes/i })
        .first();
      if (await modalConfirm.count()) {
        await modalConfirm.click().catch(() => {});
      }
      // Wait for success title (not still "Ready to save")
      const ok = await page
        .getByText(/Bank file saved|lines saved|Reconcile now/i)
        .first()
        .waitFor({ state: 'visible', timeout: 45_000 })
        .then(() => true)
        .catch(() => false);
      await page.waitForTimeout(800);
      await shot(page, `${tag}-import-done`);
      const err = await page.locator('.bis-error, .auth-error, .cashbook-error').innerText().catch(() => '');
      if (err) {
        note(`${tag}-import-commit`, 'FAIL', err);
        audit.errors.push(`${tag} import: ${err}`);
        return false;
      }
      if (!ok) {
        const body = (await page.locator('.bis-pane-step, .bis-done-card, body').first().innerText().catch(() => '')).slice(0, 200);
        note(`${tag}-import-commit`, 'FAIL', `still on form after Save — ${body.replace(/\s+/g, ' ').slice(0, 120)}`);
        audit.errors.push(`${tag}: import did not reach success screen`);
        return false;
      }
      note(`${tag}-import-commit`, 'OK', path.basename(filePath));
      // Prefer Reconcile now → session workbench
      const reconNow = page.locator('a').filter({ hasText: /Reconcile now/i }).first();
      if (await reconNow.count()) {
        await reconNow.click();
        await page.waitForTimeout(5000);
        await shot(page, `${tag}-after-reconcile-now`);
        if (page.url().includes('/recon/') || page.url().includes('/session/')) {
          note(`${tag}-open-session`, 'OK', page.url());
          audit.urls.workbench = page.url();
          await workOpenSession(page, tag);
          return true;
        }
        // Match compat may land on inbox if resolve races — open first Continue row
        const cont = page
          .locator('table.table tbody tr a[href*="/recon/"], table.table tbody tr a[href*="/session/"]')
          .first();
        if (await cont.count()) {
          await cont.click();
          await page.waitForTimeout(5000);
          if (page.url().includes('/recon/') || page.url().includes('/session/')) {
            note(`${tag}-open-session`, 'OK', `via inbox Continue ${page.url()}`);
            audit.urls.workbench = page.url();
            await workOpenSession(page, tag);
            return true;
          }
        }
      }
      const hub = page.locator('a').filter({ hasText: /Bank reconciliation/i }).first();
      if (await hub.count()) await hub.click().catch(() => {});
      return true;
    }
    if (!(await clickStudioNext(page))) break;
  }
  note(`${tag}-import-commit`, 'FAIL', 'Save bank lines not reached');
  audit.errors.push(`${tag}: import not committed`);
  return false;
}

async function workOpenSession(page, tag) {
  await page.waitForTimeout(2000);
  await shot(page, `${tag}-workbench`);
  audit.urls.workbench = page.url();
  note(`${tag}-workbench-ui`, 'CHECK', page.url(), [
    'Workbench should use BookOne .button + .card + .badge — not a separate grey system',
    'Duplicate chip + tab filters confuse users — chips only',
    'Metric cards should match cashbook summary density',
  ]);

  const refresh = page.getByRole('button', { name: /Refresh/i });
  if (await refresh.count()) {
    await refresh.click();
    await page.waitForTimeout(12000);
  }
  await shot(page, `${tag}-after-refresh`);
  const chips = await page.locator('.brw-chip').allTextContents().catch(() => []);
  const chipText = chips.map((c) => c.replace(/\s+/g, ' ').trim());
  audit.chips[tag] = chipText;
  note(`${tag}-refresh`, chipText.length ? 'OK' : 'WARN', chipText.join(' | ') || 'no chips');

  const bulk = page.getByRole('button', { name: /Confirm safe matches/i });
  if ((await bulk.count()) && !(await bulk.isDisabled())) {
    page.once('dialog', (d) => d.accept().catch(() => {}));
    await bulk.click();
    await clickModalConfirm(page, /Confirm matches|Confirm/i);
    await page.waitForTimeout(3000);
    note(`${tag}-bulk-confirm`, 'OK');
    await shot(page, `${tag}-after-bulk`);
  } else note(`${tag}-bulk-confirm`, 'WARN', 'no ready matches');

  const addChip = page.locator('.brw-chip').filter({ hasText: /Add/i }).first();
  if (await addChip.count()) {
    await addChip.click();
    await page.waitForTimeout(600);
    await shot(page, `${tag}-tab-add`);
    const addBtn = page.locator('button').filter({ hasText: /Add to BookOne/i }).first();
    if (await addBtn.count()) {
      page.once('dialog', (d) => d.accept().catch(() => {}));
      await addBtn.click();
      await clickModalConfirm(page, /Add to BookOne|Confirm/i);
      await page.waitForTimeout(2000);
      note(`${tag}-add-one`, 'OK');
    }
  }

  const waitChip = page.locator('.brw-chip').filter({ hasText: /Waiting/i }).first();
  if (await waitChip.count()) {
    await waitChip.click();
    await page.waitForTimeout(500);
    const still = page.locator('button').filter({ hasText: /Still waiting/i }).first();
    if (await still.count()) {
      await still.click();
      await page.waitForTimeout(1200);
      note(`${tag}-waiting`, 'OK');
    }
  }

  const review = page.getByRole('button', { name: /Review/i });
  if (await review.count()) {
    await review.click();
    await page.waitForTimeout(500);
    await shot(page, `${tag}-review`);
    note(`${tag}-review`, 'OK');
  }

  const report = page.locator('a').filter({ hasText: /^Report$/i }).first();
  if (await report.count()) {
    await report.click();
    await page.waitForTimeout(2000);
    await shot(page, `${tag}-report`);
    note(`${tag}-report`, 'OK', page.url());
    if (audit.urls.workbench) {
      await page.goto(audit.urls.workbench, { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
  }
  await shot(page, `${tag}-final`);
}

async function openNewestDemoSession(page, preferPeriodRe) {
  await page.goto(`${baseURL}/cashbook/bank-imports`, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });
  await page.waitForTimeout(2500);
  await shot(page, 'recon-inbox');

  // Session rows only (exclude "Imported bank files" delete table)
  const sessionRows = page
    .locator('table.table tbody tr')
    .filter({ has: page.locator('a[href*="/recon/"], a[href*="/session/"]') });
  const cards = page.locator('a.bih-card');
  const tableN = await sessionRows.count();
  const cardN = await cards.count();
  const usesTable = tableN > 0;
  note('recon-inbox-ui', 'CHECK', usesTable ? 'table inbox' : cardN ? 'legacy cards' : 'empty', [
    usesTable
      ? 'Inbox uses system table + pagination (party pattern)'
      : 'Prefer table.table like parties/products when deployed',
  ]);

  // Imported bank files delete UI
  const importsHeading = page.getByText(/Imported bank files/i);
  if (await importsHeading.count()) {
    note('recon-imports-table', 'OK', 'delete-import section present');
    // Exercise delete on the first import via ConfirmDialog (then reload sessions stay)
    const delBtn = page.locator('table.table tbody tr button').filter({ hasText: /Delete/i }).first();
    if (await delBtn.count()) {
      // Don't delete during dual-import journey — only verify button exists
      note('recon-delete-import-ui', 'OK', 'Delete button available');
    }
  } else {
    note('recon-imports-table', 'WARN', 'Imported bank files section not visible');
  }

  if (!usesTable && !cardN) {
    note('recon-open-session', 'FAIL', 'no session rows or cards');
    audit.errors.push('recon-open-session: no sessions in inbox');
    return false;
  }

  let best = 0;
  let bestScore = -1e9;
  const texts = [];
  const n = usesTable ? tableN : cardN;
  for (let i = 0; i < n; i++) {
    const t = (
      await (usesTable ? sessionRows.nth(i) : cards.nth(i)).innerText()
    ).replace(/\s+/g, ' ');
    texts.push(t.slice(0, 140));
    let s = Math.max(0, 15 - i * 2);
    if (preferPeriodRe && preferPeriodRe.test(t)) s += 1000;
    // "1 file · 6 lines" style meta
    const lm = t.match(/(\d+)\s+lines?/i) || t.match(/(\d+)\s+bank lines/i);
    const nl = lm ? Number(lm[1]) : 0;
    if (nl >= 5 && nl <= 15) s += 300;
    if (nl > 40) s -= 600;
    if (/Apr 2025|Oct 2025|2025\s*[–-]/i.test(t)) s -= 800;
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  audit.sessionCards = texts;
  note(
    'recon-open-session',
    'OK',
    `${usesTable ? 'row' : 'card'}#${best} score=${bestScore} ${texts[best]?.slice(0, 80)}`,
  );
  if (usesTable) {
    const rowLink = sessionRows
      .nth(best)
      .locator('a[href*="/recon/"], a[href*="/session/"]')
      .first();
    await rowLink.click();
  } else {
    await cards.nth(best).click();
  }
  await page.waitForTimeout(8000);
  await shot(page, 'recon-workbench');
  audit.urls.workbench = page.url();

  note('recon-workbench-ui', 'CHECK', page.url(), [
    'Workbench should use .button + Card + table + right sidebar',
    'Filter chips only (no duplicate tab strip)',
    'Confirm actions via standard modal, not window.confirm',
  ]);

  const hasSidebar = await page.locator('.brw-side, .brw-side-empty').count();
  note('recon-sidebar', hasSidebar ? 'OK' : 'WARN', hasSidebar ? 'right panel present' : 'no brw-side');

  const refresh = page.getByRole('button', { name: /Refresh/i });
  if (await refresh.count()) {
    await refresh.click();
    await page.waitForTimeout(12000);
  }
  await shot(page, 'recon-after-refresh');
  const chips = await page.locator('.brw-chip').allTextContents().catch(() => []);
  const chipText = chips.map((c) => c.replace(/\s+/g, ' ').trim());
  audit.chips[preferPeriodRe?.toString() || 'default'] = chipText;
  note('recon-refresh', 'OK', chipText.join(' | ') || '(no chips)');

  // Try bulk confirm (ConfirmDialog or browser dialog)
  const bulk = page.getByRole('button', { name: /Confirm safe matches/i });
  if ((await bulk.count()) && !(await bulk.isDisabled())) {
    page.once('dialog', (d) => d.accept().catch(() => {}));
    await bulk.click();
    await clickModalConfirm(page, /Confirm matches|Confirm/i);
    await page.waitForTimeout(3000);
    note('recon-bulk-confirm', 'OK', 'confirmed safe matches');
    await shot(page, 'recon-after-bulk');
  } else {
    note('recon-bulk-confirm', 'WARN', 'no ready matches to bulk-confirm');
  }

  // Add first
  const addChip = page.locator('.brw-chip').filter({ hasText: /Add/i }).first();
  if (await addChip.count()) {
    await addChip.click();
    await page.waitForTimeout(800);
    await shot(page, 'recon-tab-add');
    const addBtn = page.locator('button').filter({ hasText: /Add to BookOne/i }).first();
    if (await addBtn.count()) {
      page.once('dialog', (d) => d.accept().catch(() => {}));
      await addBtn.click();
      await clickModalConfirm(page, /Add to BookOne|Confirm/i);
      await page.waitForTimeout(2000);
      note('recon-add-one', 'OK', 'posted one bank-only line');
    } else note('recon-add-one', 'WARN', 'no Add button on tab');
  }

  // Waiting mark one
  const waitChip = page.locator('.brw-chip').filter({ hasText: /Waiting/i }).first();
  if (await waitChip.count()) {
    await waitChip.click();
    await page.waitForTimeout(600);
    const still = page.locator('button').filter({ hasText: /Still waiting/i }).first();
    if (await still.count()) {
      await still.click();
      await page.waitForTimeout(1200);
      note('recon-waiting', 'OK', 'marked one still waiting');
    } else note('recon-waiting', 'WARN', 'no Still waiting button');
  }

  // Review panel
  const review = page.getByRole('button', { name: /Review/i });
  if (await review.count()) {
    await review.click();
    await page.waitForTimeout(600);
    await shot(page, 'recon-review');
    note('recon-review', 'OK', 'review panel opened', [
      'Review panel should look like a BookOne Card with page-title, not a blue tinted strip',
    ]);
  }

  // Report
  const report = page.locator('a').filter({ hasText: /^Report$/i }).first();
  if (await report.count()) {
    await report.click();
    await page.waitForTimeout(2000);
    await shot(page, 'recon-report');
    audit.urls.report = page.url();
    note('recon-report', 'OK', page.url(), [
      'Report print view is plain; OK for print but needs BookOne brand header consistency',
    ]);
    await page.goto(audit.urls.workbench, { waitUntil: 'domcontentloaded' }).catch(() => {});
  } else {
    note('recon-report', 'WARN', 'Report link not found');
  }

  await shot(page, 'recon-final');
  return true;
}

async function main() {
  fs.mkdirSync(outRoot, { recursive: true });
  console.log(`Base: ${baseURL}`);
  console.log(`User: ${email}`);
  console.log(`Out:  ${outRoot}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

  try {
    // A — account
    await signupOrLogin(page);

    // B — onboarding
    await onboarding(page);

    // C — manual transactions set 1
    await postBooks(page, books1, '2026-07', 'C');
    await shot(page, 'C-ledger-final');

    // D — import 1 + recon
    await importBank(page, bank1, 'D');
    await openNewestDemoSession(page, /Jul 2026|July 2026|2026-07|1–3[01] Jul/i);

    // E — set 2 + import 2 + recon
    await postBooks(page, books2, '2026-08', 'E');
    await importBank(page, bank2, 'E2');
    await openNewestDemoSession(page, /Aug 2026|August 2026|2026-08|1–3[01] Aug/i);

    // F — final inbox snapshot
    await page.goto(`${baseURL}/cashbook/bank-imports`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await shot(page, 'F-inbox-final');
    note('F-complete', 'OK', 'journey finished — see PROCESS_AUDIT.md');

    writeAll();
    console.log('\nDone →', path.join(outRoot, 'PROCESS_AUDIT.md'));
    if (audit.errors.length) process.exitCode = 2;
  } catch (e) {
    audit.errors.push(e.message || String(e));
    note('fatal', 'FAIL', e.message || String(e));
    await shot(page, 'Z-fatal').catch(() => {});
    writeAll();
    console.error(e);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
