#!/bin/sh
set -e

echo "=== BookOne — Startup Init ==="
cd /app

# Make sure pnpm has a writable store + cache even when running as the
# unprivileged `nextjs` user inside the container.
export PNPM_HOME=/app/.pnpm-store
export npm_config_cache=/app/.cache/npm
export HOME=/app/.cache
export XDG_DATA_HOME=/app/.cache
export XDG_CONFIG_HOME=/app/.cache
export NEXT_TELEMETRY_DISABLED=1
export NODE_ENV=production
mkdir -p "$PNPM_HOME" "$npm_config_cache" "$XDG_DATA_HOME/drizzle-studio"

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set. Refusing to start without DB."
  exit 1
fi

echo "[1/3] Waiting for Postgres & pushing Drizzle schema..."
MIGRATE_OK=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  if pnpm --dir packages/db exec drizzle-kit push --force; then
    echo "Schema push ok."
    MIGRATE_OK=1
    break
  fi
  echo "  Retry $i/10..."
  sleep 5
done

if [ "$MIGRATE_OK" != "1" ]; then
  echo "ERROR: drizzle-kit push failed after retries. Signup will fail until tables exist."
  echo "Check DATABASE_URL (postgres://USER:PASSWORD@postgres:5432/DBNAME)."
fi

echo "[2/3] SQL migrations (packages/db/migrations/*.sql) — no seed..."
if ! pnpm exec tsx scripts/init-db.ts 2>&1; then
  echo "ERROR: init-db.ts reported a failure. Starting the app anyway so the ERP does not crash-loop."
  echo "Check the FAILED: line above. Additive features (styles, lots) may be incomplete until that SQL is fixed."
fi

echo "[3/3] Starting BookOne web..."
exec pnpm --dir apps/web exec next start -H 0.0.0.0 -p 3100
