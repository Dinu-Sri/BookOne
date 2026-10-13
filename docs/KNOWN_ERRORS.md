# BookOne v2 — Known Errors & Fixes

> This file documents recurring errors and their solutions. Update when new issues are discovered.

---

## Error: Named bank dates rolled over (BUG-0012 remainder / F-010)

**Symptom:** `parseStatementDate('30 Feb 2026')` returned `2026-03-02`. ISO/slash impossible dates were already rejected.  
**Cause:** Named-month text fell through to `Date.parse`, which overflows to the next month.  
**Fix:** Parse day/month-name/year components and require a real calendar date. Do not use Date.parse.

---

## Error: Sales credit increased reported income (BUG-0016)

**Symptom:** Invoice 600 + credit 100 posted net revenue 500 in the ledger; Reports income showed 700.  
**Cause:** `getReports` summed normal-side-positive revenue balances, so debit-normal Sales Returns 4100 added to sales.  
**Fix:** Statement balances use credit−debit for revenue (and liability/equity) and debit−credit for assets/expenses. Journals unchanged.

---

## Error: Receipt download signed a foreign tenant key (BUG-0013)

**Symptom:** `getReceiptDownloadUrl` forwarded Tenant B's storage key while the actor was Tenant A.  
**Cause:** The action required a session then signed the caller-supplied key with no prefix/ownership check.  
**Fix:** Sign only `tenants/{currentTenantId}/receipts/{userId}/{file}`. Product/style/rental object URLs use the same tenant prefix check.

---

## Error: Tenant helper saw no own rows under NOBYPASSRLS (BUG-0014)

**Symptom:** `withTenantContext` returned 0 own account rows for a restricted role; a direct transaction on the same role saw 3.  
**Cause:** `set_config(..., true)` is transaction-local and ran as its own autocommit query; the callback used a different pooled connection.  
**Fix:** Reserve one connection, set session `app.current_tenant_id`, run `db()`/`pgClient()` from AsyncLocalStorage on that connection, clear the GUC, then release. Do not grant BYPASSRLS.

---

## Error: Concurrent reverse posted twice (BUG-0015)

**Symptom:** Two overlapping `reverseTransactionById` calls both succeeded; cash/income went to −123.45.  
**Cause:** Eligibility was read outside the write transaction; both saw an unreversed original.  
**Fix:** `SELECT … FOR UPDATE` plus writes in one tenant transaction; unique index `transactions_one_reversal_per_original_uidx`.

---

## Error: Viewer could allocate a payment at the exported action (BUG-0010)

**Symptom:** QA B-007 called `allocateDocumentPayment` as Viewer and the invoice paid amount, payment journal, allocation, and audit row persisted. Wrapper `receiveCustomerPayments` already denied the same actor (B-012).  
**Cause:** Write permission lived only on the receive/pay wrappers. The exported allocation function checked period lock, tenant, and balance, then posted.  
**Fix:** `allocateDocumentPayment` asserts `sales.payments.write` for AR documents and `purchase.payments.write` for AP documents, plus dimension scope and posted-state, before any insert.

---

## Error: Revenue account accepted as payment tender (BUG-0011)

**Symptom:** QA B-011 paid an invoice with account `4000`; balanceDue changed and a payment journal posted.  
**Cause:** Allocation resolved any tenant account by code, including revenue.  
**Fix:** Tender must be tenant-owned, active, non-void, type asset, and a liquid code (`1000` / `11xx` / `12xx`). Custom cashbook banks stay eligible. Invalid accounts throw before the financial transaction.

---

## Error: Bank date parser accepted impossible dates (BUG-0012)

**Symptom:** QA F-004: `parseStatementDate('2026-02-30')` returned that ISO with confidence 1.  
**Cause:** `YYYY-MM-DD` matched a regex and was returned as-is, so JavaScript date rollover never ran.  
**Fix:** Parsed year/month/day must exist on the real calendar (including leap years) for ISO and slash formats. Invalid values return `{ iso: '', confidence: 0 }`; statement preview/commit already skip empty dates.

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
