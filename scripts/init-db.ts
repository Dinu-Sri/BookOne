/**
 * Production startup: apply SQL migrations only.
 * Demo / bootstrap seed is NOT run here (use packages/db seed scripts manually if needed).
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  process.exit(1);
}

function productVersion(): string | null {
  for (const candidate of ['/app/VERSION', join(process.cwd(), 'VERSION')]) {
    try {
      if (existsSync(candidate)) return readFileSync(candidate, 'utf-8').trim() || null;
    } catch {
      // try the next location
    }
  }
  return null;
}

async function init() {
  console.log('--- SQL migrations only (no seed) ---');

  const sql = postgres(DATABASE_URL!, { max: 1 });
  // CoreGuard (guide Step 2): every file's outcome is recorded per boot in coreguard.migration_runs.
  const bootId = randomUUID();
  const version = productVersion();
  const record = async (file: string, outcome: 'applied' | 'skipped' | 'failed', message: string | null) => {
    try {
      await sql`INSERT INTO coreguard.migration_runs (boot_id, file, outcome, message, product_version)
                VALUES (${bootId}, ${file}, ${outcome}, ${message}, ${version})`;
    } catch {
      // The table does not exist until 060 has run.
    }
  };
  const dockerMigrationDir = '/app/packages/db/migrations';
  const migrationDir = existsSync(dockerMigrationDir)
    ? dockerMigrationDir
    : join(process.cwd(), 'packages/db/migrations');

  for (const file of readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort()) {
    try {
      const migrationSql = readFileSync(join(migrationDir, file), 'utf-8');
      await sql.unsafe(migrationSql);
      console.log(`Applied ${file}.`);
      await record(file, 'applied', null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes('already exists') ||
        msg.includes('already a policy') ||
        msg.includes('duplicate') ||
        msg.includes('does not exist')
      ) {
        console.log(`${file} skipped:`, msg.split('\n')[0]);
        await record(file, 'skipped', msg.split('\n')[0] ?? null);
      } else {
        console.error(`${file} FAILED:`, msg);
        await record(file, 'failed', msg);
        await sql.end();
        process.exit(1);
      }
    }
  }
  await sql.end();

  console.log('Migrations complete (no seed data).');
  process.exit(0);
}

init();
