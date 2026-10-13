# BookOne v2 — Known Errors & Fixes

> This file documents recurring errors and their solutions. Update when new issues are discovered.

---

## Error: Docker web image published while quality was red (BUG-0008)

**Symptom:** Production Check Tests green, Lint/typecheck/build red, GHCR `bookone-web:latest` still updated. Manual **Run workflow** skipped the wait job.  
**Cause:** `docker-web.yml` waited only for the Tests job, used `if: always()` on Build & push, and skipped the wait on `workflow_dispatch`.  
**Fix:** `build-and-push` `needs: [quality]`. Job `quality` runs unmasked `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` with no job `if`. Publisher has no `always()` / `failure()`. Failed, cancelled, skipped, missing, or timed-out quality blocks publish. Isolated test: `packages/auth/test/release-gate-workflow.test.ts`.

---

## Error: `minio/minio` cannot be pulled

**Symptom:** Portainer stack pull hangs or fails on MinIO; Docker Hub says the repository does not exist.  
**Cause:** Docker Hub removed `minio/minio` (2026). `pull_policy: never` only works if that image is already on the VPS.  
**Fix:** Staging/prod compose uses `chainguard/minio:latest` with `pull_policy: missing`. Same `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` and `S3_ENDPOINT=http://minio:9000`.

---

## Error: Database Connection Refused

**Symptom:** `Error: connect ECONNREFUSED 127.0.0.1:5432`  
**Cause:** PostgreSQL container not running, or `DATABASE_URL` pointing to wrong host  
**Fix:**
```bash
docker compose up -d postgres
# Check DATABASE_URL in .env matches docker compose service name
# Inside Docker: postgres://user:pass@postgres:5432/bookone
# Local dev:    postgres://user:pass@localhost:5432/bookone
```

---

## Error: RLS Policy Not Applied

**Symptom:** Cross-tenant data leakage, or empty results when data exists  
**Cause:** `app.current_tenant_id` not set before query, or RLS policy not created for new table  
**Fix:**
```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'transactions';

-- Enable RLS on table
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY tenant_isolation ON transactions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

---

## Error: Journal Entry Not Balanced

**Symptom:** `JournalBalanceError: Debits=1000, Credits=950`  
**Cause:** Bug in `generateJournalEntry()` — a case is missing a line or has wrong amounts  
**Fix:** Check the case in `packages/accounting/src/journal-engine.ts` for the transaction type that caused it. Verify each `case` has exactly matching debit/credit pairs.

---

## Error: Migration Failed — Relation Already Exists

**Symptom:** `error: relation "transactions" already exists` during migration  
**Cause:** Running a migration that was already applied, or migration numbering conflict  
**Fix:**
```bash
# Check which migrations have been applied
pnpm db:status

# If migration was already applied, skip it
# If conflict, create a new migration with a later timestamp
```

---

## Error: Cloudflare Tunnel 502 Bad Gateway

**Symptom:** `bookone.clossyan.com` returns 502  
**Cause:** Next.js container not running, Traefik routing issue, or cloudflared misconfiguration  
**Fix:**
```bash
ssh user@vps
docker compose -f docker/docker-compose.prod.yml ps    # Check container status
docker compose -f docker/docker-compose.prod.yml logs web --tail=50  # Check app logs
docker compose restart cloudflared    # Restart tunnel
```

---

## Error: Portainer pull denied for `ghcr.io/dinu-sri/bookone-web`

**Symptom:** Stack update fails with `pull access denied` / 401 for `ghcr.io/dinu-sri/bookone-web:latest`.  
**Cause:** GHCR packages default to private until visibility is Public or Portainer has a `read:packages` credential. Updating before **Docker web image** is green also fails because the tag does not exist yet.  
**Fix:** Wait for the Action to finish. Then either set the `bookone-web` package Public (GitHub → Packages → settings) or add a Portainer registry `ghcr.io` with a PAT (`read:packages`). Do not add `build:` back onto `web`.

---

## Error: Portainer web build fails at `pnpm install --frozen-lockfile --ignore-scripts`

**Symptom:** Stack update fails with `process "/bin/sh -c pnpm install --frozen-lockfile --ignore-scripts" did not complete successfully: exit code: 1`  
**Cause (historical):** Portainer used to compile `Dockerfile.web` on the VPS. Production Check going green did not publish an image. Alpine frozen-lockfile failed after Wave 1b.  
**Fix:** Web is now `ghcr.io/dinu-sri/bookone-web:latest` with no compose `build:`. If this error returns, compose still has a `build:` block — remove it. The image is built in GitHub Actions, not on the VPS.

---

## Error: Portainer Stack Won't Deploy

**Symptom:** Stack deploy fails with "unable to pull image" or similar  
**Cause:** Docker Hub rate limit, network issue, or compose file syntax error  
**Fix:**
```bash
ssh user@vps
cd /opt/bookone
docker compose -f docker/docker-compose.prod.yml config   # Validate compose file
docker compose pull                                      # Pull images manually
docker compose up -d                                     # Start manually (bypass Portainer)
```

---

*Last updated: 2026-10-12 | Add new errors as they're discovered*
