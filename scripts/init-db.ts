/**
 * Production startup: apply SQL migrations only.
 * Demo / bootstrap seed is NOT run here (use packages/db seed scripts manually if needed).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  process.exit(1);
}

async function init() {
  console.log('--- SQL migrations only (no seed) ---');

  const sql = postgres(DATABASE_URL!, { max: 1 });
  const dockerMigrationDir = '/app/packages/db/migrations';
  const migrationDir = existsSync(dockerMigrationDir)
    ? dockerMigrationDir
    : join(process.cwd(), 'packages/db/migrations');

  for (const file of readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort()) {
    try {
      const migrationSql = readFileSync(join(migrationDir, file), 'utf-8');
      await sql.unsafe(migrationSql);
      console.log(`Applied ${file}.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes('already exists') ||
        msg.includes('already a policy') ||
        msg.includes('duplicate')
      ) {
        console.log(`${file} already applied.`);
      } else {
        console.log(`${file} note:`, msg);
      }
    }
  }
  await sql.end();

  console.log('Migrations complete (no seed data).');
  process.exit(0);
}

init();
