#!/bin/sh
set -e

echo "=== BookOne — Startup Init ==="
cd /app

# Step 1 — Wait for Postgres by retrying the migration
echo "[1/3] Waiting for Postgres and running migrations..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if pnpm --filter @bookone/db db:migrate 2>&1; then
    echo "Migrations complete."
    break
  fi
  echo "  DB not ready (attempt $i/10), retrying in 5s..."
  sleep 5
done

# Step 2 — Apply RLS
echo "[2/3] Applying RLS policies..."
node -e "
const { readFileSync } = require('fs');
const p = require('postgres');
const s = p(process.env.DATABASE_URL, { max:1 });
s.unsafe(readFileSync('/app/packages/db/migrations/001_enable_rls.sql','utf-8'))
  .then(function(){ console.log('RLS applied.'); s.end(); })
  .catch(function(e){ console.log('(RLS may exist)'); s.end(); });
" 2>&1 || echo "(RLS step done)"

# Step 3 — Seed
echo "[3/3] Seeding data..."
npx tsx /app/packages/db/src/seed.ts 2>&1 || echo "(seed may already exist)"

echo "=== Starting BookOne ==="
exec pnpm --dir apps/web exec next start -H 0.0.0.0 -p 3000
