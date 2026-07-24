/**
 * Build human + agent failure reports from Playwright results.json.
 * Kept in web package so Next can import it without TS path issues.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

type BucketDef = { id: string; label: string; files: string[] };

function loadBuckets(e2eRoot: string): BucketDef[] {
  const p = join(e2eRoot, 'src/catalog/buckets.json');
  if (!existsSync(p)) return [];
  try {
    const j = JSON.parse(readFileSync(p, 'utf8'));
    return j.buckets || [];
  } catch {
    return [];
  }
}

function bucketIdForFile(file: string, buckets: BucketDef[]): string {
  const base = file.replace(/^.*[/\\]/, '');
  return buckets.find((b) => b.files.includes(base))?.id ?? 'other';
}

function humanHint(error: string, title: string): string {
  const e = error.toLowerCase();
  if (e.includes('invalid email or password')) {
    return 'Login rejected (often rate-limit after many failed logins). Re-run this single bucket; use staging user; wait 1–2 min after auth pack.';
  }
  if (e.includes('page crashed') || e.includes('browser has been closed') || e.includes('target closed')) {
    return 'Browser crashed or closed. Re-run this bucket alone; avoid multi-hour full runs when debugging.';
  }
  if (e.includes('timeout') || e.includes('exceeded')) {
    return 'Timed out waiting for UI. Check selectors, slow server, or blocked form submit.';
  }
  if (e.includes('tobevisible') || e.includes('locator') || e.includes('element(s) not found')) {
    return 'UI element missing. POS uses .pos-root; some pages differ from .workspace shell.';
  }
  if (e.includes('select a brand') || e.includes('select a location')) {
    return 'Brand/location required but not set. Link location to brand under Company, or pass dimensions in the test.';
  }
  if (title.toLowerCase().includes('setup')) {
    return 'Setup step failed — fix masters/create helpers first for this pack.';
  }
  return 'See full error below. Re-run only this bucket from /e2e for a clean log.';
}

function shortError(msg: string): string {
  return (msg.split(/\n/)[0] || msg).replace(/^Error:\s*/i, '').slice(0, 240);
}

type FailureItem = {
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

export type PublicSummary = {
  totals: { passed: number; failed: number; skipped: number; timedOut: number };
  byBucket: Array<{
    id: string;
    label: string;
    passed: number;
    failed: number;
    skipped: number;
    timedOut: number;
    failures: FailureItem[];
  }>;
  failures: FailureItem[];
  generatedAt: string;
};

function walkSpecs(node: unknown, out: Array<Record<string, unknown>>) {
  if (!node || typeof node !== 'object') return;
  const n = node as { specs?: unknown[]; suites?: unknown[] };
  if (Array.isArray(n.specs)) out.push(...(n.specs as Array<Record<string, unknown>>));
  if (Array.isArray(n.suites)) for (const s of n.suites) walkSpecs(s, out);
}

export function buildPublicSummary(dir: string, e2eRoot: string): PublicSummary {
  const buckets = loadBuckets(e2eRoot);
  const empty: PublicSummary = {
    totals: { passed: 0, failed: 0, skipped: 0, timedOut: 0 },
    byBucket: [],
    failures: [],
    generatedAt: new Date().toISOString(),
  };
  const resultsPath = join(dir, 'results.json');
  if (!existsSync(resultsPath)) return empty;

  let data: { suites?: unknown[]; stats?: Record<string, number> };
  try {
    data = JSON.parse(readFileSync(resultsPath, 'utf8'));
  } catch {
    return empty;
  }

  const specs: Array<Record<string, unknown>> = [];
  for (const s of data.suites ?? []) walkSpecs(s, specs);

  const map = new Map<string, PublicSummary['byBucket'][0]>();
  for (const b of buckets) {
    map.set(b.id, {
      id: b.id,
      label: b.label,
      passed: 0,
      failed: 0,
      skipped: 0,
      timedOut: 0,
      failures: [],
    });
  }
  map.set('other', {
    id: 'other',
    label: 'Other',
    passed: 0,
    failed: 0,
    skipped: 0,
    timedOut: 0,
    failures: [],
  });

  const failures: FailureItem[] = [];
  const totals = { passed: 0, failed: 0, skipped: 0, timedOut: 0 };

  for (const spec of specs) {
    const file = String(spec.file || 'unknown');
    const bid = bucketIdForFile(file, buckets);
    const bucket = map.get(bid) || map.get('other')!;
    const tests = spec.tests as Array<{ results?: Array<Record<string, unknown>> }> | undefined;
    const results = tests?.[0]?.results;
    const result = results?.[results.length - 1];
    const status = String(result?.status || (spec.ok ? 'passed' : 'failed'));

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
    } else {
      totals.failed++;
      bucket.failed++;
    }

    const errObj = result?.error as { message?: string } | undefined;
    const errs = result?.errors as Array<{ message?: string }> | undefined;
    const errMsg = errObj?.message || errs?.[0]?.message || status;
    const title = String(spec.title || 'unnamed');
    const item: FailureItem = {
      title,
      file,
      line: typeof spec.line === 'number' ? spec.line : undefined,
      bucket: bid,
      bucketLabel: buckets.find((b) => b.id === bid)?.label || bucket.label,
      error: errMsg,
      errorShort: shortError(errMsg),
      durationMs: typeof result?.duration === 'number' ? result.duration : undefined,
      humanHint: humanHint(errMsg, title),
    };
    failures.push(item);
    bucket.failures.push(item);
  }

  if (data.stats) {
    if (typeof data.stats.expected === 'number') totals.passed = data.stats.expected;
    if (typeof data.stats.unexpected === 'number') totals.failed = data.stats.unexpected;
    if (typeof data.stats.skipped === 'number') totals.skipped = data.stats.skipped;
  }

  return {
    totals,
    byBucket: [...map.values()].filter(
      (b) => b.passed + b.failed + b.skipped + b.timedOut > 0 || b.failures.length > 0,
    ),
    failures,
    generatedAt: new Date().toISOString(),
  };
}

