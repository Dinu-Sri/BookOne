#!/bin/sh
set -e

echo "=== BookOne — Startup Init ==="

# Wait up to 30s for Postgres
echo "Waiting for Postgres..."
for i in $(seq 1 30); do
  if npx tsx -e "
    const { default: p } = require('postgres');
    const s = p(process.env.DATABASE_URL, { max:1, connect_timeout:3 });
    s\`SELECT 1\`.then(() => { s.end(); process.exit(0); }).catch(() => process.exit(1));
  " 2>/dev/null; then
    echo "Postgres ready."
    break
  fi
  echo "  retry $i..."
  sleep 2
done

cd /app

echo "[1/3] Migrations..."
pnpm --filter @bookone/db db:migrate 2>&1 | tail -5 || true

echo "[2/3] RLS..."
npx tsx -e "
const { readFileSync } = require('fs');
const { default: p } = require('postgres');
const s = p(process.env.DATABASE_URL, { max:1 });
s.unsafe(readFileSync('/app/packages/db/migrations/001_enable_rls.sql','utf-8'))
  .then(() => { console.log('RLS applied.'); s.end(); })
  .catch((e) => { console.log('(RLS may exist)', e.message); s.end(); });
" 2>&1 | tail -3

echo "[3/3] Seed..."
npx tsx /app/packages/db/src/seed.ts 2>&1 | tail -5 || true

echo "=== Starting BookOne ==="
exec pnpm --dir apps/web exec next start -H 0.0.0.0 -p 3000
