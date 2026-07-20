import 'server-only';

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';

export type RunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'error';

export interface RunRecord {
  id: string;
  status: RunStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  baseUrl: string;
  email: string;
  exitCode?: number | null;
  log: string[];
  error?: string;
  password?: string;
}

const globalStore = globalThis as unknown as {
  __bookoneE2eRuns?: Map<string, RunRecord>;
  __bookoneE2eChild?: ChildProcessWithoutNullStreams | null;
  __bookoneE2eActiveId?: string | null;
};

function runsMap() {
  if (!globalStore.__bookoneE2eRuns) globalStore.__bookoneE2eRuns = new Map();
  return globalStore.__bookoneE2eRuns;
}

function findE2eRoot(): string {
  const candidates = [
    join(process.cwd(), 'apps', 'e2e-runner'),
    join(process.cwd(), '..', 'e2e-runner'),
    join(process.cwd(), '..', '..', 'apps', 'e2e-runner'),
    '/app/apps/e2e-runner',
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'playwright.config.ts'))) return c;
  }
  throw new Error(
    'E2E runner package not found (apps/e2e-runner). Ensure the monorepo includes apps/e2e-runner.',
  );
}

function runsBaseDir() {
  const root = findE2eRoot();
  const dir = join(root, 'runs');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function runDir(id: string) {
  return join(runsBaseDir(), id);
}

function appendLog(run: RunRecord, line: string) {
  const text = line.replace(/\r/g, '').trimEnd();
  if (!text) return;
  run.log.push(text);
  if (run.log.length > 5000) run.log.splice(0, run.log.length - 4000);
  try {
    writeFileSync(join(runDir(run.id), 'run.log'), run.log.join('\n') + '\n', 'utf8');
  } catch {
    /* ignore */
  }
}

export function publicRun(run: RunRecord) {
  return {
    id: run.id,
    status: run.status,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    baseUrl: run.baseUrl,
    email: run.email,
    exitCode: run.exitCode,
    error: run.error,
    logLines: run.log.length,
  };
}

export function getRun(id: string) {
  return runsMap().get(id) ?? null;
}

export function listRuns() {
  return [...runsMap().values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30);
}

export function getActiveRunId() {
  return globalStore.__bookoneE2eActiveId ?? null;
}

function writeMarkdownReport(run: RunRecord) {
  const dir = runDir(run.id);
  let resultsSnippet = '';
  try {
    if (existsSync(join(dir, 'results.json'))) {
      resultsSnippet = readFileSync(join(dir, 'results.json'), 'utf8').slice(0, 50_000);
    }
  } catch {
    /* ignore */
  }

  const md = [
    `# BookOne E2E Report`,
    ``,
    `- **Run ID:** ${run.id}`,
    `- **Status:** ${run.status}`,
    `- **Target:** ${run.baseUrl}`,
    `- **User:** ${run.email}`,
    `- **Started:** ${run.startedAt ?? '—'}`,
    `- **Finished:** ${run.finishedAt ?? '—'}`,
    `- **Exit code:** ${run.exitCode ?? '—'}`,
    ``,
    `## Log (tail)`,
    ``,
    '```',
    run.log.slice(-200).join('\n'),
    '```',
    ``,
    `## Playwright JSON (excerpt)`,
    ``,
    '```json',
    resultsSnippet || '(no results.json)',
    '```',
    ``,
  ].join('\n');

  writeFileSync(join(dir, 'report.md'), md, 'utf8');
}

function startPlaywright(run: RunRecord) {
  const e2eRoot = findE2eRoot();
  const dir = runDir(run.id);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, 'html'), { recursive: true });
  mkdirSync(join(dir, 'artifacts'), { recursive: true });

  run.status = 'running';
  run.startedAt = new Date().toISOString();
  appendLog(run, `=== BookOne E2E run ${run.id} ===`);
  appendLog(run, `Target: ${run.baseUrl}`);
  appendLog(run, `User: ${run.email}`);
  appendLog(run, `E2E package: ${e2eRoot}`);
  appendLog(run, `Started: ${run.startedAt}`);

  const password = run.password || '';
  delete run.password;

  // Prefer system Chromium in Docker (set on image); fall back to common Alpine paths.
  const systemChrome =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    (existsSync('/usr/bin/chromium-browser')
      ? '/usr/bin/chromium-browser'
      : existsSync('/usr/bin/chromium')
        ? '/usr/bin/chromium'
        : '');

  if (systemChrome) {
    appendLog(run, `Using system Chromium: ${systemChrome}`);
  } else {
    appendLog(run, 'Using Playwright bundled Chromium (install with: pnpm exec playwright install chromium)');
  }

  const env = {
    ...process.env,
    E2E_BASE_URL: run.baseUrl,
    E2E_EMAIL: run.email,
    E2E_PASSWORD: password,
    E2E_HTML_DIR: join(dir, 'html'),
    E2E_JSON_PATH: join(dir, 'results.json'),
    E2E_JUNIT_PATH: join(dir, 'junit.xml'),
    E2E_ARTIFACT_DIR: join(dir, 'artifacts'),
    CI: '1',
    ...(systemChrome
      ? {
          PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: systemChrome,
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
        }
      : {}),
  };

  const isWin = process.platform === 'win32';
  const child = spawn(
    isWin ? 'npx.cmd' : 'npx',
    ['playwright', 'test', '--config', 'playwright.config.ts'],
    {
      cwd: e2eRoot,
      env,
      shell: isWin,
    },
  );

  globalStore.__bookoneE2eChild = child;
  globalStore.__bookoneE2eActiveId = run.id;

  child.stdout?.on('data', (buf: Buffer) => {
    for (const line of buf.toString('utf8').split('\n')) appendLog(run, line);
  });
  child.stderr?.on('data', (buf: Buffer) => {
    for (const line of buf.toString('utf8').split('\n')) appendLog(run, `[err] ${line}`);
  });

  child.on('error', (err) => {
    run.status = 'error';
    run.error = err.message;
    run.finishedAt = new Date().toISOString();
    appendLog(run, `Process error: ${err.message}`);
    appendLog(run, 'Hint: run `cd apps/e2e-runner && npm i && npx playwright install chromium` once.');
    globalStore.__bookoneE2eChild = null;
    globalStore.__bookoneE2eActiveId = null;
    writeFileSync(join(dir, 'summary.json'), JSON.stringify(publicRun(run), null, 2));
  });

  child.on('close', (code) => {
    run.exitCode = code;
    run.finishedAt = new Date().toISOString();
    run.status = code === 0 ? 'passed' : 'failed';
    appendLog(run, `=== Finished exit=${code} status=${run.status} ===`);
    writeFileSync(join(dir, 'summary.json'), JSON.stringify(publicRun(run), null, 2));
    writeMarkdownReport(run);
    globalStore.__bookoneE2eChild = null;
    globalStore.__bookoneE2eActiveId = null;
  });
}

