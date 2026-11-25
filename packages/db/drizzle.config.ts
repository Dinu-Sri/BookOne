import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Startup (docker/entrypoint.sh → `db:migrate` → scripts/push-additive.ts)
  // diffs src/schema against the database and applies only additive
  // statements. Tables created only by SQL migrations (not declared in
  // src/schema) look "extra" to drizzle-kit; v2.17.3's `push --force`
  // dropped the Better Auth tables that way. Keep SQL-only tables out of the
  // diff here as a second guard.
  // Guarded by packages/auth/test/drizzle-push-table-filter.test.ts.
  tablesFilter: ['*', '!auth_*'],
});