export function writeRichReports(
  dir: string,
  e2eRoot: string,
  meta: {
    runId: string;
    status: string;
    baseUrl: string;
    email: string;
    suite: string;
    startedAt?: string;
    finishedAt?: string;
    exitCode?: number | null;
    logTail?: string[];
  },
): PublicSummary {
  const summary = buildPublicSummary(dir, e2eRoot);
  writeFileSync(join(dir, 'summary.json'), JSON.stringify({ meta, summary }, null, 2), 'utf8');

  const lines: string[] = [
    `# BookOne E2E Report`,
    ``,
    `- **Run ID:** ${meta.runId}`,
    `- **Status:** ${meta.status}`,
    `- **Suite / bucket:** \`${meta.suite}\``,
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
  lines.push(``, `## Failures (human-readable)`, ``);
  if (!summary.failures.length) {
    lines.push('_No failures._', ``);
  } else {
    for (const f of summary.failures) {
      lines.push(
        `### ${f.title}`,
        ``,
        `- **Bucket:** ${f.bucketLabel} (\`${f.bucket}\`)`,
        `- **File:** \`${f.file}${f.line ? `:${f.line}` : ''}\``,
        `- **Error:** ${f.errorShort}`,
        `- **What to do:** ${f.humanHint}`,
        ``,
      );
    }
  }
  lines.push(
    `## Log (tail)`,
    ``,
    '```',
    ...(meta.logTail ?? []).slice(-120),
    '```',
    ``,
    `## Re-run one bucket`,
    ``,
    `On /e2e select the bucket id, or:`,
    ``,
    '```bash',
    `E2E_SUITE=<bucket-id>  # e.g. sales, auth, settings-matrix`,
    '```',
    ``,
  );
  writeFileSync(join(dir, 'report.md'), lines.join('\n'), 'utf8');

  const agent = [
    `# BookOne E2E failures — agent brief`,
    ``,
    `Run \`${meta.runId}\` · suite \`${meta.suite}\` · ${meta.baseUrl}`,
    ``,
    `passed=${summary.totals.passed} failed=${summary.totals.failed} skipped=${summary.totals.skipped}`,
    ``,
  ];
  for (const f of summary.failures) {
    agent.push(
      `### ${f.title}`,
      `- bucket: ${f.bucket}`,
      `- file: ${f.file}${f.line ? `:${f.line}` : ''}`,
      `- hint: ${f.humanHint}`,
      ``,
      '```',
      f.error.slice(0, 4000),
      '```',
      ``,
    );
  }
  if (!summary.failures.length) agent.push('_None._', ``);
  writeFileSync(join(dir, 'failures.md'), agent.join('\n'), 'utf8');

  const bucketDir = join(dir, 'buckets');
  mkdirSync(bucketDir, { recursive: true });
  for (const b of summary.byBucket) {
    if (!b.failures.length) continue;
    const bl = [
      `# Bucket failures: ${b.label} (\`${b.id}\`)`,
      ``,
      `passed=${b.passed} failed=${b.failed} skipped=${b.skipped}`,
      ``,
      `Re-run from /e2e with suite=\`${b.id}\`.`,
      ``,
    ];
    for (const f of b.failures) {
      bl.push(`## ${f.title}`, ``, f.humanHint, ``, '```', f.error.slice(0, 3500), '```', ``);
    }
    writeFileSync(join(bucketDir, `${b.id}-failures.md`), bl.join('\n'), 'utf8');
  }

  return summary;
}

export function listBucketFailureFiles(dir: string): string[] {
  const bucketDir = join(dir, 'buckets');
  if (!existsSync(bucketDir)) return [];
  return readdirSync(bucketDir).filter((f) => f.endsWith('.md'));
}

export function loadBucketsCatalog(e2eRoot: string) {
  const p = join(e2eRoot, 'src/catalog/buckets.json');
  if (!existsSync(p)) return { buckets: [], presets: [] };
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return { buckets: [], presets: [] };
  }
}
