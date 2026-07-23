/**
 * BookOne E2E QA Runner
 * Separate process/URL from the main ERP app.
 * UI: enter email/password → Start → Playwright runs against E2E_BASE_URL → download report.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { createReadStream } from 'node:fs';
import express from 'express';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RUNS_DIR = join(ROOT, 'runs');
const PORT = Number(process.env.E2E_RUNNER_PORT || 3200);
const DEFAULT_BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3100';
// No runner secret — prefer main app UI at /e2e. Standalone port 3200 is optional.

type RunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'error';

interface RunRecord {
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
}

const runs = new Map<string, RunRecord>();
let activeChild: ChildProcessWithoutNullStreams | null = null;
let activeRunId: string | null = null;

function ensureDirs() {
  mkdirSync(RUNS_DIR, { recursive: true });
}

function runDir(id: string) {
  return join(RUNS_DIR, id);
}

function appendLog(run: RunRecord, line: string) {
  const text = line.replace(/\r/g, '').trimEnd();
  if (!text) return;
  run.log.push(text);
  // Cap in-memory log
  if (run.log.length > 5000) run.log.splice(0, run.log.length - 4000);
  try {
    writeFileSync(join(runDir(run.id), 'run.log'), run.log.join('\n') + '\n', 'utf8');
  } catch {
    /* ignore */
  }
}

function runPlaywrightArgs(extra: string[]): string[] {
  return ['playwright', 'test', '--config', 'playwright.config.ts', ...extra];
}

async function startPlaywright(run: RunRecord) {
  const dir = runDir(run.id);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, 'html'), { recursive: true });
  mkdirSync(join(dir, 'artifacts'), { recursive: true });

  run.status = 'running';
  run.startedAt = new Date().toISOString();
  appendLog(run, `=== BookOne E2E run ${run.id} ===`);
  appendLog(run, `Target: ${run.baseUrl}`);
  appendLog(run, `User: ${run.email}`);
  appendLog(run, `Started: ${run.startedAt}`);

  const password = (run as RunRecord & { password?: string }).password || '';
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
  };

  // Preflight: one login test — fail fast on bad credentials (avoids 70+ cascade failures)
  appendLog(run, 'Preflight: verifying email/password against target app…');
  const preflightOk = await new Promise<boolean>((resolve) => {
    const pre = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      runPlaywrightArgs([
        'tests/00-smoke.spec.ts',
        '-g',
        'login lands on app shell',
        '--reporter=line',
      ]),
      {
        cwd: ROOT,
        env: { ...env, E2E_PASSWORD: password },
        shell: false,
      },
    );
    pre.stdout.on('data', (buf: Buffer) => {
      for (const line of buf.toString('utf8').split('\n')) appendLog(run, line);
    });
    pre.stderr.on('data', (buf: Buffer) => {
      for (const line of buf.toString('utf8').split('\n')) appendLog(run, `[err] ${line}`);
    });
    pre.on('close', (code) => resolve(code === 0));
    pre.on('error', () => resolve(false));
  });

  if (!preflightOk) {
    run.status = 'failed';
    run.exitCode = 1;
    run.finishedAt = new Date().toISOString();
    run.error =
      'Login preflight failed: Invalid email or password (or app unreachable). ' +
      'Fix credentials in the form, confirm the user can log in manually at the target URL, then re-run. ' +
      'Do not start the full suite until login works.';
    appendLog(run, '');
    appendLog(run, '═══════════════════════════════════════════════════════════');
    appendLog(run, 'PREFLIGHT FAILED — full suite aborted');
    appendLog(run, run.error);
    appendLog(run, '═══════════════════════════════════════════════════════════');
    writeFileSync(join(dir, 'summary.json'), JSON.stringify(publicRun(run), null, 2));
    writeMarkdownReport(run);
    activeChild = null;
    activeRunId = null;
    return;
  }

  appendLog(run, 'Preflight OK — starting full Playwright suite…');

  const child = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    runPlaywrightArgs([]),
    {
      cwd: ROOT,
      env: { ...env, E2E_PASSWORD: password },
      shell: false,
    },
  );

  activeChild = child;
  activeRunId = run.id;

  child.stdout.on('data', (buf: Buffer) => {
    for (const line of buf.toString('utf8').split('\n')) appendLog(run, line);
  });
  child.stderr.on('data', (buf: Buffer) => {
    for (const line of buf.toString('utf8').split('\n')) appendLog(run, `[err] ${line}`);
  });

  child.on('error', (err) => {
    run.status = 'error';
    run.error = err.message;
    run.finishedAt = new Date().toISOString();
    appendLog(run, `Process error: ${err.message}`);
    activeChild = null;
    activeRunId = null;
    writeFileSync(join(dir, 'summary.json'), JSON.stringify(publicRun(run), null, 2));
  });

  child.on('close', (code) => {
    run.exitCode = code;
    run.finishedAt = new Date().toISOString();
    run.status = code === 0 ? 'passed' : 'failed';
    appendLog(run, `=== Finished exit=${code} status=${run.status} ===`);
    writeFileSync(join(dir, 'summary.json'), JSON.stringify(publicRun(run), null, 2));
    // Write a human markdown report
    writeMarkdownReport(run);
    activeChild = null;
    activeRunId = null;
  });
}

