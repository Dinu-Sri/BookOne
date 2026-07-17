#!/bin/sh
set -e

echo "=== BookOne — Startup Init ==="
cd /app

# Make sure pnpm has a writable store + cache even when running as the
# unprivileged `nextjs` user inside the container.
export PNPM_HOME=/app/.pnpm-store
export npm_config_cache=/app/.cache/npm
export NEXT_TELEMETRY_DISABLED=1
export NODE_ENV=production
mkdir -p "$PNPM_HOME" "$npm_config_cache"

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set. Refusing to start without DB."
  exit 1
fi

echo "[1/3] Waiting for Postgres & pushing Drizzle schema..."
MIGRATE_OK=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  OUT=$(pnpm --filter @bookone/db db:migrate 2>&1) || true
  echo "$OUT" | tail -5
  if echo "$OUT" | grep -Eqi "No config path|Pull schema|Your database|Changes applied|No changes|already in sync"; then
    echo "Schema push ok."
    MIGRATE_OK=1
    break
  fi
  if echo "$OUT" | grep -qi "password authentication failed"; then
    echo ""
    echo "ERROR: DATABASE_URL password is wrong."
    echo "Check Portainer stack env → DATABASE_URL matches DB_PASSWORD."
    echo "Expected format: postgres://bookone:DB_PASSWORD@postgres:5432/bookone"
    echo ""
  fi
  echo "  Retry $i/10..."
  sleep 5
done

if [ "$MIGRATE_OK" != "1" ]; then
  echo "WARN: drizzle-kit push did not report success after retries."
  echo "Continuing to SQL migrations — check logs if tables are missing."
fi

echo "[2/3] SQL migrations (packages/db/migrations/*.sql) + seed..."
if ! pnpm exec tsx scripts/init-db.ts 2>&1; then
  echo "ERROR: init-db.ts failed. App may start but schema/seed may be incomplete."
  echo "Fix DATABASE_URL / Postgres, then redeploy web so entrypoint re-runs."
fi

echo "[3/3] Starting BookOne web..."
exec pnpm --dir apps/web exec next start -H 0.0.0.0 -p 3100
