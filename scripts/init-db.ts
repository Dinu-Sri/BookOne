import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  process.exit(1);
}

async function init() {
  console.log('--- RLS + Seed ---');

  // Apply RLS policy migrations. drizzle-kit push creates/updates tables first;
  // these SQL files only enable RLS and add tenant isolation policies.
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
      if (msg.includes('already exists') || msg.includes('already a policy') || msg.includes('duplicate')) {
        console.log(`${file} already applied.`);
      } else {
        console.log(`${file} note:`, msg);
      }
    }
  }
  await sql.end();

  // Seed
  console.log('Running seed...');
  const { execSync } = await import('node:child_process');
  try {
    execSync('pnpm exec tsx packages/db/src/seed.ts', {
      cwd: '/app',
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: DATABASE_URL! },
    });
  } catch {
    console.log('(seed may already exist)');
  }

  // Demo catalogue (10 products + photos) — idempotent upsert by SKU
  console.log('Seeding demo products...');
  try {
    execSync('pnpm exec tsx scripts/seed-demo-products.ts', {
      cwd: '/app',
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: DATABASE_URL! },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('(demo products seed note)', msg);
  }

  console.log('Init complete.');
  process.exit(0);
}

init();
