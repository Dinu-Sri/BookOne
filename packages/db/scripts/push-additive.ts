/**
 * Startup schema sync (docker/entrypoint.sh step [1/3]).
 *
 * 1. `drizzle-kit pull` snapshots the live database (read-only; the CLI's own
 *    introspection). drizzle-kit's programmatic `pushSchema` cannot be used:
 *    its query wrapper drops bind parameters, so the composite-primary-key
 *    lookup (`... = $1::regnamespace AND relname = $2`) fails.
 * 2. `generateMigration(prev, cur)` diffs that snapshot against src/schema.
 * 3. `filterAdditive` keeps only additive statements, made idempotent
 *    (see src/push-filter.ts), and they are applied in order.
 *
 * Never drops policies, RLS, indexes, constraints, columns or tables: the SQL
 * migrations in ./migrations own those (step [2/3]).
 *
 * Output keeps the strings docker/entrypoint.sh used to look for:
 * "Changes applied" or "No changes".
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { Pool } from 'pg';
import config from '../drizzle.config';
import * as schema from '../src/schema';
import { filterAdditive, summarizeSkipped } from '../src/push-filter';

function tablesFilterArgs(): string[] {
  const filters = config.tablesFilter;
  const list = typeof filters === 'string' ? [filters] : filters ? [...filters] : [];
  return list.flatMap((f) => ['--tablesFilter', f]);
}

function pullSnapshot(url: string): Record<string, unknown> {
  const out = mkdtempSync(path.join(tmpdir(), 'bookone-pull-'));
  try {
    // bin.cjs is not in drizzle-kit's "exports"; it sits beside the exported api.
    const bin = path.join(path.dirname(require.resolve('drizzle-kit/api')), 'bin.cjs');
    const res = spawnSync(
      process.execPath,
      [bin, 'pull', '--dialect', 'postgresql', '--url', url, '--out', out, ...tablesFilterArgs()],
      { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    if (res.status !== 0) {
      const detail = `${res.stdout ?? ''}${res.stderr ?? ''}`.split(url).join('<DATABASE_URL>').slice(-800);
      throw new Error(`drizzle-kit pull exited ${res.status}: ${detail}`);
    }
    return JSON.parse(readFileSync(path.join(out, 'meta', '0000_snapshot.json'), 'utf8'));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');

  const prev = pullSnapshot(url);
  const cur = generateDrizzleJson(schema as Record<string, unknown>, String(prev.id ?? ''));
  const statements = await generateMigration(
    prev as Parameters<typeof generateMigration>[0],
    cur as Parameters<typeof generateMigration>[1],
  );
  const { apply, skipped } = filterAdditive(statements);

  if (skipped.length) {
    console.log(`[push-additive] skipped ${skipped.length} non-additive statements (${summarizeSkipped(skipped)}).`);
    if (process.env.PUSH_ADDITIVE_VERBOSE === '1') {
      for (const { statement } of skipped) console.log(`  skip: ${statement}`);
    }
  }

  // Introspection sanity: on an existing database, a diff that wants to
  // create the core `tenants` table means the snapshot was empty. Stop.
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const existing = await pool.query<{ t: string | null }>(`SELECT to_regclass('public.tenants')::text AS t`);
    if (existing.rows[0]?.t && apply.some((s) => /^CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?"?tenants"?\s*\(/i.test(s))) {
      throw new Error('Schema snapshot looks empty while tenants exists; refusing to push.');
    }
    if (!apply.length) {
      console.log('[✓] No changes (additive push).');
      return;
    }
    for (const statement of apply) {
      console.log(`[push-additive] ${statement.split('\n')[0]}`);
      await pool.query(statement);
    }
    console.log(`[✓] Changes applied (${apply.length} additive statements, idempotent).`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[push-additive] failed:', message.split(process.env.DATABASE_URL ?? '\u0000').join('<DATABASE_URL>'));
  process.exit(1);
});
