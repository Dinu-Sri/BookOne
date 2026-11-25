import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // docker/entrypoint.sh runs `drizzle-kit push --force` on every web start.
  // Tables created only by SQL migrations (not declared in src/schema) look
  // "extra" to push, and --force auto-approves dropping them. drizzle-kit
  // 0.31 did exactly that to the Better Auth tables on staging (v2.17.3),
  // wiping every login. Keep SQL-only tables out of push's view here.
  // Guarded by packages/auth/test/drizzle-push-table-filter.test.ts.
  tablesFilter: ['*', '!auth_*'],
});
