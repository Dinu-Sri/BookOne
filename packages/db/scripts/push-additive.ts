/**
 * Startup schema sync (docker/entrypoint.sh step [1/3] via `db:migrate`).
 *
 * Diffs the Drizzle schema against the database with drizzle-kit's
 * programmatic API and applies only additive statements (see
 * src/push-filter.ts). Never drops policies, RLS, indexes, constraints,
 * columns or tables. SQL migrations in ./migrations own those.
 *
 * Output keeps the strings docker/entrypoint.sh greps for:
 * "Changes applied" or "No changes".
 */
import { pushSchema } from 'drizzle-kit/api';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import config from '../drizzle.config';
import * as schema from '../src/schema';
import { filterAdditive, summarizeSkipped } from '../src/push-filter';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');

  // node-postgres, not postgres-js: drizzle-kit's pushSchema reads `.rows`
  // from execute() results, which postgres-js does not return. With
  // postgres-js it would introspect an empty database.
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const db = drizzle(pool);
    const filters = config.tablesFilter;
    const tablesFilter = typeof filters === 'string' ? [filters] : filters ? [...filters] : undefined;
    const diff = await pushSchema(schema as Record<string, unknown>, db, undefined, tablesFilter);
    const { apply, skipped } = filterAdditive(diff.statementsToExecute);

    // Introspection sanity: on an existing database, a diff that wants to
    // create the core `tenants` table means drizzle-kit could not read the
    // current schema. Stop instead of acting on a bogus diff.
    const existing = await pool.query<{ t: string | null }>(`SELECT to_regclass('public.tenants')::text AS t`);
    if (existing.rows[0]?.t && apply.some((s) => /^CREATE\s+TABLE\s+"?tenants"?\s*\(/i.test(s))) {
      throw new Error('Schema introspection returned an empty database while tenants exists; refusing to push.');
    }

    if (skipped.length) {
      console.log(`[push-additive] skipped ${skipped.length} non-additive statements (${summarizeSkipped(skipped)}).`);
      if (process.env.PUSH_ADDITIVE_VERBOSE === '1') {
        for (const { statement } of skipped) console.log(`  skip: ${statement}`);
      }
    }

    if (!apply.length) {
      console.log('[✓] No changes (additive push).');
      return;
    }
    for (const statement of apply) {
      console.log(`[push-additive] ${statement.split('\n')[0]}`);
      await pool.query(statement);
    }
    console.log(`[✓] Changes applied (${apply.length} additive statements).`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[push-additive] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
