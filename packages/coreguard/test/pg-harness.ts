/**
 * Scratch-database harness for the CoreGuard guard and flow suites (guide Step 2, Appendix B).
 *
 * Mirrors coreguard-implementation-pack/test/run_*.sh: each suite gets its own empty database, loads
 * fixtures/base_real.sql (BookOne's real column names) and then the migrations 060–063 from
 * packages/db/migrations twice (they must be safe to re-run). Cases run on a fresh connection each, like `psql -c`.
 *
 * The CI database user is a superuser, and superusers count as members of every role, so the app and
 * maintenance cases use their own non-superuser logins: cg_test_app and cg_test_maint (in coreguard_maintenance).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

export const runPostgres =
  process.env.COREGUARD_REQUIRE_POSTGRES === '1' || (Boolean(process.env.GITHUB_ACTIONS) && Boolean(process.env.DATABASE_URL));

const ROOT = path.resolve(__dirname, '../../..');
export const STEP2_MIGRATIONS = [
  '060_coreguard_schema.sql',
  '061_coreguard_indexes.sql',
  '062_coreguard_guards.sql',
  '063_coreguard_functions.sql',
];

const TEST_PASSWORD = 'cg-test-only-not-a-secret';

export type Role = 'admin' | 'app' | 'maint';

export type Harness = {
  databaseName: string;
  /** Run SQL on a fresh connection and return the error message, or null when it succeeded. */
  exec: (role: Role, text: string) => Promise<string | null>;
  /** Run SQL on a fresh connection and return the first column of the first row as text ('' when no rows). */
  scalar: (role: Role, text: string) => Promise<string>;
  /** Open a connection (caller ends it) for two-connection tests. */
  connect: (role: Role) => postgres.Sql;
  drop: () => Promise<void>;
};

function adminUrl(): URL {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) throw new Error('BLOCKED: DATABASE_URL is required for the CoreGuard guard tests.');
  const url = new URL(raw);
  if (!['localhost', '127.0.0.1', 'postgres', 'db', '::1', '[::1]'].includes(url.hostname)) {
    throw new Error(`CoreGuard guard tests only run on a local test server (got ${url.hostname}).`);
  }
  return url;
}

function urlFor(base: URL, database: string, role: Role): string {
  const url = new URL(base.toString());
  url.pathname = `/${database}`;
  if (role === 'app') {
    url.username = 'cg_test_app';
    url.password = TEST_PASSWORD;
  } else if (role === 'maint') {
    url.username = 'cg_test_maint';
    url.password = TEST_PASSWORD;
  }
  return url.toString();
}

function open(url: string): postgres.Sql {
  return postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 10, idle_timeout: 5 });
}

function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const e = error as { message: string; detail?: string; constraint_name?: string };
    return [e.message, e.detail, e.constraint_name ? `constraint ${e.constraint_name}` : ''].filter(Boolean).join(' | ');
  }
  return String(error);
}

export async function createHarness(suite: string): Promise<Harness> {
  const base = adminUrl();
  const databaseName = `cg_${suite}_test`;
  const server = open(base.toString());
  try {
    await server.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await server.unsafe(`CREATE DATABASE ${databaseName}`);
    await server.unsafe(`DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'coreguard_maintenance') THEN CREATE ROLE coreguard_maintenance NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cg_test_app') THEN CREATE ROLE cg_test_app LOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cg_test_maint') THEN CREATE ROLE cg_test_maint LOGIN; END IF;
      END $$`);
    await server.unsafe(`ALTER ROLE cg_test_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${TEST_PASSWORD}'`);
    await server.unsafe(`ALTER ROLE cg_test_maint LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${TEST_PASSWORD}'`);
    await server.unsafe(`GRANT coreguard_maintenance TO cg_test_maint`);
  } finally {
    await server.end({ timeout: 5 });
  }

  const admin = open(urlFor(base, databaseName, 'admin'));
  try {
    await admin.unsafe(readFileSync(path.join(__dirname, 'fixtures/base_real.sql'), 'utf8'));
    for (let pass = 0; pass < 2; pass += 1) {
      for (const file of STEP2_MIGRATIONS) {
        await admin.unsafe(readFileSync(path.join(ROOT, 'packages/db/migrations', file), 'utf8'));
      }
    }
    await admin.unsafe(`
      GRANT USAGE ON SCHEMA public, coreguard TO cg_test_app, cg_test_maint;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cg_test_app, cg_test_maint;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA coreguard TO cg_test_app, cg_test_maint;
      GRANT USAGE ON ALL SEQUENCES IN SCHEMA coreguard TO cg_test_app, cg_test_maint;
    `);
  } finally {
    await admin.end({ timeout: 5 });
  }

  const exec = async (role: Role, text: string): Promise<string | null> => {
    const sql = open(urlFor(base, databaseName, role));
    try {
      await sql.unsafe(text);
      return null;
    } catch (error) {
      return errorText(error);
    } finally {
      await sql.end({ timeout: 5 });
    }
  };
  const scalar = async (role: Role, text: string): Promise<string> => {
    const sql = open(urlFor(base, databaseName, role));
    try {
      const rows = (await sql.unsafe(text)) as unknown as Array<Record<string, unknown>>;
      const first = rows[0];
      if (!first) return '';
      const value = Object.values(first)[0];
      return value == null ? '' : String(value);
    } finally {
      await sql.end({ timeout: 5 });
    }
  };
  return {
    databaseName,
    exec,
    scalar,
    connect: (role) => open(urlFor(base, databaseName, role)),
    drop: async () => {
      const s = open(base.toString());
      try {
        await s.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      } finally {
        await s.end({ timeout: 5 });
      }
    },
  };
}
