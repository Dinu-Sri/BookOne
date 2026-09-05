/**
 * Agent browser — drive BookOne like a person from this machine.
 *
 * Logs in, clicks, types, screenshots, and dumps a page snapshot the AI can read.
 * Credentials: gitignored `.local/debug-accounts.json` or E2E_EMAIL / E2E_PASSWORD.
 * Never prints the password.
 *
 * Usage (repo root):
 *   pnpm agent:browse
 *   pnpm agent:browse --path /inventory/on-rent --path /sales/invoices
 *   pnpm agent:browse --script apps/e2e-runner/scripts/agent-scenarios/login-smoke.json
 *   pnpm agent:browse --base-url http://localhost:3000 --path /dashboard
 *   pnpm agent:browse --fresh --path /login
 *
 * Artifacts: .local/agent-browse/<run>/  (gitignored)
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runnerRoot = path.join(__dirname, '..');
const repoRoot = path.join(__dirname, '..', '..', '..');
const localDir = path.join(repoRoot, '.local');

function die(msg, code = 1) {
  console.error(`ERROR: ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const paths = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--path' || a === '-p') {
      paths.push(argv[++i] || '');
    } else if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) flags[key] = true;
      else {
        flags[key] = next;
        i += 1;
      }
    }
  }
  return { paths: paths.filter(Boolean), flags };
}

function loadDebugAccounts() {
  const file = path.join(localDir, 'debug-accounts.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function resolveAuth(flags) {
  const debug = loadDebugAccounts();
  const baseUrl = String(
    flags['base-url'] ||
      process.env.E2E_BASE_URL ||
      process.env.AUTH_URL ||
      debug?.productionUrl ||
      'http://localhost:3000',
  ).replace(/\/$/, '');
  const want = String(flags.account || flags.email || process.env.E2E_EMAIL || '').trim();
  const fromFile = debug?.accounts?.find((a) =>
    want ? a.email === want || a.role === want : a.role === 'super_admin',
  ) || debug?.accounts?.[0];
  const email = want && want.includes('@') ? want : fromFile?.email || process.env.E2E_EMAIL || '';
  const password =
    String(flags.password || process.env.E2E_PASSWORD || fromFile?.password || '');
  if (!email || !password) {
    die(
      'No login. Put accounts in .local/debug-accounts.json or set E2E_EMAIL and E2E_PASSWORD.',
    );
  }
  return { baseUrl, email, password };
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadScript(file) {
  const abs = path.isAbsolute(file) ? file : path.join(repoRoot, file);
  if (!fs.existsSync(abs)) die(`Script not found: ${abs}`);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function statePaths(baseUrl, email) {
  const key = Buffer.from(`${baseUrl}|${email}`).toString('base64url').slice(0, 24);
  const dir = path.join(localDir, 'agent-browse');
  return {
    dir,
    storage: path.join(dir, `storage-${key}.json`),
    meta: path.join(dir, `storage-${key}.meta.json`),
  };
}

async function snapshot(page) {
  const url = page.url();
  const title = await page.title();
  const buttons = (await page.locator('button, [role="button"], a.button').allTextContents())
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 80);
  const links = (await page.locator('a').allTextContents())
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter((t) => t && t.length < 80)
    .slice(0, 60);
  const fields = await page.locator('input, select, textarea').evaluateAll((els) =>
    els.slice(0, 60).map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || '',
      name: el.getAttribute('name') || '',
      testId: el.getAttribute('data-testid') || '',
      placeholder: el.getAttribute('placeholder') || '',
      value: el.getAttribute('type') === 'password' ? '' : String(el.value || '').slice(0, 80),
    })),
  );
  const alerts = (
    await page.locator('[role="alert"], .auth-error, .status-toast, .toast').allTextContents()
  )
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const text = ((await page.locator('body').innerText().catch(() => '')) || '')
    .replace(/\r/g, '')
    .slice(0, 12_000);
  return { url, title, buttons, links, fields, alerts, text };
}

function writeSnapshot(outDir, name, snap) {
  const jsonPath = path.join(outDir, `${name}.json`);
  const mdPath = path.join(outDir, `${name}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(snap, null, 2));
  const md = [
    `# ${name}`,
    '',
    `- URL: ${snap.url}`,
    `- Title: ${snap.title}`,
    snap.alerts.length ? `- Alerts: ${snap.alerts.join(' | ')}` : '- Alerts: none',
    '',
    '## Buttons',
    ...snap.buttons.map((b) => `- ${b}`),
    '',
    '## Fields',
    ...snap.fields.map(
      (f) =>
        `- ${f.tag}${f.type ? `[${f.type}]` : ''} name=${f.name || '—'} placeholder=${f.placeholder || '—'}`,
    ),
    '',
    '## Visible text',
    '',
    '```',
    snap.text,
    '```',
    '',
  ].join('\n');
  fs.writeFileSync(mdPath, md);
  return { jsonPath, mdPath };
}

async function shot(page, outDir, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function waitForShell(page) {
  await page
    .locator('.app-shell, .sidebar, .workspace, .pos-root, main, [data-testid="login-form"]')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
}

function looksLikeSelector(value) {
  return (
    value.startsWith('#') ||
    value.startsWith('.') ||
    value.startsWith('[') ||
    value.startsWith('text=') ||
    value.startsWith('role=')
  );
}

async function locate(page, step) {
  if (step.testid) return page.getByTestId(step.testid);
  if (step.selector) {
    let loc = page.locator(step.selector);
    if (step.nth != null && step.nth !== '') loc = loc.nth(Number(step.nth));
    else loc = loc.first();
    return loc;
  }
  if (step.label) {
    const field = page
      .locator('.field, label')
      .filter({ hasText: step.label })
      .locator('input, select, textarea')
      .first();
    if (await field.count()) return field;
    return page.getByLabel(step.label, { exact: false }).first();
  }
  if (step.text) {
    const role = step.role || 'button';
    const byRole = page.getByRole(role, { name: new RegExp(step.text, 'i') }).first();
    if (await byRole.count()) return byRole;
    const byLink = page.getByRole('link', { name: new RegExp(step.text, 'i') }).first();
    if (await byLink.count()) return byLink;
    return page.getByText(new RegExp(step.text, 'i')).first();
  }
  if (step.name) return page.locator(`[name="${step.name}"]`).first();
  die(`Step needs testid, selector, label, name, or text: ${JSON.stringify(step)}`);
}

async function login(page, baseUrl, email, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (!page.url().includes('/login')) {
    await waitForShell(page);
    return { reused: true };
  }
  await page.getByTestId('login-form').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await page
    .waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45_000 })
    .catch(() => {});
  await page.waitForTimeout(800);
  if (page.url().includes('/login')) {
    const err = await page.locator('.auth-error, [role="alert"]').first().textContent().catch(() => '');
    die(`Login failed — still on /login. ${err?.trim() || 'Check credentials / rate limit.'}`);
  }
  await waitForShell(page);
  return { reused: false };
}

async function runStep(page, baseUrl, outDir, step, index, log) {
  const action = step.action || 'goto';
  const name = step.name || `${String(index).padStart(2, '0')}-${action}`;
  log(`  step ${index}: ${action}${step.path || step.text || step.label || '' ? ` ${step.path || step.text || step.label}` : ''}`);

  if (action === 'goto') {
    if (!step.path) die('goto step needs path');
    const target = step.path.startsWith('http') ? step.path : `${baseUrl}${step.path}`;
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitForShell(page);
    if (page.url().includes('/login') && !String(step.path).includes('/login')) {
      die(`Session expired at ${step.path} — landed on login.`);
    }
    return;
  }
  if (action === 'click') {
    const loc = await locate(page, step);
    await loc.waitFor({ state: 'visible', timeout: 15_000 });
    await loc.click();
    await page.waitForTimeout(step.waitMs ?? 400);
    return;
  }
  if (action === 'fill') {
    const loc = await locate(page, { ...step, role: 'textbox' });
    await loc.waitFor({ state: 'visible', timeout: 15_000 });
    await loc.fill(String(step.value ?? ''));
    return;
  }
  if (action === 'select') {
    const loc = await locate(page, step);
    await loc.selectOption(step.value).catch(async () => {
      await loc.selectOption({ label: String(step.value) });
    });
    return;
  }
  if (action === 'check' || action === 'uncheck') {
    const loc = await locate(page, step);
    if (action === 'check') await loc.check();
    else await loc.uncheck();
    return;
  }
  if (action === 'upload') {
    const loc = await locate(page, step);
    const files = (step.files || []).map((f) => (path.isAbsolute(f) ? f : path.join(repoRoot, f)));
    await loc.setInputFiles(files);
    return;
  }
  if (action === 'press') {
    await page.keyboard.press(step.key || 'Enter');
    return;
  }
  if (action === 'wait') {
    if (step.text) {
      await page.getByText(new RegExp(step.text, 'i')).first().waitFor({
        state: 'visible',
        timeout: step.timeoutMs || 15_000,
      });
    } else {
      await page.waitForTimeout(step.ms || 1000);
    }
    return;
  }
  if (action === 'screenshot') {
    const file = await shot(page, outDir, name);
    log(`    screenshot ${path.relative(repoRoot, file)}`);
    return;
  }
  if (action === 'snapshot') {
    const snap = await snapshot(page);
    writeSnapshot(outDir, name, snap);
    log(`    snapshot ${snap.url}`);
    return;
  }
  if (action === 'assertText') {
    const visible = await page.getByText(new RegExp(step.text, 'i')).first().isVisible().catch(() => false);
    if (!visible) die(`assertText failed: “${step.text}” not visible on ${page.url()}`);
    return;
  }
  if (action === 'assertNoText') {
    const visible = await page.getByText(new RegExp(step.text, 'i')).first().isVisible().catch(() => false);
    if (visible) die(`assertNoText failed: “${step.text}” is visible on ${page.url()}`);
    return;
  }
  if (action === 'assertUrl') {
    const re = new RegExp(step.match || step.path || '');
    if (!re.test(page.url())) die(`assertUrl failed: ${page.url()} !~ ${re}`);
    return;
  }
  die(`Unknown action: ${action}`);
}

function stepsFromPaths(paths) {
  const steps = [];
  for (const p of paths) {
    const slug = p.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'page';
    steps.push({ action: 'goto', path: p });
    steps.push({ action: 'screenshot', name: slug });
    steps.push({ action: 'snapshot', name: `${slug}-snap` });
  }
  return steps;
}

async function main() {
  const { paths, flags } = parseArgs(process.argv.slice(2));
  const { baseUrl, email, password } = resolveAuth(flags);
  const headed = flags.headed === true || flags.headed === '1';
  const fresh = flags.fresh === true || flags.fresh === '1';
  const runId = stamp();
  const outDir = path.resolve(
    flags.out ? (path.isAbsolute(flags.out) ? flags.out : path.join(repoRoot, flags.out)) : path.join(localDir, 'agent-browse', runId),
  );
  ensureDir(outDir);

  let script = null;
  if (flags.script) script = loadScript(flags.script);
  const steps = script?.steps?.length
    ? script.steps
    : stepsFromPaths(paths.length ? paths : script?.paths || ['/dashboard']);

  const logLines = [];
  const log = (line) => {
    console.log(line);
    logLines.push(line);
  };

  log(`Agent browse → ${baseUrl} as ${email}`);
  log(`Artifacts → ${path.relative(repoRoot, outDir)}`);

  const states = statePaths(baseUrl, email);
  ensureDir(states.dir);
  const hasState = !fresh && fs.existsSync(states.storage);

  const browser = await chromium.launch({
    headless: !headed,
    args: ['--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    storageState: hasState ? states.storage : undefined,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err.message || err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    let sessionOk = false;
    if (hasState) {
      await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      if (!page.url().includes('/login')) {
        sessionOk = true;
        log('  reused saved session');
      } else {
        log('  saved session expired — logging in');
      }
    }
    if (!sessionOk) {
      const result = await login(page, baseUrl, email, password);
      log(result.reused ? '  already signed in' : '  logged in via /login');
      await context.storageState({ path: states.storage });
      fs.writeFileSync(
        states.meta,
        JSON.stringify({ baseUrl, email, savedAt: new Date().toISOString() }, null, 2),
      );
    }

    for (let i = 0; i < steps.length; i++) {
      await runStep(page, baseUrl, outDir, steps[i], i + 1, log);
    }

    const finalSnap = await snapshot(page);
    writeSnapshot(outDir, 'final', finalSnap);
    await shot(page, outDir, 'final');
    const result = {
      ok: true,
      baseUrl,
      email,
      url: finalSnap.url,
      title: finalSnap.title,
      alerts: finalSnap.alerts,
      consoleErrors: consoleErrors.slice(0, 20),
      steps: steps.length,
      outDir: path.relative(repoRoot, outDir).replace(/\\/g, '/'),
    };
    fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(outDir, 'report.md'), `${logLines.join('\n')}\n\nFinal URL: ${finalSnap.url}\n`);
    log(`DONE ${finalSnap.url}`);
    if (consoleErrors.length) log(`  console errors: ${consoleErrors.length}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await shot(page, outDir, 'failure').catch(() => {});
    const snap = await snapshot(page).catch(() => ({ url: page.url(), title: '', text: msg }));
    writeSnapshot(outDir, 'failure', snap);
    fs.writeFileSync(
      path.join(outDir, 'result.json'),
      JSON.stringify(
        {
          ok: false,
          error: msg,
          url: page.url(),
          outDir: path.relative(repoRoot, outDir).replace(/\\/g, '/'),
        },
        null,
        2,
      ),
    );
    log(`FAILED: ${msg}`);
    await browser.close().catch(() => {});
    process.exit(1);
  }

  await browser.close();
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)));
