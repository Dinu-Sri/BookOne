/**
 * Parse Playwright results.json → human + agent-friendly failure reports.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { E2E_BUCKETS, bucketIdForFile, getBucket } from './buckets';

export type FailureItem = {
  title: string;
  file: string;
  line?: number;
  bucket: string;
  bucketLabel: string;
  error: string;
  errorShort: string;
  durationMs?: number;
  humanHint: string;
};

export type BucketSummary = {
  id: string;
  label: string;
  passed: number;
  failed: number;
  skipped: number;
  timedOut: number;
  failures: FailureItem[];
};

export type RunSummary = {
  totals: {
    passed: number;
    failed: number;
    skipped: number;
    timedOut: number;
    interrupted: number;
    expected: number;
  };
  byBucket: BucketSummary[];
  failures: FailureItem[];
  generatedAt: string;
};

function humanHint(error: string, title: string): string {
  const e = error.toLowerCase();
  if (e.includes('invalid email or password')) {
    return (
      'Login rejected. Often rate-limiting or session thrash after many wrong-password tests. ' +
      'Re-run this bucket alone; use a staging user; avoid running full suite immediately after auth failures.'
    );
  }
  if (e.includes('page crashed') || e.includes('browser has been closed') || e.includes('target closed')) {
    return 'Browser/page died (memory or timeout). Re-run this single bucket; prefer core/bucket runs over multi-hour full.';
  }
  if (e.includes('timeout') || e.includes('exceeded')) {
    return 'Timed out waiting for UI. Page may be slow, selector wrong, or action blocked. Check screenshot/trace for the step.';
  }
  if (e.includes('tobevisible') || e.includes('locator')) {
    return 'Expected UI element not found. DOM/selector mismatch (e.g. POS uses .pos-root not .workspace).';
  }
  if (e.includes('select a brand') || e.includes('select a location')) {
    return 'Brand/location masters required but not filled. Ensure company has linked brand↔location or helpers pass dimensions.';
  }
  if (e.includes('credit limit')) {
    return 'Credit limit enforcement path. Check Sales settings enforce flag and party creditLimit.';
  }
  if (title.toLowerCase().includes('setup') || title.toLowerCase().includes('create customer')) {
    return 'Foundation setup failed — later tests in the pack may be weak without this data. Fix create/master helpers first.';
  }
  return 'See error + artifacts. Re-run this bucket alone for a clean log.';
}

function shortError(msg: string): string {
  const first = msg.split(/\n/)[0] || msg;
  return first.replace(/^Error:\s*/i, '').slice(0, 220);
}

type PwSpec = {
  title: string;
  ok?: boolean;
  file?: string;
  line?: number;
  tests?: Array<{
    results?: Array<{
      status?: string;
      duration?: number;
      error?: { message?: string };
      errors?: Array<{ message?: string }>;
    }>;
  }>;
};

function walkSuites(node: unknown, out: PwSpec[]) {
  if (!node || typeof node !== 'object') return;
  const n = node as { specs?: PwSpec[]; suites?: unknown[] };
  if (Array.isArray(n.specs)) {
    for (const s of n.specs) out.push(s);
  }
  if (Array.isArray(n.suites)) {
    for (const s of n.suites) walkSuites(s, out);
  }
}

export function buildRunSummary(resultsJsonPath: string): RunSummary {
  const empty: RunSummary = {
    totals: { passed: 0, failed: 0, skipped: 0, timedOut: 0, interrupted: 0, expected: 0 },
    byBucket: [],
    failures: [],
    generatedAt: new Date().toISOString(),
  };

  if (!existsSync(resultsJsonPath)) return empty;

  let data: { suites?: unknown[]; stats?: Record<string, number> };
  try {
    data = JSON.parse(readFileSync(resultsJsonPath, 'utf8'));
  } catch {
    return empty;
  }

  const specs: PwSpec[] = [];
  for (const s of data.suites ?? []) walkSuites(s, specs);

  const bucketMap = new Map<string, BucketSummary>();
  for (const b of E2E_BUCKETS) {
    bucketMap.set(b.id, {
      id: b.id,
      label: b.label,
      passed: 0,
      failed: 0,
      skipped: 0,
      timedOut: 0,
      failures: [],
    });
  }
  bucketMap.set('other', {
    id: 'other',
    label: 'Other',
    passed: 0,
    failed: 0,
    skipped: 0,
    timedOut: 0,
    failures: [],
  });

  const failures: FailureItem[] = [];
  const totals = { ...empty.totals };

  for (const spec of specs) {
    const file = spec.file || 'unknown';
    const bid = bucketIdForFile(file);
    const bucket = bucketMap.get(bid) || bucketMap.get('other')!;
    const result = spec.tests?.[0]?.results?.[spec.tests[0].results.length - 1];
    const status = result?.status || (spec.ok ? 'passed' : 'failed');

    if (status === 'passed' || status === 'expected') {
      totals.passed++;
      bucket.passed++;
      continue;
    }
    if (status === 'skipped') {
      totals.skipped++;
      bucket.skipped++;
      continue;
    }
    if (status === 'timedOut') {
      totals.timedOut++;
      bucket.timedOut++;
    } else if (status === 'interrupted') {
      totals.interrupted++;
    } else {
      totals.failed++;
      bucket.failed++;
    }

    const errMsg =
      result?.error?.message ||
      result?.errors?.[0]?.message ||
      (spec.ok === false ? 'Failed (no message)' : status);

    if (status === 'passed') continue;

    const item: FailureItem = {
      title: spec.title,
      file,
      line: spec.line,
      bucket: bid,
      bucketLabel: getBucket(bid)?.label || bucket.label,
      error: errMsg,
      errorShort: shortError(errMsg),
      durationMs: result?.duration,
      humanHint: humanHint(errMsg, spec.title),
    };
    failures.push(item);
    bucket.failures.push(item);
  }

  // Prefer playwright stats when present
  if (data.stats) {
    totals.expected = data.stats.expected ?? totals.passed;
    if (data.stats.unexpected != null) totals.failed = data.stats.unexpected;
    if (data.stats.skipped != null) totals.skipped = data.stats.skipped;
    if (data.stats.flaky != null) {
      /* ignore */
    }
  }

  const byBucket = [...bucketMap.values()].filter(
    (b) => b.passed + b.failed + b.skipped + b.timedOut > 0 || b.failures.length > 0,
  );

  return {
    totals,
    byBucket,
    failures,
    generatedAt: new Date().toISOString(),
  };
}

