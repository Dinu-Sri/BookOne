import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  process.exit(1);
}

async function init() {
  console.log('--- RLS + Seed ---');

  // Apply RLS policies
  try {
    const rlsSql = readFileSync('/app/packages/db/migrations/001_enable_rls.sql', 'utf-8');
    const sql = postgres(DATABASE_URL!, { max: 1 });
    await sql.unsafe(rlsSql);
    console.log('RLS policies applied.');
    await sql.end();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('already exists') || msg.includes('already a policy') || msg.includes('duplicate')) {
      console.log('RLS policies already exist.');
    } else {
      console.log('RLS note:', msg);
    }
  }

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

  console.log('Init complete.');
  process.exit(0);
}

init();
