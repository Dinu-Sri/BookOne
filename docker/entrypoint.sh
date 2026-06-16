#!/bin/sh
set -e

echo "=== BookOne — Startup Init ==="
cd /app

echo "[1/2] Waiting for Postgres & running migrations..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  OUT=$(pnpm --filter @bookone/db db:migrate 2>&1) || true
  echo "$OUT" | tail -3
  if echo "$OUT" | grep -q "No config path\|Pull schema\|Your database"; then
    echo "Migrations ok."
    break
  fi
  if echo "$OUT" | grep -q "password authentication failed"; then
    echo ""
    echo "ERROR: DATABASE_URL password is wrong."
    echo "Check Portainer stack env → DATABASE_URL matches DB_PASSWORD."
    echo "Expected format: postgres://bookone:DB_PASSWORD@postgres:5432/bookone"
    echo ""
    sleep 5
  fi
  echo "  Retry $i/10..."
  sleep 5
done

echo "[2/2] RLS + seed..."
pnpm exec tsx scripts/init-db.ts 2>&1 | tail -5 || true

echo "=== Starting BookOne ==="
exec pnpm --dir apps/web exec next start -H 0.0.0.0 -p 3100
