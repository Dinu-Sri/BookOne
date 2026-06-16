import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

async function init() {
  console.log('=== BookOne Database Initialization ===\n');

  // ── Step 1: Create tables via drizzle-kit ──
  console.log('[1/3] Creating database tables...');
  try {
    execSync('pnpm --filter @bookone/db db:migrate', {
      cwd: '/app',
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL },
    });
    console.log('Tables created.\n');
  } catch (err) {
    console.error('Migration failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // ── Step 2: Apply RLS policies ──
  console.log('[2/3] Applying Row-Level Security policies...');
  try {
    const rlsSql = readFileSync(
      join(__dirname, '..', 'packages', 'db', 'migrations', '001_enable_rls.sql'),
      'utf-8',
    );
    await sql.unsafe(rlsSql);
    console.log('RLS policies applied.\n');
  } catch (err) {
    console.error('RLS failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // ── Step 3: Seed tenant, admin user, chart of accounts ──
  console.log('[3/3] Seeding tenant, admin user, and chart of accounts...');
  try {
    execSync('npx tsx packages/db/src/seed.ts', {
      cwd: '/app',
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL },
    });
    console.log('Seed complete.\n');
  } catch (err) {
    console.error('Seed failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log('=== Done. Admin login: dinu.sri.m@gmail.com / 12345678 ===');
  await sql.end();
  process.exit(0);
}

init();
