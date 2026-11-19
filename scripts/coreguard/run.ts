/**
 * Single CoreGuard pilot command: migrate → seed → test → cleanup.
 * Refuses non-test DATABASE_URL / storage targets.
 *
 *   pnpm coreguard:pilot
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { assertPilotTargets } from './allowlist';
import { fixtureVersion, productSha, productVersion, schemaFingerprint } from './identity';
import { cleanupPilotSeed, seedPilotCompanies } from './seed';

const ROOT = path.resolve(__dirname, '../..');

function run(command: string, args: string[], extraEnv: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status ?? 'signal'}`);
  }
}

async function main() {
  const targets = assertPilotTargets();
  const identity = {
    productVersion: productVersion(),
    productSha: productSha(),
    schema: schemaFingerprint(),
    fixture: fixtureVersion(),
    database: targets.databaseName,
  };
  console.log('CoreGuard pilot identity', identity);

  const pushed = spawnSync(
    'pnpm',
    ['--dir', 'packages/db', 'exec', 'drizzle-kit', 'push', '--force'],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: targets.databaseUrl },
      shell: process.platform === 'win32',
    },
  );
  if (pushed.status !== 0) {
    const sql = postgres(targets.databaseUrl, { max: 1 });
    try {
      const rows = await sql<{ t: string | null }[]>`SELECT to_regclass('public.tenants')::text AS t`;
      if (!rows[0]?.t) {
        throw new Error('drizzle-kit push failed and public.tenants is missing.');
      }
      console.warn('drizzle-kit push failed on an existing schema; continuing with SQL migrations.');
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
  run('npx', ['tsx', 'scripts/init-db.ts'], { DATABASE_URL: targets.databaseUrl });

  const seed = await seedPilotCompanies(targets.databaseUrl);
  const manifestPath = path.join(ROOT, '.local', 'coreguard-run.json');
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(
    path.join(ROOT, '.local', 'coreguard-run.json'),
    JSON.stringify({ identity, seed, createdAt: new Date().toISOString() }, null, 2),
  );
  console.log(`Seeded ${seed.companies.alpha.name} and ${seed.companies.beta.name}`);

  const extraEnv: NodeJS.ProcessEnv = {
    DATABASE_URL: targets.databaseUrl,
    COREGUARD_PILOT: '1',
    COREGUARD_REQUIRE_POSTGRES: '1',
    COREGUARD_BROWSER_OWNER_EMAIL: seed.companies.alpha.owner.email,
    COREGUARD_BROWSER_OWNER_PASSWORD: seed.companies.alpha.owner.password,
    COREGUARD_BROWSER_VIEWER_EMAIL: seed.companies.alpha.viewer?.email ?? '',
    COREGUARD_BROWSER_VIEWER_PASSWORD: seed.companies.alpha.viewer?.password ?? '',
    COREGUARD_BROWSER_TENANT_A: seed.companies.alpha.tenantId,
    COREGUARD_BROWSER_TENANT_B: seed.companies.beta.tenantId,
    COREGUARD_RUN_ID: seed.runId,
    AUTH_SECRET: process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET ?? 'test-secret-for-ci-only',
    AUTH_URL: process.env.AUTH_URL ?? 'http://127.0.0.1:3000',
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? process.env.AUTH_URL ?? 'http://127.0.0.1:3000',
  };

  let failed: string | null = null;
  try {
    run(
      'pnpm',
      [
        '--filter',
        '@bookone/accounting',
        'exec',
        'vitest',
        'run',
        'test/coreguard-custom-bank-oracle.test.ts',
        'test/coreguard-bank-recon-oracle.test.ts',
      ],
      extraEnv,
    );
    run(
      'pnpm',
      [
        '--filter',
        '@bookone/auth',
        'exec',
        'vitest',
        'run',
        'test/coreguard-allowlist.test.ts',
        'test/coreguard-custom-bank-contract.test.ts',
        'test/coreguard-custom-bank-postgres.test.ts',
        'test/coreguard-bank-recon-postgres.test.ts',
      ],
      extraEnv,
    );

    const wantBrowser = process.env.COREGUARD_PILOT_BROWSER === '1' || process.env.GITHUB_ACTIONS === 'true';
    if (wantBrowser) {
      if (process.env.COREGUARD_SKIP_WEB_BUILD === '1') {
        console.log('BROWSER: reusing existing apps/web build (COREGUARD_SKIP_WEB_BUILD=1).');
      } else {
        run('pnpm', ['--dir', 'apps/web', 'build'], extraEnv);
      }
      run('pnpm', ['--dir', 'apps/web', 'run', 'test:coreguard-browser'], extraEnv);
    } else {
      console.log('BROWSER: not-run (set COREGUARD_PILOT_BROWSER=1 to drive the real app).');
    }
  } catch (error) {
    failed = error instanceof Error ? error.message : String(error);
  }

  try {
    await cleanupPilotSeed(targets.databaseUrl, seed);
    console.log('Pilot companies cleaned up.');
  } catch (error) {
    console.error('Cleanup failed', error);
    failed = failed ?? (error instanceof Error ? error.message : String(error));
  }

  console.log(`Manifest ${manifestPath}`);
  if (failed) {
    console.error(`FAILED: ${failed}`);
    process.exit(1);
  }
  console.log('PASS: custom-bank and bank-recon CoreGuard lane');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