function publicRun(run: RunRecord) {
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
    `## How to share with engineering`,
    ``,
    `1. Download the report zip from the QA runner UI.`,
    `2. Include \`report.md\`, \`run.log\`, \`results.json\`, and failure screenshots under \`artifacts/\`.`,
    ``,
  ].join('\n');

  writeFileSync(join(dir, 'report.md'), md, 'utf8');
}

const app = express();
app.use(express.json({ limit: '256kb' }));

const publicDir = join(ROOT, 'public');
const indexHtml = join(publicDir, 'index.html');

// Explicit home — must not 404 on bookone-e2e.* host
app.get('/', (_req, res) => {
  if (existsSync(indexHtml)) {
    res.sendFile(indexHtml);
    return;
  }
  res
    .status(500)
    .type('text/plain')
    .send('BookOne E2E runner: public/index.html missing in image.');
});

app.use(express.static(publicDir));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'bookone-e2e-runner',
    defaultBaseUrl: DEFAULT_BASE_URL,
    activeRunId,
    publicDir,
    hasIndex: existsSync(indexHtml),
  });
});

app.get('/api/runs', (_req, res) => {
  const list = [...runs.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30)
    .map(publicRun);
  res.json(list);
});

app.get('/api/runs/:id', (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json({
    ...publicRun(run),
    log: run.log,
  });
});

app.post('/api/runs', async (req, res) => {
  if (activeChild) {
    return res.status(409).json({ error: 'A run is already in progress', activeRunId });
  }

  const email = String(req.body?.email || '').trim();
  const password = String(req.body?.password || '');
  const baseUrl = String(req.body?.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/$/, '');

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  if (!baseUrl.startsWith('http')) {
    return res.status(400).json({ error: 'baseUrl must start with http:// or https://' });
  }

  ensureDirs();
  const id = randomUUID();
  const run: RunRecord & { password?: string } = {
    id,
    status: 'queued',
    createdAt: new Date().toISOString(),
    baseUrl,
    email,
    log: [],
    password,
  };
  runs.set(id, run);
  mkdirSync(runDir(id), { recursive: true });

  // Fire and forget
  void startPlaywright(run).catch((e) => {
    run.status = 'error';
    run.error = e instanceof Error ? e.message : String(e);
    appendLog(run, `Failed to start: ${run.error}`);
  });

  // Clear password from memory object after a tick (spawn already got env copy)
  setTimeout(() => {
    delete run.password;
  }, 1000);

  res.status(202).json(publicRun(run));
});

app.get('/api/runs/:id/report.md', (req, res) => {
  const file = join(runDir(req.params.id), 'report.md');
  if (!existsSync(file)) return res.status(404).json({ error: 'Report not ready' });
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="bookone-e2e-${req.params.id}.md"`);
  res.send(readFileSync(file, 'utf8'));
});

app.get('/api/runs/:id/log', (req, res) => {
  const file = join(runDir(req.params.id), 'run.log');
  if (!existsSync(file)) {
    const run = runs.get(req.params.id);
    if (!run) return res.status(404).json({ error: 'Not found' });
    res.type('text/plain').send(run.log.join('\n'));
    return;
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="bookone-e2e-${req.params.id}.log"`);
  res.send(readFileSync(file, 'utf8'));
});

app.get('/api/runs/:id/download', async (req, res) => {
  const dir = runDir(req.params.id);
  if (!existsSync(dir)) return res.status(404).json({ error: 'Run not found' });

  // Stream a simple tar-like concatenation as .txt bundle if tar not available —
  // Prefer packaging key files into one markdown+log bundle for easy sharing.
  const parts: string[] = [];
  for (const name of ['report.md', 'run.log', 'summary.json', 'results.json', 'junit.xml']) {
    const p = join(dir, name);
    if (existsSync(p)) {
      parts.push(`\n\n===== FILE: ${name} =====\n\n`);
      parts.push(readFileSync(p, 'utf8'));
    }
  }
  // List artifact files
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

  const body = parts.join('');
  const gzPath = join(dir, 'report-bundle.txt.gz');
  writeFileSync(join(dir, 'report-bundle.txt'), body, 'utf8');

  try {
    await pipeline(createReadStream(join(dir, 'report-bundle.txt')), createGzip(), createWriteStream(gzPath));
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="bookone-e2e-${req.params.id}.txt.gz"`);
    createReadStream(gzPath).pipe(res);
  } catch {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bookone-e2e-${req.params.id}.txt"`);
    res.send(body);
  }
});

// SPA-style fallback for unknown non-API paths
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
  if (existsSync(indexHtml)) {
    res.sendFile(indexHtml);
    return;
  }
  next();
});

ensureDirs();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`BookOne E2E runner listening on http://0.0.0.0:${PORT}`);
  console.log(`Default target app: ${DEFAULT_BASE_URL}`);
  console.log(`UI: open https://bookone-e2e.<your-domain>/ (standalone service)`);
});

