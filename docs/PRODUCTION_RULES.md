# BookOne v2 — Production Rules

> **These rules must never be violated.** Breaking any of these can cause data corruption, security breaches, or production outages.

---

## Rule 1: Never Hardcode Secrets or URLs

❌ `const dbUrl = "postgres://..."`  
✅ `const dbUrl = process.env.DATABASE_URL`  

❌ `fetch("http://localhost:3000/api/...")`  
✅ `fetch(\`${process.env.AUTH_URL}/api/...\`)`  

❌ `apiKey = "sk-abc123"`  
✅ `apiKey = process.env.OPENAI_API_KEY`  

## Rule 2: Never Bypass Tenant Isolation

❌ `SELECT * FROM transactions` (no tenant filter)  
✅ Every query MUST be scoped by tenant — RLS enforces this at DB level, but application code should also set `app.current_tenant_id`  

❌ Accepting `tenant_id` from client request body  
✅ `tenant_id` comes from the authenticated session, NEVER from client input  

## Rule 3: Never Delete Data, Only Void

❌ `DELETE FROM transactions WHERE id = $1`  
✅ Set `voided = true`, `voided_at = now()`, `voided_by = $userId`  

All deletions must be soft-deletes (voids). This preserves the audit trail.

## Rule 4: Never Skip Journal Entry Generation

Every transaction mutation (create, update, void) MUST generate corresponding journal entries. The `journal_entries` and `journal_lines` tables are append-only. If a transaction is updated, the old journal is reversed and a new one created.

## Rule 5: Never Run Schema Changes Directly on Production

All schema changes go through Drizzle migrations. Never run `ALTER TABLE` directly on the production database. Migrations are tested locally first.

## Rule 6: Always Use Transactions for Multi-Table Mutations

```typescript
await db.transaction(async (tx) => {
  await tx.insert(transactions).values(...)
  await tx.insert(journalEntries).values(...)
  await tx.insert(journalLines).values(...)
})
```

If any step fails, the entire operation rolls back. No partial data.

## Rule 7: Always Log to Audit Trail

Every mutation of financial data (transactions, journal entries, chart of accounts) MUST create an `audit_log` entry with `old_values` and `new_values`.

## Rule 8: Respect Period Locks

If a period is locked (month-end closing), do NOT allow direct edits. Instead, create a reversal entry. The `isPeriodLocked()` check must run before any mutation.

## Rule 9: Environment Variables Are Required

App must fail fast at startup if required env vars are missing. Graceful error messages, not cryptic crashes.

## Rule 10: Test the Journal Balance

Every journal entry must balance (total debits == total credits). The `generateJournalEntry()` function must validate this and throw `JournalBalanceError` if not. This error must be caught and logged to Sentry — it indicates an accounting engine bug.

---

*Last updated: 2026-06-14*