export function writeRunReports(dir: string, meta: {
  runId: string;
  status: string;
  baseUrl: string;
  email: string;
  suite: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
  logTail?: string[];
}) {
  const resultsPath = join(dir, 'results.json');
  const summary = buildRunSummary(resultsPath);
  writeFileSync(join(dir, 'summary.json'), JSON.stringify({ ...meta, summary }, null, 2), 'utf8');

  // Human report.md
  const lines: string[] = [
    `# BookOne E2E Report`,
    ``,
    `- **Run ID:** ${meta.runId}`,
    `- **Status:** ${meta.status}`,
    `- **Suite / bucket:** ${meta.suite}`,
    `- **Target:** ${meta.baseUrl}`,
    `- **User:** ${meta.email}`,
    `- **Started:** ${meta.startedAt ?? '—'}`,
    `- **Finished:** ${meta.finishedAt ?? '—'}`,
    `- **Exit code:** ${meta.exitCode ?? '—'}`,
    ``,
    `## Totals`,
    ``,
    `| Passed | Failed | Skipped | Timed out |`,
    `|-------:|-------:|--------:|----------:|`,
    `| ${summary.totals.passed} | ${summary.totals.failed} | ${summary.totals.skipped} | ${summary.totals.timedOut} |`,
    ``,
    `## By bucket`,
    ``,
    `| Bucket | Passed | Failed | Skipped |`,
    `|--------|-------:|-------:|--------:|`,
  ];

  for (const b of summary.byBucket) {
    lines.push(`| ${b.label} (\`${b.id}\`) | ${b.passed} | ${b.failed} | ${b.skipped} |`);
  }

  lines.push(``, `## Failures (human)`, ``);
  if (summary.failures.length === 0) {
    lines.push('_No failures._', ``);
  } else {
    for (const f of summary.failures) {
      lines.push(`### ${f.title}`);
      lines.push(``);
      lines.push(`- **Bucket:** ${f.bucketLabel} (\`${f.bucket}\`)`);
      lines.push(`- **File:** \`${f.file}${f.line ? `:${f.line}` : ''}\``);
      lines.push(`- **Error:** ${f.errorShort}`);
      lines.push(`- **What to do:** ${f.humanHint}`);
      lines.push(``);
    }
  }

  lines.push(`## Log (tail)`, ``, '```', ...(meta.logTail ?? []).slice(-150), '```', ``);
  lines.push(`## How to re-run just this area`, ``);
  lines.push(`From /e2e pick the **bucket** that failed, or CLI:`, ``);
  lines.push('```bash', `E2E_SUITE=<bucket-id> pnpm test:e2e`, '```', ``);
  writeFileSync(join(dir, 'report.md'), lines.join('\n'), 'utf8');

  // Agent-oriented failures.md
  const agent: string[] = [
    `# BookOne E2E failures — agent brief`,
    ``,
    `Run \`${meta.runId}\` · suite \`${meta.suite}\` · target \`${meta.baseUrl}\``,
    ``,
    `## Quick counts`,
    `passed=${summary.totals.passed} failed=${summary.totals.failed} skipped=${summary.totals.skipped}`,
    ``,
    `## Failures (full error text)`,
    ``,
  ];
  for (const f of summary.failures) {
    agent.push(`### ${f.title}`);
    agent.push(`- bucket: ${f.bucket}`);
    agent.push(`- file: ${f.file}${f.line ? `:${f.line}` : ''}`);
    agent.push(`- hint: ${f.humanHint}`);
    agent.push(``);
    agent.push('```');
    agent.push(f.error.slice(0, 4000));
    agent.push('```');
    agent.push(``);
  }
  if (!summary.failures.length) agent.push('_None._', ``);
  writeFileSync(join(dir, 'failures.md'), agent.join('\n'), 'utf8');

  // Per-bucket failure MDs
  const bucketDir = join(dir, 'buckets');
  mkdirSync(bucketDir, { recursive: true });
  for (const b of summary.byBucket) {
    if (!b.failures.length) continue;
    const bl: string[] = [
      `# Bucket: ${b.label} (\`${b.id}\`)`,
      ``,
      `passed=${b.passed} failed=${b.failed} skipped=${b.skipped}`,
      ``,
      `Re-run: set **Suite** to \`${b.id}\` on /e2e or \`E2E_SUITE=${b.id}\`.`,
      ``,
    ];
    for (const f of b.failures) {
      bl.push(`## ${f.title}`, ``, f.humanHint, ``, '```', f.error.slice(0, 3000), '```', ``);
    }
    writeFileSync(join(bucketDir, `${b.id}-failures.md`), bl.join('\n'), 'utf8');
  }

  return summary;
}