export function createRun(input: {
  email: string;
  password: string;
  baseUrl: string;
}): { ok: true; run: ReturnType<typeof publicRun> } | { ok: false; error: string; status?: number } {
  if (globalStore.__bookoneE2eChild) {
    return {
      ok: false,
      error: 'A run is already in progress',
      status: 409,
    };
  }

  const email = input.email.trim();
  const password = input.password;
  const baseUrl = input.baseUrl.trim().replace(/\/$/, '');

  if (!email || !password) return { ok: false, error: 'email and password are required', status: 400 };
  if (!baseUrl.startsWith('http')) {
    return { ok: false, error: 'baseUrl must start with http:// or https://', status: 400 };
  }

  try {
    findE2eRoot();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'E2E package missing', status: 500 };
  }

  const id = randomUUID();
  const run: RunRecord = {
    id,
    status: 'queued',
    createdAt: new Date().toISOString(),
    baseUrl,
    email,
    log: [],
    password,
  };
  runsMap().set(id, run);
  mkdirSync(runDir(id), { recursive: true });

  try {
    startPlaywright(run);
  } catch (e) {
    run.status = 'error';
    run.error = e instanceof Error ? e.message : String(e);
    appendLog(run, `Failed to start: ${run.error}`);
  }

  return { ok: true, run: publicRun(run) };
}

export function readRunFile(id: string, name: string): string | null {
  const p = join(runDir(id), name);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

export async function buildDownloadBundle(id: string): Promise<{ body: Buffer; contentType: string; filename: string } | null> {
  const dir = runDir(id);
  if (!existsSync(dir)) return null;

  const parts: string[] = [];
  for (const name of ['report.md', 'run.log', 'summary.json', 'results.json', 'junit.xml']) {
    const p = join(dir, name);
    if (existsSync(p)) {
      parts.push(`\n\n===== FILE: ${name} =====\n\n`);
      parts.push(readFileSync(p, 'utf8'));
    }
  }
  const art = join(dir, 'artifacts');
  if (existsSync(art)) {
    parts.push(`\n\n===== ARTIFACTS =====\n`);
    try {
      const walk = (d: string, prefix = '') => {
        for (const ent of readdirSync(d)) {
          const full = join(d, ent);
          const st = statSync(full);
          if (st.isDirectory()) walk(full, `${prefix}${ent}/`);
          else parts.push(`${prefix}${ent} (${st.size} bytes)\n`);
        }
      };
      walk(art);
    } catch {
      /* ignore */
    }
  }

  const text = parts.join('');
  const txtPath = join(dir, 'report-bundle.txt');
  const gzPath = join(dir, 'report-bundle.txt.gz');
  writeFileSync(txtPath, text, 'utf8');

  try {
    await pipeline(createReadStream(txtPath), createGzip(), createWriteStream(gzPath));
    return {
      body: readFileSync(gzPath),
      contentType: 'application/gzip',
      filename: `bookone-e2e-${id}.txt.gz`,
    };
  } catch {
    return {
      body: Buffer.from(text, 'utf8'),
      contentType: 'text/plain; charset=utf-8',
      filename: `bookone-e2e-${id}.txt`,
    };
  }
}
