/**
 * Report or bump BookOne E2E system level.
 *
 *   node apps/e2e-runner/scripts/e2e-level.mjs
 *   node apps/e2e-runner/scripts/e2e-level.mjs --json
 *   node apps/e2e-runner/scripts/e2e-level.mjs bump 1.1.0 "Deep money paths"
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const e2eRoot = join(here, '..');
const repoRoot = join(e2eRoot, '../..');
const catalogDir = join(e2eRoot, 'src/catalog');

const paths = {
  level: join(catalogDir, 'level.json'),
  backlog: join(catalogDir, 'backlog.json'),
  scenarios: join(catalogDir, 'scenarios.json'),
  coverage: join(catalogDir, 'coverage.generated.json'),
};

function readJson(p, fallback = null) {
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function loadSnapshot() {
  const level = readJson(paths.level, {});
  const backlog = readJson(paths.backlog, { items: [] });
  const scenarios = readJson(paths.scenarios, []);
  const coverage = readJson(paths.coverage, null);

  const items = backlog.items || [];
  const byStatus = {};
  for (const it of items) {
    byStatus[it.status] = (byStatus[it.status] || 0) + 1;
  }
  const open = items.filter((i) =>
    ['planned', 'in_progress', 'automated_load'].includes(i.status),
  );

  const lastId =
    scenarios.length > 0 ? scenarios[scenarios.length - 1].id : level.catalog?.last_scenario_id;

  return {
    e2e_level: level.e2e_level ?? '0.0.0',
    label: level.label ?? '',
    released_at: level.released_at ?? '',
    next_level: level.next_level ?? null,
    catalog: {
      scenario_count: Array.isArray(scenarios) ? scenarios.length : 0,
      last_scenario_id: lastId,
      level_snapshot_count: level.catalog?.scenario_count,
    },
    coverage: coverage
      ? {
          ids_referenced: coverage.summary?.referenced,
          ids_missing: coverage.summary?.missing,
          coverage_pct: coverage.summary?.coverage_pct,
          generated_at: coverage.summary?.generated_at,
        }
      : level.coverage ?? null,
    backlog: {
      total: items.length,
      open: open.length,
      by_status: byStatus,
      open_items: open.map((i) => ({
        id: i.id,
        title: i.title,
        priority: i.priority,
        status: i.status,
        target_depth: i.target_depth,
        kind: i.kind,
      })),
    },
    drift: {
      catalog_grew_since_level:
        Array.isArray(scenarios) &&
        level.catalog?.scenario_count != null &&
        scenarios.length !== level.catalog.scenario_count
          ? {
              level_count: level.catalog.scenario_count,
              now_count: scenarios.length,
              hint: 'Run export-catalog + coverage, update tests/backlog, then level:bump',
            }
          : null,
      missing_ids: coverage?.summary?.missing > 0 ? coverage.summary.missing : 0,
    },
  };
}

function printHuman(snap) {
  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log(' BookOne E2E system level');
  console.log('══════════════════════════════════════════════');
  console.log(` Current level : ${snap.e2e_level}${snap.label ? ` — ${snap.label}` : ''}`);
  if (snap.released_at) console.log(` Released      : ${snap.released_at}`);
  console.log(
    ` Catalog       : ${snap.catalog.scenario_count} scenarios (last ${snap.catalog.last_scenario_id})`,
  );
  if (snap.coverage) {
    console.log(
      ` Coverage      : ${snap.coverage.coverage_pct ?? '?'}% ` +
        `(${snap.coverage.ids_referenced ?? '?'}/${snap.catalog.scenario_count} IDs, ` +
        `missing ${snap.coverage.ids_missing ?? '?'})`,
    );
  } else {
    console.log(' Coverage      : (run pnpm coverage)');
  }
  if (snap.next_level) {
    console.log(` Next level    : ${snap.next_level.e2e_level} — ${snap.next_level.theme || ''}`);
    if (Array.isArray(snap.next_level.focus)) {
      for (const f of snap.next_level.focus) console.log(`   • ${f}`);
    }
  }
  console.log(
    ` Backlog open  : ${snap.backlog.open} / ${snap.backlog.total}  ${JSON.stringify(snap.backlog.by_status)}`,
  );
  if (snap.backlog.open_items.length) {
    console.log(' Open backlog:');
    for (const it of snap.backlog.open_items.slice(0, 15)) {
      console.log(
        `   - ${it.id} [${it.priority}/${it.status}→${it.target_depth}] ${it.title}`,
      );
    }
    if (snap.backlog.open_items.length > 15) {
      console.log(`   … +${snap.backlog.open_items.length - 15} more`);
    }
  }
  if (snap.drift.catalog_grew_since_level) {
    console.log('');
    console.log(' ⚠ CATALOG DRIFT: scenario count changed since last level snapshot.');
    console.log(`   level.json had ${snap.drift.catalog_grew_since_level.level_count}, now ${snap.drift.catalog_grew_since_level.now_count}`);
    console.log(`   ${snap.drift.catalog_grew_since_level.hint}`);
  }
  if (snap.drift.missing_ids > 0) {
    console.log('');
    console.log(` ⚠ ${snap.drift.missing_ids} catalog IDs not referenced in tests — add tests or section loaders.`);
  }
  console.log('');
  console.log(' Docs: docs/E2E_GOVERNANCE.md');
  console.log('══════════════════════════════════════════════');
  console.log('');
}

function bumpLevel(newLevel, label) {
  if (!/^\d+\.\d+\.\d+/.test(newLevel)) {
    console.error('Usage: e2e-level.mjs bump <semver> "label"');
    process.exit(1);
  }
  const level = readJson(paths.level, {});
  const scenarios = readJson(paths.scenarios, []);
  const coverage = readJson(paths.coverage, null);
  const lastId = scenarios.length ? scenarios[scenarios.length - 1].id : null;

  level.e2e_level = newLevel;
  level.label = label || level.label || '';
  level.released_at = new Date().toISOString().slice(0, 10);
  level.catalog = {
    ...(level.catalog || {}),
    scenario_count: scenarios.length,
    last_scenario_id: lastId,
    source_md: 'docs/E2E_SCENARIO_CATALOG.md',
    source_json: 'apps/e2e-runner/src/catalog/scenarios.json',
  };
  if (coverage?.summary) {
    level.coverage = {
      ids_referenced: coverage.summary.referenced,
      ids_missing: coverage.summary.missing,
      coverage_pct: coverage.summary.coverage_pct,
      note: level.coverage?.note || 'ID presence only — not all asserts are deep (mutate/balance).',
    };
  }
  // Advance next_level placeholder if bumping into declared next
  if (level.next_level?.e2e_level === newLevel) {
    const parts = newLevel.split('.').map(Number);
    parts[1] = (parts[1] || 0) + 1;
    parts[2] = 0;
    level.next_level = {
      e2e_level: parts.join('.'),
      theme: 'TBD — set after planning next maturity step',
      focus: ['Absorb new product features into catalog', 'Deepen remaining P0 balance asserts'],
    };
  }

  writeFileSync(paths.level, JSON.stringify(level, null, 2) + '\n', 'utf8');
  console.log(`Bumped E2E level → ${newLevel}${label ? ` (${label})` : ''}`);
  console.log(`Wrote ${paths.level}`);
}

const args = process.argv.slice(2);
if (args[0] === 'bump') {
  bumpLevel(args[1], args.slice(2).join(' ').replace(/^["']|["']$/g, ''));
  printHuman(loadSnapshot());
  process.exit(0);
}

const snap = loadSnapshot();
if (args.includes('--json')) {
  console.log(JSON.stringify(snap, null, 2));
} else {
  printHuman(snap);
}

// Non-zero if drift or missing IDs (useful in CI later)
if (snap.drift.catalog_grew_since_level || snap.drift.missing_ids > 0) {
  process.exitCode = 2;
}
