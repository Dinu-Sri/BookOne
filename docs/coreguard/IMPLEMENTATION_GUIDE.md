# CoreGuard — Implementation Guide

**BookOne's financial integrity system. Instructions for coding agents and engineers.**

| | |
|---|---|
| Version | 2.1 — 2026-11-28 (2.0 + golden answer keys for 12 Sri Lankan companies; replaces every earlier CoreGuard spec) |
| Applies to | `Dinu-Sri/BookOne`, written against commit `9bf3468` (product 2.35.0, last migration `059_print_designs.sql`) |
| Status | Approved. Implement exactly as written. |
| Put this file at | `docs/coreguard/IMPLEMENTATION_GUIDE.md` |
| SQL | Appendix A has migrations `060`–`067` verbatim. They were applied twice and run against 79 tests (Appendix B). Copy them exactly. |

---

## 1. How to use this guide

1. Do the steps in **§5 in order**. One step = one pull request, except Step 7, which is one PR per writer (listed there).
2. Every step has **Files**, **Do** and **Done when**. A step is finished only when every "Done when" item is true and shown in the CHG record.
3. Copy the SQL in Appendix A **unchanged**. If BookOne's code at the time differs from what a step expects (a file moved, a column renamed), adapt the **application code**, not the guard. Write down what you adapted in the CHG.
4. If a guard rejects something the app does, **the app is wrong**. Fix the app. Never change a guard, check, expected value, tolerance or severity to make a test pass (§4.7).
5. All normal repository rules still apply: CHG record (`docs/QA_CHANGE_CONTRACT.md`), `VERSION` bump (`docs/VERSIONING.md`), additive schema changes, external QA in `bookone-qa`, the UI rulebook for screens.
6. Do not ask the owner about anything this guide already decides (§3). Only the items in **§7 Owner actions** need the owner.

---

## 2. What you are building

CoreGuard makes it impossible, or immediately visible, when BookOne's books are wrong, whoever caused it: a coding agent, a person, a migration, a restore or two requests racing each other.

| Part | What it is | Where it runs |
|---|---|---|
| **Database guards** | Triggers that refuse bad writes: unbalanced entries, edits to posted rows, posting into a closed month, cross-company references, duplicates | Inside PostgreSQL (`062`–`067`) |
| **Posting service** | `packages/ledger-core`: the one place that writes ledger, stock and allocations, with retry-safe operation keys | Web app |
| **Sentinel** | Read-only checks that recompute every important number a second way, per company, all the time | `coreguard` container |
| **Lab** | Golden datasets (answers worked out by an accountant), guard tests, two-connection tests, property tests, detector tests | CI on every PR; `coreguard` container on staging |
| **Guardrails** | Rule Zero for agents, CI gate, ratchets, waivers, CODEOWNERS | Repository + CI |
| **Health check screen** | Control Room → Health check, super admin only: status per company, guards, certificate, guardrails, workers | Web app |

```
CI ── gate ─ lab (guards, flows, detectors, golden, properties) ─ certificate ──► images
                                                                                  │
web (Next.js) ── ledger-core ──► PostgreSQL ◄── coreguard container (sentinel, lab on staging)
   └ Control Room → Health check reads coreguard.*        └ guards 062–067 inside the database
```

---

## 3. Fixed decisions

These are decided. Do not reopen them.

| # | Topic | Decision |
|---|---|---|
| D1 | Guard behaviour | Guards are **always enforced**. There is no shadow or "warn only" mode. |
| D2 | Correcting posted entries | **Reversal only.** Ledger rows (`transactions`, `journal_entries`, `journal_lines`, `settlement_allocations`) are never updated (except memo/notes/descriptive fields), voided or deleted. |
| D3 | Money arithmetic | Integer cents or exact decimal strings. **No floating-point money anywhere in posting code. No tolerance.** Debits equal credits exactly. |
| D4 | One journal per transaction | Exactly one live journal entry per transaction. Lines can only be added in the same DB transaction that created the entry. |
| D5 | Period close | Only through `coreguard.lock_period()` / `coreguard.unlock_period()`. Postings and closes run in **READ COMMITTED**. Reopening needs a reason. |
| D6 | Retries | Every financial action carries a **required operation key** (16–80 characters, created by the form, reused on retry). The key is bound to the request contents: the same key with different contents is refused. |
| D7 | Posting a document twice | Refused. After a reversal, the document may be posted again. |
| D8 | Allocations (same payment, same invoice, separate steps) | **Allowed.** Uniqueness is per operation key. The totals can never exceed the payment or the invoice. Undo = a reversing allocation. |
| D9 | Payment from one party for another party's invoice | **Allowed only as a third-party payment**: payer recorded, reason and reference required, attachment required when the company's sector setting says so. The invoice stays in the debtor's name. Refunds go back to the payer. Netting (set-off) is not supported in this version. |
| D10 | Receipt with no invoice yet (VAT-registered company) | Recorded as a **customer advance**, never as unallocated cash. |
| D11 | Customer/supplier on ledger lines | Lines on control accounts (`ar`, `ap`, `customer_advance`, `supplier_advance`, `staff_advance`) carry `party_id`, and it can't be changed after posting. |
| D12 | Maintenance bypass | Only archive restore and CoreGuard cleanup, using a **separate database login** (`bookone_maintenance`) and `SET LOCAL bookone.ledger_maintenance = '<reason>'`. Every use is logged. |
| D13 | Database logins | Separate logins: web app, maintenance, CoreGuard monitor (read), CoreGuard writer, CoreGuard lab. The lab login can't connect to the main database. |
| D14 | Lab location | Lab runs in CI and in the staging `coreguard` container. In the production compose file it is off (`COREGUARD_LAB_ENABLED` default `0`). |
| D15 | Findings | CoreGuard flags; it never fixes data. Status comes only from check results. Acknowledging a finding never turns a company green. Only a successful recheck clears it. |
| D16 | Queue | CoreGuard jobs use a Postgres job table, not Redis/BullMQ. |
| D17 | Zero-cost physical sale | Refused at posting ("Set a cost for this product before selling it"). |
| D18 | Mixed purchase bill (goods + services) | Goods lines go to inventory/GRNI, service lines to expense, in one balanced entry. |
| D19 | App database role | The web app must stop connecting as the PostgreSQL superuser (Step 12). It must be finished before the first real client. |

---

## 4. Rules for every step

### 4.1 Money
- Parse amounts from strings with a strict decimal parser: at most 2 decimals, no `NaN`, no exponent. Convert to `bigint` cents. Compare sums in cents with `===`.
- Never use `parseFloat`, `Number()`, `toFixed()` or `Math.round(x*100)/100` on money in posting code. The CI gate (CI-11) enforces this in `packages/ledger-core`.
- Quantities: strings with at most 4 decimals, compared exactly.

### 4.2 Ledger writes
- Every write of `transactions`, `journal_entries`, `journal_lines`, `inventory_movements`, `inventory_cost_layer*` and `settlement_allocations` for one user action happens in **one** `db().transaction(...)`, at the default isolation level (READ COMMITTED).
- Insert order: transaction → journal entry → all lines (one multi-row insert) → stock / allocations → audit log.
- From Step 7: **only `packages/ledger-core` may insert these rows**. CI-6 enforces it.

### 4.3 Where database objects live
- **Columns** are declared in the Drizzle schema (`packages/db/src/schema/*.ts`). Startup (`push-additive`) adds them.
- **Triggers, functions, indexes, constraints and roles** live in SQL migrations (`packages/db/migrations/06x_coreguard_*.sql`). Every migration must be safe to run on every start (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`).
- `coreguard.*` tables are defined in SQL (`060`). The web reads them through `packages/db/src/coreguard-tables.ts` (Drizzle `pgSchema('coreguard')`), which is **not** exported from `packages/db/src/schema/index.ts`, so push-additive never touches them.

### 4.4 Error contract
Guards raise SQLSTATE `23514` with a message starting `COREGUARD Gxx:`. Add `apps/web/src/lib/coreguard-errors.ts`, which turns these into the user messages below, logs the original to `/ops/logs`, and never shows SQL to users. Unknown `COREGUARD` codes show the generic message.

| Code | User message |
|---|---|
| G01 | "This entry doesn't balance, so nothing was saved." |
| G02, G06 | "An amount, date or side in this entry is not valid, so nothing was saved." |
| G03 | "This entry refers to an account or contact that can't be used here." |
| G04 | "Posted entries can't be changed. Post a reversal instead." |
| G05 | "This month is closed. Reopen it (with a reason) or use an open date." |
| G07, G09 | "This entry could not be saved completely, so nothing was saved. Please try again." |
| G10 | "Choose the customer, supplier or staff member for this entry." |
| G11 | "This payment is from a different party than the invoice. Record it as a third-party payment with a reason and reference." |
| generic | "Nothing was saved because the books would have become inconsistent. The error has been logged." |

Also list every code in `docs/KNOWN_ERRORS.md`.

### 4.5 Independence
`packages/coreguard` checks are plain SQL on raw tables. They must not import `@bookone/accounting`, `@bookone/ledger-core` or anything in `apps/`. The only exception is the golden **replay adapter** (`packages/coreguard/src/golden/replay.ts`), which drives the system under test. CI-8 enforces this.

### 4.6 Maintenance
Only `packages/db/src/archive/restore.ts` and CoreGuard cleanup/lab code may use the maintenance bypass:
```ts
await maintenanceDb().transaction(async (tx) => {
  await tx.execute(sql`SET LOCAL bookone.ledger_maintenance = 'archive_restore'`);  // first statement
  // ... restore work ...
});
```
`maintenanceDb()` (new, `packages/db/src/maintenance-db.ts`) connects with `MAINTENANCE_DATABASE_URL` and throws if it isn't set. The guards check that the login is a member of `coreguard_maintenance` and log every statement in `coreguard.bypass_log`. CI-7 forbids the string `bookone.ledger_maintenance` anywhere else.

### 4.7 Never weaken CoreGuard
Do not delete or disable a guard or check, lower a severity, add or raise a tolerance, edit golden expected values, add a `bookone.ledger_maintenance` use, or remove an entry from the financial surface list, except through an owner-approved waiver (§6.6). CI-4 and CI-5 block these changes.


---

## 5. Steps

### Step 0 — Rule Zero and governance (docs only)

**Files**
- `AGENTS.md`: insert the Rule Zero block (§6.10) as the very first section, above "External QA and coding-agent memory".
- `.claude/CLAUDE.md`, `.github/copilot-instructions.md`, `.github/instructions/codebase-workflow.instructions.md`, `ai/start-session.prompt.md`: add the short Rule Zero line (§6.10) as the first paragraph.
- `.github/copilot-instructions.md`: change Critical Rule 3 to "Ledger rows are never deleted or voided. Correct with a reversal." Change Critical Rule 4 to "All ledger writes go through `packages/ledger-core`."
- `ai/start-session.prompt.md`: replace the sentence that says Control Room health-check runners are removed with: "The CoreGuard monitor is allowed: read-only checks, results in Control Room → Health check, runs requested through the `coreguard.run_requests` table. It creates no tenant data and exposes no HTTP test runner."
- `docs/PRODUCTION_RULES.md`: add "Rule 0: CoreGuard first (see AGENTS.md)". Rule 3 → ledger rows are never deleted or voided, only reversed. Rule 8 → periods are closed only through `coreguard.lock_period`. Rule 10 → debits equal credits exactly; the database enforces it.
- `docs/QA_CHANGE_CONTRACT.md`: add "CoreGuard impact section" to "Required on every development task".
- `docs/changes/TEMPLATE.md`: add the CoreGuard impact section (§6.10).
- `docs/coreguard/IMPLEMENTATION_GUIDE.md`: this file.
- `docs/coreguard/FINANCIAL_SURFACE.md`: the list in §6.5.
- `docs/coreguard/README.md`: replace with a one-page overview pointing to this guide.
- `.github/CODEOWNERS`: the content in §6.10.

**Done when**
- Every listed file contains the exact text from §6.10.
- CHG record and `VERSION` bump are done.

---

### Step 1 — Make the existing writers guard-ready

The guards in Step 2 will refuse anything that isn't atomic, exact and append-only. This step fixes the app first.

**Files**: every file that inserts ledger, stock or allocation rows (at `9bf3468`: `apps/web/src/app/actions/{commercial-docs,documents,inventory,record-entry,entity-lifecycle,rental-money,advances}.ts`, `apps/web/src/lib/post-balanced-journal.ts`, `packages/accounting/src/engine/document-posting.ts`), plus `packages/db/src/schema/{journal-lines,transactions}.ts`.

**Do**
1. Find every insert into `transactions`, `journal_entries`, `journal_lines`, `inventory_movements`, `inventory_cost_layers`, `inventory_cost_layer_consumptions`, `settlement_allocations`:
   `grep -rn "insert(transactions)\|insert(journalEntries)\|insert(journalLines)\|insert(inventoryMovements)\|insert(inventoryCostLayer\|insert(settlementAllocations)" apps packages`
   For each call site, make sure it runs inside **one** `db().transaction(...)` together with the rest of that user action. Known to be outside a transaction today: `entity-lifecycle.ts → incorporateSoleToCompany`, where the opening journal (transaction, entry, lines) is written as separate statements. Wrap it.
2. Replace every float balance check with exact cents. In `post-balanced-journal.ts`, `document-posting.ts → assertBalanced`, `entity-lifecycle.ts` and any other writer: compute each line amount as `bigint` cents, compare Σdebits === Σcredits, and remove the `0.005` / `round2` tolerances. Add `packages/accounting/src/money.ts` with `toCents(value: string | number): bigint` (rejects >2 decimals, NaN, Infinity) and `centsToString(c: bigint): string`.
3. Find every UPDATE or DELETE of `transactions`, `journal_entries`, `journal_lines`, `period_locks`, `settlement_allocations`. Allowed after Step 2: `memo`/`notes` on entries and lines; descriptive transaction fields (`party`, `description`, `payment_method`, `receipt_ref`, `category_*`, `invoice_ref`, `is_already_settled`, `notes`); `reversed_by_transaction_id` once, from NULL. Rewrite anything else as a reversal. At `9bf3468` only `record-entry.ts` (reversal link) and `scripts/coreguard/ledger.ts` (`receipt_ref`) update these tables, and both are allowed.
4. Add columns to the Drizzle schema:
   - `journal_lines.partyId`: `uuid('party_id').references(() => parties.id)` (nullable)
   - `transactions.sourceKind`: `varchar('source_kind', { length: 40 })` (nullable)
   - `transactions.sourceId`: `uuid('source_id')` (nullable)
5. Check that no code sets `created_at` on `journal_entries` or `journal_lines` explicitly (check CG-L14 relies on the database default `now()`).

**Done when**
- The CHG lists every writer from item 1 with "wrapped" or "already atomic".
- `pnpm test`, `pnpm coreguard:pilot` and the Playwright lane pass.
- `grep -rn "0\.005" apps/web/src/lib/post-balanced-journal.ts packages/accounting/src/engine` returns nothing.

---

### Step 2 — Database guards

**Files**
- `packages/db/migrations/060_coreguard_schema.sql`, `061_coreguard_indexes.sql`, `062_coreguard_guards.sql`, `063_coreguard_functions.sql`: copy from Appendix A.
- `packages/db/src/coreguard-tables.ts` (new): Drizzle `pgSchema('coreguard')` definitions of the `060` tables, for reading. **Not** exported from `src/schema/index.ts`.
- `packages/db/src/maintenance-db.ts` (new): `maintenanceDb()`, §4.6.
- `packages/db/src/archive/restore.ts`: use `maintenanceDb()` and `SET LOCAL bookone.ledger_maintenance = 'archive_restore'` as the first statement of its transaction.
- `scripts/coreguard/seed.ts`: cleanup uses `maintenanceDb()` with `'coreguard_cleanup'`.
- `scripts/init-db.ts`: generate a `boot_id`. After each file, insert `(boot_id, file, outcome, message)` into `coreguard.migration_runs`, in its own try/catch (the table doesn't exist until `060` has run).
- `scripts/coreguard/run.ts`: replace `drizzle-kit push --force` with `packages/db/scripts/push-additive.ts`, the same path as production.
- `apps/web/src/app/actions/reconciliation.ts` and any other place that creates or removes period locks: replace the check-then-insert with
  `db().transaction(async () => { await db().execute(sql\`SELECT coreguard.lock_period(${tenantId}, ${period}, ${userId}, ${reason})\`) })`, and the same for `coreguard.unlock_period`, inside the tenant context. Reopen requires a reason field in the UI.
- Remove the application-level period checks that duplicate G05 (`assertOpenPeriod` in `commercial-docs.ts`, `assertPeriodUnlocked` in `post-balanced-journal.ts`, the inline queries in `record-entry.ts`, `rental-money.ts`, `workspace.ts`). Keep one read-only helper `isPeriodLocked()` for UI hints only.
- `apps/web/src/lib/coreguard-errors.ts` (new) + use it in the shared server-action error handler (§4.4). `docs/KNOWN_ERRORS.md`.
- `packages/coreguard/` (new package skeleton: `package.json` named `@bookone/coreguard`, version `2.0.0`, vitest), with `test/guards.postgres.test.ts` and `test/flows.postgres.test.ts`. They run when `COREGUARD_REQUIRE_POSTGRES=1`, following `packages/auth/test/coreguard-custom-bank-postgres.test.ts`. The tests create their own non-superuser roles `cg_test_app` and `cg_test_maint` (member of `coreguard_maintenance`), because the CI database user is a superuser and superusers count as members of every role.
  Port the Appendix B cases that need only `060`–`063`: **all 49 of Part 1, plus C1 and the five A5 cases from Part 2** (55 cases). The other Part 2 cases are added by the step that adds their migration: C2/C3/C4 in Step 7 (PR 7a), G10 in PR 7i, G11 in Step 8, the hash chain in Step 11.
- `scripts/coreguard/preflight-062.sql` (new). Before deploying Step 2, run it on staging. Both rows must be 0, otherwise the two unique indexes in `061` can't be created. Fix any duplicates (reverse the extra posting, void the extra lock row) before merging:
  ```sql
  SELECT 'transactions with more than one live journal entry' AS problem, count(*) FROM (
    SELECT transaction_id FROM journal_entries WHERE voided_at IS NULL GROUP BY transaction_id HAVING count(*) > 1) d
  UNION ALL
  SELECT 'months with more than one active lock', count(*) FROM (
    SELECT tenant_id, period FROM period_locks WHERE status = 'locked' AND voided_at IS NULL GROUP BY 1, 2 HAVING count(*) > 1) d;
  ```
- `scripts/coreguard/backfill-fingerprints.sql` (new). Run it once after deploying Step 2 (as the migration/owner login), so months closed before CoreGuard get their closing balances recorded. It is safe to run twice:
  ```sql
  INSERT INTO coreguard.period_fingerprints (lock_id, tenant_id, period, tb_hash, tb_json)
  SELECT pl.id, pl.tenant_id, pl.period, x.tb_hash, x.tb_json
    FROM period_locks pl
   CROSS JOIN LATERAL coreguard.tb_through_period(pl.tenant_id, pl.period) x
   WHERE pl.status = 'locked' AND pl.voided_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM coreguard.period_fingerprints f WHERE f.lock_id = pl.id);
  ```
- `docker/docker-compose.staging.yml` and `docker-compose.prod.yml`: add `MAINTENANCE_DATABASE_URL` to the web service. `.env.example`: placeholder.
- `scripts/coreguard/create-db-logins.sql` (new): the operator commands in §6.9 with `<password>` placeholders.

**Do**: the above. The owner runs `create-db-logins.sql` on staging (§7, B4).

**Done when**
- The preflight showed 0 duplicates, and the fingerprint backfill ran on staging.
- The 55 Step 2 cases pass in CI.
- `pnpm test`, `pnpm coreguard:pilot` and the Playwright lane pass.
- Manual smoke test on staging, recorded in the CHG: create and post a sales invoice; receive a payment; record and reverse a Simple Entry; close a month and try to post into it (refused); reopen it with a reason; restore an archive into an empty company.
- Any guard rejection found during this work was fixed in the app, never in the guard.

---

### Step 3 — Sentinel checks (`packages/coreguard`) and CLI

**Files**
```
packages/coreguard/src/version.ts        COREGUARD_VERSION = '2.0.0'
packages/coreguard/src/types.ts          CheckDefinition (below)
packages/coreguard/src/registry.ts       all checks; validates unique ids and that each has a detector
packages/coreguard/src/sql/live.ts       the shared "live rows" CTE (below)
packages/coreguard/src/checks/<area>/CG-*.ts
packages/coreguard/src/sentinel/run-tenant.ts
packages/coreguard/src/guards/manifest.ts  expected triggers/functions/indexes (from Appendix A) for CG-P01
packages/coreguard/src/money.ts          bigint cents helpers
packages/coreguard/src/allowlist.ts      moved from scripts/coreguard/allowlist.ts (old path re-exports it)
packages/coreguard/test/detectors/CG-*.test.ts
packages/coreguard/test/registry.test.ts
packages/coreguard/ratchet.json          §6.6
packages/coreguard/ruleset.lock.json     generated by `pnpm coreguard:lock`
scripts/coreguard/sentinel-cli.ts        pnpm coreguard:sentinel --db <url> (--tenant <id> | --all) [--json]
```

```ts
export interface CheckDefinition {
  id: string;                       // 'CG-A01', never reused
  revision: number;                 // bump when the SQL meaning changes
  title: string;                    // for engineers
  explain: string;                  // plain words for the Health check screen
  remediation: string;              // what to look at
  area: 'ledger' | 'statements' | 'subledgers' | 'inventory' | 'tax' | 'platform';
  severity: 'critical' | 'high' | 'warning' | 'info';
  scope: 'tenant' | 'platform';
  cadence: 'incremental' | 'full';
  appliesWhen?: { modules?: string[]; costingMethods?: Array<'last' | 'average' | 'fifo'> };
  sql: string;                      // $1 = tenant id; returns violation rows only (0 rows = pass)
  subjectKey(row: Record<string, unknown>): string;
  toFinding(row: Record<string, unknown>): { subject: Record<string, unknown>; differenceCents?: bigint; message: string };
}
```

Shared live-rows CTE (the only definition of "a line that counts"):
```sql
WITH live_lines AS (
  SELECT jl.*, je.entry_date, je.transaction_id
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    JOIN transactions t     ON t.id = je.transaction_id
   WHERE jl.tenant_id = $1 AND je.tenant_id = $1 AND t.tenant_id = $1
     AND jl.voided_at IS NULL AND je.voided_at IS NULL AND t.voided_at IS NULL
)
```

**Do**
1. Implement these checks with a detector test each (§6.2 defines them): CG-L01, L02, L03, L04, L05, L07, L08, L10, L14, S01, S03, A01, A02, A03, I01, I02, P01, P02.
2. `run-tenant.ts` runs the algorithm in §6.8.2 and writes results only through `coreguard.record_check_result()`.
3. Detector test pattern: seed a small clean company → assert the check returns 0 rows → plant one defect inside `SET LOCAL bookone.ledger_maintenance = 'coreguard_corruption'` (lab DB, maintenance login) → assert the check returns exactly that subject and difference. CG-L01 needs two detectors: an invalid side (`'DEBIT'`) and a `NaN` amount.
4. Use `control_role`, never hard-coded account codes. Put the AR/AP document type and status lists in `packages/coreguard/src/constants.ts`, and make `packages/db/src/archive/remap.ts` import them, so the backup validator and the Sentinel use the same definitions.

**Done when**
- `registry.test.ts` passes (every check has a detector) and all detectors pass.
- The CLI on a freshly seeded pilot database reports 0 findings.
- The CLI on a copy of the staging database produces a findings report, attached to the CHG. Findings are **reported, not fixed**, in this PR.

---

### Step 4 — `coreguard` worker container

**Files**: `apps/coreguard/**` (layout in §6.8.1), `docker/Dockerfile.coreguard`, the `coreguard` service in both compose files (§6.9), a build/push job for `ghcr.io/dinu-sri/bookone-coreguard` in `.github/workflows/docker-web.yml`, and env placeholders in `.env.example`.

**Do**: implement §6.8: job table runner, schedule, run requests, heartbeats, sentinel, guards-presence, period-fingerprint verification, freshness, retention and notify (email behind `COREGUARD_NOTIFY_EMAILS`). No HTTP port. A Docker HEALTHCHECK script only.

**Done when**
- On staging the container runs, beats every 30 s, sweeps every company within 26 h, and survives a container restart and a Postgres restart.
- At boot it refuses to start if the lab URL uses the same user as the monitor URLs. It also tries to connect to the main database with the lab login and expects `permission denied`.
- `grep` shows findings are written only through `coreguard.record_check_result()`.
- Test A5 passes (acknowledge → timeout → still red → recheck → resolved).

---

### Step 5 — Control Room → Health check

**Files**: `apps/web/src/app/control-room/health-check/page.tsx` (replace the placeholder), `companies/[tenantId]/page.tsx`, `findings/[findingId]/page.tsx`, `apps/web/src/app/actions/coreguard.ts`, `apps/web/src/components/control-room/coreguard-*.tsx`.

**Do**: build the screens in §6.7. Every page and action checks `isPlatformAdmin()`. "Run check now" and "Recheck" only insert a row into `coreguard.run_requests`.

**Done when**
- A super admin sees live data on staging; a non-admin is redirected (test).
- A requested run shows its result within 2 minutes.
- The UI rulebook checklist is in the CHG, and a browser journey is added in `bookone-qa`.

---

### Step 6 — CI gate, lab runner and certificate

**Files**: `scripts/coreguard/gate.ts`, `apps/coreguard/src/lab/run.ts` (also `pnpm coreguard:lab`), `.github/workflows/production-check.yml` (add jobs `coreguard-gate` and `coreguard-lab`), `.github/workflows/docker-web.yml` (lab produces `coreguard-certificate.json`; the build job copies it into both images), `apps/coreguard/src/jobs/certificate-import.ts`, and the certificate card on the Health check screen.

**Do**: implement the gate rules in §6.5 and the lab suites in §6.4. A suite that can't run is reported as `blocked`, never as passed.

**Done when**
- A PR touching the financial surface without a CoreGuard impact section fails CI-1 (demonstrated with a throwaway branch and recorded in the CHG).
- The certificate for the running staging build shows on the Health check screen.
- The owner has turned on branch protection with the required checks (§7, B3).

---

### Step 7 — One posting service (`packages/ledger-core`)

**API**
```ts
export interface PostOperationInput {
  tenantId: string;
  userId: string;
  operationKey: string;                 // required, 16–80 chars
  kind: 'simple_entry' | 'sales_invoice' | 'customer_invoice' | 'pos_sale' | 'sales_return' | 'purchase_bill'
      | 'purchase_return' | 'cash_purchase' | 'grn' | 'receipt' | 'payment' | 'opening_balance' | 'advance'
      | 'advance_settlement' | 'rental' | 'stock_adjustment' | 'stock_transfer' | 'bank_recon' | 'incorporation';
  source?: { kind: string; id: string };              // the document being posted → transactions.source_kind/source_id
  date: string;                                       // YYYY-MM-DD
  transaction: { accountingType: string; direction: string; party: string; description: string;
                 paymentMethod: string; paymentAccountId: string; transferSourceAccountId?: string;
                 brandId?: string; locationId?: string; bookDomain?: string; notes?: string; receiptRef?: string;
                 invoiceRef?: string; categoryCode?: string; categoryName?: string; categorySource?: string };
  memo: string;
  lines: Array<{ accountId: string; side: 'debit' | 'credit'; amount: string; partyId?: string; memo?: string;
                 brandId?: string; locationId?: string }>;
  stock?: Array<{ productId: string; movementType: string; quantity: string; unitCost?: string;
                  fromLocationId?: string; toLocationId?: string; referenceType: string; referenceId: string;
                  sourceLineId: string }>;
  allocations?: Array<{ paymentTransactionId?: string; invoiceTransactionId: string; amount: string;
                        payerPartyId: string; debtorPartyId: string;
                        thirdParty?: { reason: ThirdPartyReason; reference: string; note?: string; attachmentId?: string } }>;
  audit: { tableName: string; recordId?: string; newValues?: unknown };
}
export async function postOperation(input: PostOperationInput): Promise<{ transactionId: string; journalId: string; replayed: boolean }>;
export async function reverseOperation(input: { tenantId: string; userId: string; operationKey: string;
  transactionId: string; date: string; reason: string }): Promise<{ transactionId: string; journalId: string; replayed: boolean }>;
// Typed errors: ValidationError, UnbalancedError, PeriodLockedError, IdempotencyConflictError, OperationKeyRequiredError, GuardError
```

**What `postOperation` does, in order, in one `db().transaction` (READ COMMITTED)**
1. Validates and converts every amount to `bigint` cents (§4.1). Σdebit === Σcredit, at least one line per side, every amount > 0.
2. Computes `request_hash` = SHA-256 of the canonical JSON of the input (keys sorted; amounts as cents strings; `operationKey` and `audit` excluded).
3. `SELECT coreguard.claim_operation(tenantId, operationKey, requestHash, kind)`. A non-null result → return it with `replayed: true`. The function errors on a missing key or changed contents.
4. Inserts the transaction (with `source_kind`/`source_id`), the journal entry, all lines in one multi-row insert, the stock movements (with `source_line_id`), and the allocations (with the operation key, payer and debtor), then the audit log.
5. Locks the payment and invoice rows `FOR UPDATE` (payment first, then invoices by id) and checks the allocation caps: Σ allocations from a payment ≤ payment amount; Σ to an invoice (plus applied credit notes) ≤ invoice total. It updates the invoice's `paid_amount`/`balance_due` by exactly the allocated amount.
6. `UPDATE ledger_operations SET result = {...}` and returns.

`reverseOperation` moves `createReversingEntry` from `record-entry.ts`: it locks the original `FOR UPDATE`, posts mirror lines (with the same `party_id`s), sets `reversed_by_transaction_id` on the original in the same transaction, and keeps the same `source_kind`/`source_id`, so the document can be posted again later.

**Client side**: add a `useOperationKey()` hook that creates a UUID when a financial form opens and keeps it until the operation succeeds; every financial server action requires it.

**PRs, in this order** (each PR: move one writer, no behaviour change; before/after trial-balance hashes of the pilot seed and golden data are identical; `ratchet.json → ledgerWriterFiles` goes down by one)
- 7a `packages/ledger-core` + migration `064_coreguard_operations.sql` + Drizzle column `inventory_movements.sourceLineId: uuid('source_line_id')` + `useOperationKey()`
- 7b `post-balanced-journal.ts` (advances, opening balances) → ledger-core; delete the helper
- 7c `record-entry.ts` (Simple Entry, reversals)
- 7d `rental-money.ts`
- 7e `entity-lifecycle.ts`
- 7f `inventory.ts`
- 7g `documents.ts`
- 7h `commercial-docs.ts`
- 7i all control-account lines now carry `party_id` → migration `065_coreguard_party_guard.sql` (G10); checks CG-A08, A10, A11, I06

**Done when**
- `ledgerWriterFiles` = 0 outside `packages/ledger-core` (the allowlist covers restore and CoreGuard test code).
- `operationKey` is required in every financial server action.
- Lab flows C2 (identical retry from two connections), C3 (changed contents refused) and C4 (post → reverse → repost) are ported (PR 7a) and pass against ledger-core. The G10 case is ported in PR 7i and passes.

---

### Step 8 — Allocations and third-party payments

**First** add the business rules BR-1, BR-2 and BR-3 (§6.11) to the `bookone-qa` rulebook (Rule Zero).

**Files**
- Drizzle columns on `settlement_allocations`: `operationKey varchar(80)`, `payerPartyId uuid → parties`, `debtorPartyId uuid → parties`, `thirdParty varchar(1) default '0'`, `thirdPartyReason varchar(30)`, `thirdPartyNote varchar(500)`, `thirdPartyReference varchar(120)`, `thirdPartyAttachmentId uuid`, `reversesAllocationId uuid`.
- Drizzle column `company_settings.businessSector varchar(40)` (values: `general`, `gems_jewellery`, `real_estate`, `other`; asked during setup and in Settings).
- Sales settings: `allowThirdPartyPayments` (default on), `requireThirdPartyAttachment` (default on when the sector is `gems_jewellery` or `real_estate`, otherwise off; turning it off for those sectors needs owner/admin confirmation and writes an audit row).
- Migration `066_coreguard_allocations.sql` (Appendix A).
- UI: in the receive-payment / allocate dialog, when the payer differs from the invoice's customer, show a "Paid on behalf of" section (reason, reference, attachment). The customer statement shows "Payment received from <payer> on your behalf — ref …".
- Refunds of a third-party receipt go to the payer. Refunding anyone else requires the `approve_third_party_refund` permission (owner/admin), a reason and an attachment.
- Receipts for a VAT-registered company from a party with no open invoice: the UI offers "Record as advance" only (BR-3).
- Checks CG-A04, A09, A12 with detectors.

**Done when**
- The ten G11 cases from Appendix B Part 2 are ported and pass. GC-001 events E25a–E25e2 (§6.3) pass against the answer key (draft until the CA signs it, B1).
- A customer statement shows third-party receipts correctly (browser journey in `bookone-qa`).

---

### Step 9 — Golden datasets

**Files**
- `packages/coreguard/golden/` as delivered in the implementation pack (copy unchanged):
  - `README.md`
  - `_model/` (the independent answer-key model, Python)
  - 12 company folders `gc-001-lanka-traders` … `gc-012-property-developer`, each with `scenario.v1.json`, `expected.v1.json`, `expected.v1.xlsx` and `README.md`
- `packages/coreguard/src/golden/{dsl.ts, replay.ts, compare.ts}`

**Do**
1. **Replay.** The adapter (`replay.ts`) reads `scenario.v1.json` and runs the events in order through `packages/ledger-core` and the document services, the same code the server actions use.
   - Each event's `inputs` holds what a user would enter.
   - `expect.outcome` is one of:
     - `posted`: compare the journal;
     - `posted (no journal)`: register-only events and stock transfers;
     - `rejected`: nothing may be posted; match the reason code;
     - `no new posting`: the retried operation key;
     - `closed` / `reopened`.
2. **Compare.** `compare.ts` reads results two ways:
   - with CoreGuard SQL: trial balance, aging, stock, VAT;
   - with BookOne's report functions: `composeFinancialStatements`, `statementOfProfitOrLoss`, `statementOfFinancialPosition`, `statementOfCashFlows`, and the VAT report.
   Both must equal `expected.v1.json` to the cent: the journal per event, month-end snapshots, period totals, open advances and deposits.
3. **Answer-key status.** `expected.v1.json → answerKey.status` is `"draft"` until the chartered accountant signs (§7, B1).
   - A draft key is still enforced: a mismatch fails the build.
   - The report says *"passed against DRAFT answer key (pending CA sign-off)"*. The Health check screen (§6.7) shows the same amber label.
   - When the CA signs, set `status: "signed"` with name, membership number and date. Corrections are applied in `_model` and regenerated (`python3 build_all.py`), never typed into the JSON by hand.
4. **Modules not built yet.** Events with `requiresModule` (hotel, manufacturing, foreign currency, WHT, loyalty, property, etc.) are reported as *waiting for module <name>*, not as failures.
   - Under Rule Zero, the PR that builds such a module must make that module's golden events pass in the same PR, and list them in its CHG.
   - Known gaps (`knownGaps`) need a waiver (§6.6).
5. **Independence.** **Never generate or "fix" expected values by running BookOne.** `_model` must not import BookOne code. CI-5 blocks changes to `golden/**/expected.*` without the `CoreGuard-Expected-Change` trailer.

**Done when**
- All 12 scenarios replay.
- GC-001 and GC-002 pass in full against their keys, apart from listed known gaps.
- GC-003 to GC-012 pass every event that has no `requiresModule`.
- The golden lane shows per company: passed / known gaps / waiting-for-module counts, and whether the key is draft or signed.

---

### Step 10 — Property and mutation tests

**Do**
- Add `fast-check` to `packages/coreguard` (dev). Implement properties P01–P13 (§6.4) as model-based tests against an independent integer-cent model (`packages/coreguard/src/golden/oracle.ts`, which must not import BookOne code). CI: 200 runs per property with fixed seeds. The staging container nightly: 2,000 runs with a random seed, and a failing seed is stored with its repro command.
- Add StrykerJS weekly (`.github/workflows/coreguard-mutation.yml`) on `packages/ledger-core`, `packages/accounting/src/engine` and the checks (through the detectors). Report-only for 4 weeks, then set `ratchet.json → mutationScore`.

**Done when**: all properties pass in CI, and the first mutation report is attached to the CHG.

---

### Step 11 — Hash chain, remaining checks, alerts

**Do**
- Migration `067_coreguard_hash_chain.sql`. After deploying, run `SELECT coreguard.backfill_chain(id) FROM tenants` once on each environment.
- Remaining checks with detectors: CG-L06, L09, L11, L12, L13, S02, S04, A05, A06, A07, I03, I04, I05, T01, T02, P03, P04, P05.
- Alerts: email on a new critical finding (max 1 per company per hour) and a daily digest at 08:00 Asia/Colombo.

**Done when**: the five hash-chain cases from Appendix B Part 2 are ported and pass; `coreguard.verify_chain()` returns 0 rows for every company on staging; every check has a detector; and alert emails arrive on staging when a lab finding is planted.

---

### Step 12 — The web app stops using the database superuser

Do this as soon as Steps 0–2 are merged. It runs in parallel with Steps 3–11 and **must be finished before the first real client**. Today the web app connects as `POSTGRES_USER`, a superuser: row-level security doesn't apply to it, and it could switch triggers off.

**Do**
1. Logins (add them to `create-db-logins.sql`):
   - `bookone_owner`: owns the tables, used **only** by `docker/entrypoint.sh` for push-additive and init-db (`MIGRATION_DATABASE_URL`)
   - `bookone_app`: `NOSUPERUSER NOBYPASSRLS`, not an owner; DML grants on `public`; `USAGE` on schema `coreguard` (guard triggers call `coreguard.*` functions); `SELECT` on `coreguard.*`; `INSERT` on `coreguard.run_requests`; `UPDATE (acknowledged_by, acknowledged_at, acknowledge_note, waiver_id, waiver_expires, status)` on `coreguard.findings`
   - `bookone_platform`: `NOSUPERUSER BYPASSRLS`, not an owner; used **only** through `platformDb()` for Control Room, platform admin, auth/session lookups and tenant creation
   - `ALTER DEFAULT PRIVILEGES FOR ROLE bookone_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bookone_app, bookone_platform;`
2. `DATABASE_URL` = `bookone_app`, `PLATFORM_DATABASE_URL` = `bookone_platform`, `MIGRATION_DATABASE_URL` = `bookone_owner`. The entrypoint uses `MIGRATION_DATABASE_URL` for steps 1–2 and never passes it to the app.
3. Run the full test suite and the Playwright lanes with the app on `bookone_app`. Every failure caused by RLS is fixed either by setting the tenant context correctly or, only for truly cross-company platform code, by moving it to `platformDb()`. List every `platformDb()` call site in `docs/coreguard/PLATFORM_DB_ALLOWLIST.md`. CI-12 fails on any call site not in that file.

**Done when**: all tests and lanes pass with the web app on `bookone_app`, and CG-P03 is green on staging.


---

## 6. Reference

### 6.1 Database guards

| ID | Guard | Table / event | Migration |
|---|---|---|---|
| G01 | Every live entry balances exactly, has ≥1 debit and ≥1 credit line, and no line with an invalid side, NaN or non-positive amount. Checked at COMMIT. | `journal_lines` I/U/D, `journal_entries` I/U | 062 |
| G02 | Line side is `debit`/`credit`; amount finite and > 0 | `journal_lines` I | 062 |
| G03 | Line, entry, account, transaction and party all belong to the same company; account is not a group and is active | `journal_lines` I, `journal_entries` I | 062 |
| G04 | No delete; no change to financial fields (incl. `party_id`); `reversed_by` set once; period lock only locked → unlocked | `journal_lines`, `journal_entries`, `transactions`, `period_locks` U/D | 062 |
| G05 | Nothing dated in a locked month. Takes the shared tenant-month lock (close takes it exclusive). READ COMMITTED required | `journal_entries` I, `inventory_movements` I | 062 |
| G06 | Valid ISO dates, `'0'`/`'1'` flags, finite positive amounts, no NaN in documents | entries, transactions, movements, allocations, documents | 062 |
| G07 | Every transaction has a journal by COMMIT (+ unique index `cg_one_live_entry_per_tx` = exactly one) | `transactions` I | 061, 062 |
| G08 | Per-company hash chain of committed entries | `journal_entries` I | 067 |
| G09 | Seal: lines only in the DB transaction that created their entry; entries only in the one that created their transaction | `journal_lines` I, `journal_entries` I | 062 |
| G10 | Lines on `ar`/`ap`/advance control accounts name the party | `journal_lines` I | 065 |
| G11 | Allocation has an operation key, payer and debtor; payer ≠ debtor only as a flagged third-party payment with reason + reference; allocations immutable | `settlement_allocations` I/U/D | 066 |
| — | Close/reopen: `coreguard.lock_period` / `unlock_period` (tenant context, READ COMMITTED, G05 present, exclusive lock, fingerprint in the same transaction) | functions | 063 |
| — | Retry safety: `coreguard.claim_operation`; post once: `cg_post_once_live`; one movement per document line: `cg_movement_once` | function, indexes | 064 |

### 6.2 Sentinel checks

Severity: **critical** = the statements are wrong now or the ledger was tampered with; **high** = a subledger, stock or tax figure is wrong or a guard is missing; **warning** = suspicious or a known gap; **info** = for review.

| ID | Check (violation rows returned) | Sev | Step |
|---|---|---|---|
| CG-L01 | Live entry whose lines don't balance exactly, or that has a line with an invalid side or a NaN/non-positive amount (count invalid lines explicitly; `SUM` ignores NULL) | critical | 3 |
| CG-L02 | Live entry with no debit or no credit line; line whose entry is missing or voided | critical | 3 |
| CG-L03 | Company trial balance: Σdebits ≠ Σcredits over live lines | critical | 3 |
| CG-L04 | Live transaction without exactly one live entry; entry whose transaction is missing or voided | high | 3 |
| CG-L05 | Live line on a group, inactive or voided account, or an account whose `type` isn't asset/liability/equity/revenue/expense (BookOne's type for income accounts is `revenue`) | critical | 3 |
| CG-L06 | Cross-company reference anywhere in line → entry → transaction → account/party (platform, via a SECURITY DEFINER helper) | critical | 11 |
| CG-L07 | `is_balanced` flag disagrees with the lines | warning | 3 |
| CG-L08 | Any voided ledger row (D2 forbids voiding) | high | 3 |
| CG-L09 | Reversal links not symmetric; reversal lines don't mirror the original; more than one live reversal | high | 11 |
| CG-L10 | Entry dated in a locked month but created after the lock | critical | 3 |
| CG-L11 | Entry dated more than 31 days in the future | warning | 11 |
| CG-L12 | Live transaction without an `audit_log` row | warning | 11 |
| CG-L13 | `coreguard.verify_chain()` returns rows | critical | 11 |
| CG-L14 | Entry or transaction without a seal row (written with triggers off); line whose `created_at` ≠ its entry's `created_at` (added later) | critical | 3 |
| CG-S01 | Account with a balance whose type maps to neither P&L nor SoFP; Assets ≠ Liabilities + Equity + (Revenue − Expenses) | critical | 3 |
| CG-S02 | Cash/bank/card-clearing accounts ≠ opening cash + cash movements recomputed from lines | high | 11 |
| CG-S03 | Active period lock without a fingerprint, or `coreguard.tb_through_period()` hash ≠ the stored fingerprint (a closed month changed) | critical | 3 |
| CG-S04 | Opening balance run totals ≠ its journal | high | 11 |
| CG-A01 | AR control (`control_role='ar'`) ≠ Σ `balance_due` of posted AR documents. Simple Entry AR without a document is reported separately as a warning | critical | 3 |
| CG-A02 | AP control ≠ Σ `balance_due` of posted AP documents | critical | 3 |
| CG-A03 | Document arithmetic: `paid + due ≠ total`; Σ lines ≠ subtotal; total ≠ subtotal − discount + tax (+ freight + duty + other); invoice `balance_due < 0` | high | 3 |
| CG-A04 | Σ effective allocations to an invoice (+ credit notes) > total, or ≠ its `paid_amount` change; Σ from a payment > payment; a reversing allocation without a matching original | high | 8 |
| CG-A05 | Posted document without a live balanced journal, or the AR/AP line ≠ the document total | high | 11 |
| CG-A06 | Advance ledger: issued ≠ applied + refunded + settled + returned + open; open advances ≠ the advance control account | high | 11 |
| CG-A07 | Simple Entry money-in and a sales document with the same amount within ±1 day and the same party (possible double post) | warning | 11 |
| CG-A08 | Per party: AR/AP/advance GL balance (from `party_id`) ≠ that party's open document balance | critical | 7 |
| CG-A09 | Allocation whose payer ≠ the receipt's party, or debtor ≠ the invoice's party, or payer ≠ debtor without the third-party flag | high | 8 |
| CG-A10 | Duplicate allocation for the same (operation key, payment, invoice) | high | 7 |
| CG-A11 | More than one live unreversed posting for the same source document | critical | 7 |
| CG-A12 | Refund of a third-party receipt to anyone but the payer without an approved override (high); missing required attachment (warning); AR/AP settled without cash or allocation (high) | high | 8 |
| CG-I01 | Stock on hand ≠ Σ movements per product/location | critical | 3 |
| CG-I02 | FIFO companies: on hand ≠ Σ remaining layers; a layer with remaining < 0 or > received | critical | 3 |
| CG-I03 | Inventory GL ≠ stock value (FIFO layers / qty × average / qty × last cost) | high | 11 |
| CG-I04 | Negative stock (high if the company blocks negative stock, else warning); physical sale with zero cost | warning | 11 |
| CG-I05 | GRNI ≠ value of goods received not yet billed | high | 11 |
| CG-I06 | More than one movement for the same document line and movement type | critical | 7 |
| CG-T01 | Output VAT control movement per month ≠ tax on posted sales documents − returns − payments to the tax authority | high | 11 |
| CG-T02 | Input VAT control movement per month ≠ tax on posted purchase documents − returns − recoveries | high | 11 |
| CG-P01 | A trigger, function or index in `guards/manifest.ts` is missing or disabled | critical | 3 |
| CG-P02 | Latest boot has a `failed` row in `coreguard.migration_runs` | critical | 3 |
| CG-P03 | Web login is superuser, BYPASSRLS or table owner; a table with `tenant_id` has RLS off | high | 11 |
| CG-P04 | Any `coreguard.bypass_log` row in the last 24 h (warning) | warning | 11 |
| CG-P05 | A company without a successful full sweep in 26 h; worker heartbeat older than 2 min; dead jobs | high | 11 |

Reference SQL for CG-L01 (copy the pattern for the others):
```sql
SELECT je.id AS journal_entry_id, je.entry_date,
       SUM(CASE WHEN jl.side = 'debit'  THEN jl.amount ELSE 0 END) AS debit,
       SUM(CASE WHEN jl.side = 'credit' THEN jl.amount ELSE 0 END) AS credit
  FROM journal_entries je
  JOIN journal_lines jl ON jl.journal_entry_id = je.id AND jl.voided_at IS NULL
 WHERE je.tenant_id = $1 AND je.voided_at IS NULL
 GROUP BY je.id, je.entry_date
HAVING SUM(CASE jl.side WHEN 'debit' THEN jl.amount WHEN 'credit' THEN -jl.amount ELSE 0 END) <> 0
    OR COUNT(*) FILTER (WHERE jl.side IS NULL OR jl.side NOT IN ('debit','credit')) > 0
    OR COUNT(*) FILTER (WHERE jl.amount IS NULL OR jl.amount = 'NaN'::numeric OR jl.amount <= 0) > 0;
```

**Limit to state on the screen and in docs**: CoreGuard catches *inconsistent* party data (a receipt applied to another customer's invoice, a per-party balance that disagrees with the GL). It can't catch a *consistent* human mistake, where the wrong customer is picked everywhere. Customer statements catch that.

### 6.3 Golden datasets

**Format**
- `scenario.v1.json` holds the company setup (profile, rates, parties, products, locations, accounts, with custom accounts flagged), then the events in processing order. Amounts are integer cents; quantities are strings. Each event lists the rule IDs it exercises, its `inputs` and its `expect`.
- `expected.v1.json` holds:
  - the journal (and stock movements) per event, or the rejection;
  - at each month end: the trial balance per account, P&L for the month and the year to date, SoFP, cash flow (direct method), AR/AP aging per party with open items, stock per product, location and FIFO layer, VAT by box, and open advances and deposits;
  - totals for the whole period;
  - the CA questions, the workings and the known gaps.
- The answer keys are **draft** (§5 Step 9 item 3). The CA validates them using `expected.v1.xlsx`.

**Setting**: Sri Lankan financial year 1 April – 31 March. The datasets cover April–June 2026 (GC-002: April–May). VAT is 18 %, with zero-rated exports and exempt supplies. Rules and sources are on each workbook's Assumptions sheet; every point the model was unsure of is a numbered CA question.

**GC-001 "Golden Lanka Traders (Pvt) Ltd"**: VAT trader, FIFO, two stores (Colombo, Kandy), modules sales/purchase/inventory/POS.

| # | Event | # | Event |
|---|---|---|---|
| E01 | Opening balances incl. custom bank 1101 | E16a/b | Staff advance issued; settled with travel expense + returned cash |
| E02 | Move money 1101 → 1100 | E17 | Simple Entry expense (non-registered supplier, no VAT) |
| E03 | Opening stock 100 × 250.00 | E18a/b | Wrong Simple Entry, then its reversal |
| E04 | Credit purchase bill, VAT, 200 × 260.00 | E19a/b | Bank recon: card batch net of merchant fee; account fee |
| E05 | GRN 50 × 1,000.00 without bill | E20 | Supplier part payment |
| E06 | Bill for E05 at 1,020.00 (difference to stock) | E21 | Close April 2026 |
| E07 | Credit tax invoice 150 × 400.00 (FIFO COGS 100×250 + 50×260) | E22 | Back-dated post into April → **rejected** |
| E08 | Part receipt 35,400.00, allocated | E23 | Physical sale with zero cost → **rejected** (D17) |
| E09 | Sales return of 10, linked to E07 | E24 | Purchase return linked to E04 |
| E10 | Cash purchase with freight in cost | E25a–e2 | D8/D9/D10: cross-party allocation without flag **rejected**; flagged parent-company payment accepted; refund to non-payer **rejected**, to payer ok; one receipt allocated 40,000 + 30,800, a third allocation **rejected**; receipt with no invoice as ordinary receipt **rejected**, as customer advance ok |
| E11 | Mixed bill: goods + service (D18) | E26a–c | Same receipt twice with the same key → one posting; with no key → **rejected** |
| E12 | Stock write-off −5 at FIFO cost | E27–E31 | June purchase, sales, promo POS sale (VAT rounding 179.9982 → 180.00), supplier payment |
| E13 | Stock transfer Colombo → Kandy (no GL) | | |
| E14 | POS sale, cash + card | | |
| E15a–c | Customer advance (VAT at receipt), invoice, apply the advance | | |

**GC-002 "Nimal Tailoring"**: sole proprietor, Simple Entry only. Money in, money out, move money, owner drawings, a reversal, close April, reopen with a reason, post, close again, close May, then a back-dated post **rejected**.

**GC-003 … GC-012** (sector companies; events needing modules BookOne doesn't have yet carry `requiresModule`):

| Code | Company | What it tests |
|---|---|---|
| GC-003 | Lanka Event Hire & Catering | Advances with VAT, refundable deposit (no VAT) applied to a damage invoice, refund above the deposit **rejected**, hire furniture as PPE with depreciation and write-off, cancellation keeping 25 % |
| GC-004 | Ceylon Heritage Hotel | 10 % service charge as a staff liability, VAT on charges + service charge, 1 % TDL, night-audit accrual across month end, tour-operator advance, OTA commission |
| GC-005 | Lanka Click & Collect | Payment-gateway clearing and settlement net of fee, courier COD remittance, stock in transit, refused parcel, return within 7 days, refund above the amount paid **rejected** |
| GC-006 | Pixel Lanka Digital | Project advance + milestones, annual SaaS deferred, zero-rated USD exports, realised and unrealised exchange differences, 5 % WHT on a freelancer (payment without WHT **rejected**) |
| GC-007 | Lanka Polymer Products | Raw materials → WIP → finished goods, overhead absorbed at 50 % of wages with under/over-absorption, normal and abnormal loss, open WIP, double completion **rejected** |
| GC-008 | Serendib Apparel Exports | Fabric import with VAT at Customs, landed cost, CMT subcontract job costing, zero-rated USD export, VAT refund position, over-issue **rejected** |
| GC-009 | Spice Route Restaurant | Dine-in service charge, takeaway, delivery-platform sales net of commission, stock-count costing, wastage, cash short, void after day close **rejected** |
| GC-010 | Gampaha Hardware | Tonne → kg, volume discount on the invoice, post-dated cheque, dishonour + recharged fee, settlement discount credit note, overselling **rejected** |
| GC-011 | Lanka Fresh Supermarkets | Exempt + taxable lines in one basket, items by the gram, input-VAT apportionment, loyalty points, supplier rebate split stock/COGS, shrinkage |
| GC-012 | Lanka Land & Homes | Land as inventory with stamp duty and blocked VAT capitalised, exempt plot sale, taxable condominium unit, booking advances with and without VAT, forfeiture, second transfer **rejected** |

**Known gaps**: where the answer key says what *should* happen and BookOne doesn't do it yet (for example GC-001's taxable advances, which `advances.ts` currently refuses), list the event in `knownGaps` with a waiver id (§6.6). The lab then reports "passed with N known gaps". CI fails if a listed gap starts passing but is still listed.

### 6.4 Lab suites and properties

| Suite | Content | Pass condition |
|---|---|---|
| migrate | Fresh schema; push-additive; all migrations, twice | 0 failures; CG-P01 green |
| guards | The 49 guard cases (Appendix B, Part 1), from Step 2 | All pass |
| flows | The 30 flow cases (Appendix B, Part 2), with separate connections for C1/C2, added step by step (Step 2: C1 + A5; 7a: C2–C4; 7i: G10; 8: G11; 11: chain) | All ported cases pass |
| detectors | Each check: clean → 0 rows; planted defect → exactly that subject | All pass |
| golden | GC-001, GC-002 vs `expected.v1.json`, through CoreGuard SQL **and** report functions | Equal to the cent (known gaps listed) |
| restore-agreement | `journalsAreBalanced`, `stockMatchesLayers`, `arApMatchesDocuments` vs CG-L01/L02, I02, A01/A02 on exported golden data | Same verdicts |
| properties | P01–P13 | All hold |
| pilot | Existing `coreguard:pilot` vitest files | Unchanged |

Properties (model-based, fast-check, against an independent integer-cent model):

| ID | Property |
|---|---|
| P01 | After any valid sequence of commands, every Sentinel check returns 0 rows |
| P02 | Trial balance, per-party AR/AP, stock qty and FIFO value equal the model |
| P03 | Post X then reverse X → every balance is back where it was |
| P04 | Same-dated postings in any order → identical trial balance |
| P05 | Multiplying quantities or prices by k scales balances by k (within the documented VAT rounding rule) |
| P06 | Random quantities, prices, discounts and VAT rates (heavy on .005 edges) → the stored journal balances exactly and the document arithmetic holds |
| P07 | Every pure posting builder returns balanced, positive, valid lines or throws a typed error |
| P08 | The same operation key twice → one posting |
| P09 | Any command dated in a locked month is refused and changes nothing |
| P10 | Commands in company A never change company B |
| P11 | Stock: Σin − Σout = on hand; FIFO never consumes more than a layer; layers never go negative |
| P12 | Each party's balance equals the model's; unflagged cross-party allocations are always refused; third-party payments reduce only the debtor |
| P13 | Replaying any command (same key) any number of times, in any interleaving, equals running it once |

### 6.5 CI gate (`scripts/coreguard/gate.ts`) and financial surface

**Financial surface** (`packages/coreguard/src/surface.ts`, mirrored in `docs/coreguard/FINANCIAL_SURFACE.md`):
```
packages/accounting/**              packages/ledger-core/**          packages/coreguard/**
packages/commerce/**                packages/agent-bridge/src/**     packages/db/migrations/**
packages/db/src/archive/**          scripts/init-db.ts               scripts/coreguard/**
docker/entrypoint.sh                apps/web/src/lib/post-balanced-journal.ts
packages/db/src/schema/{accounts,transactions,journal-entries,journal-lines,business-documents,settlement-allocations,
  party-advances,opening-balances,inventory,inventory-settings,reconciliation,sales-settings,purchase-settings,
  tenants,company-settings,parties}.ts
apps/web/src/app/actions/{record-entry,commercial-docs,documents,inventory,entity-lifecycle,rental-money,rental-bookings,
  advances,opening-balances,bank-reconciliation,reconciliation,statement-import,bank-import-studio,financial-statements,
  workspace,dashboard,cashbook,cashbook-banks,chart-of-accounts,accounts,parties,pos-session,pos-registers,commerce,
  agent-bridge}.ts
```

| Rule | Fails when |
|---|---|
| CI-1 | The diff touches the financial surface and no CHG in the diff has a "CoreGuard impact" section naming existing check/guard IDs (validated against the registry) or new ones |
| CI-2 | A check in the registry has no detector test |
| CI-3 | Check or guard files changed, but `ruleset.lock.json` wasn't regenerated or the CoreGuard version wasn't bumped (§6.6) |
| CI-4 | A ratchet value in `ratchet.json` got weaker without a valid waiver trailer |
| CI-5 | `golden/**/expected.*` changed without the trailer `CoreGuard-Expected-Change: <bookone-qa RULE_CHANGE id>` |
| CI-6 | A file outside `packages/ledger-core` (and the allowlist: `packages/db/src/archive/restore.ts`, `packages/coreguard/test/**`, `packages/coreguard/src/golden/**`, `scripts/coreguard/**`) inserts into `transactions`, `journal_entries`, `journal_lines`, `inventory_movements`, `inventory_cost_layer*` or `settlement_allocations`. Until Step 7 ends, the count may not exceed `ratchet.json → ledgerWriterFiles` |
| CI-7 | `bookone.ledger_maintenance` or `MAINTENANCE_DATABASE_URL` appears outside `packages/db/migrations/06*_coreguard_*.sql`, `packages/db/src/maintenance-db.ts`, `packages/db/src/archive/restore.ts`, `scripts/coreguard/**`, `packages/coreguard/test/**`, `apps/coreguard/src/lab/**` |
| CI-8 | `packages/coreguard/src/{checks,sentinel}/**` imports `@bookone/accounting`, `@bookone/ledger-core` or `apps/**` |
| CI-9 | `insert(periodLocks)`, `update(periodLocks)` or raw SQL on `period_locks` outside the two SQL functions |
| CI-10 | The production compose default for `COREGUARD_LAB_ENABLED` isn't `0` |
| CI-11 | `parseFloat(`, `Number(`, `toFixed(` or `Math.round(` appears in `packages/ledger-core/src/**` |
| CI-12 | `platformDb()` is used at a call site not listed in `docs/coreguard/PLATFORM_DB_ALLOWLIST.md` (from Step 12) |

The gate's JSON output goes into the certificate. Required checks on `master`: Production Check (tests, lint/typecheck/build), CoreGuard gate, CoreGuard lab.

### 6.6 Versioning, ratchet, waivers

**Version**: `packages/coreguard/package.json → version` (semver, starts at `2.0.0`), mirrored in `COREGUARD_VERSION`. MAJOR = a check or guard removed or its meaning changed. MINOR = a new check, guard, golden scenario or property, or a severity raised. PATCH = text/performance with identical verdicts on all lab fixtures. Each check also has its own `revision`. Golden scenarios are versioned files (`scenario.v2.json`): never edit a released version in place. `docs/coreguard/CHANGELOG.md` gets one entry per version.

**`packages/coreguard/ratchet.json`** records current values; CI refuses to make them weaker:
```json
{
  "checks": 18,
  "severities": { "CG-L01": "critical" },
  "tolerancesCents": {},
  "guards": ["G01","G02","G03","G04","G05","G06","G07","G09"],
  "ledgerWriterFiles": 7,
  "goldenScenarios": [],
  "properties": [],
  "propertyRunsCi": 0,
  "mutationScore": null,
  "financialSurfaceEntries": 0
}
```
Each step updates the values it adds (more checks, fewer writer files, new scenarios, …). Weaker = fewer checks, guards, scenarios or properties; a lower severity; a higher tolerance; more writer files; fewer surface entries; a mutation score more than 2 points lower.

**Waivers**: `docs/coreguard/waivers/CGW-NNNN.md` with "Applies to" (check/golden event), "Reason", "Approved by" (owner name and date), "Expires" (≤ 90 days). The commit trailer is `CoreGuard-Waiver: CGW-NNNN`. A waived finding shows amber "Known gap — waived until <date>" and turns red again when the waiver expires.

### 6.7 Health check screen (Control Room, super admin only)

**Overview** (`/control-room/health-check`)
- Top line: overall status word, running build (version + SHA), CoreGuard version, last full check, next check, and the primary button **Run full check now**.
- **Companies** table: name, status word, last checked, open critical/high/warning, known gaps. Click → company page.
- **Database guards**: each guard, present yes/no, rejections in 24 h (count `COREGUARD G` entries in `/ops/logs`), maintenance uses in 24 h.
- **Build certificate**: golden, properties, detectors, guards, flows, browser lane, mutation score, CI run link. "Uncertified build" in red if the running SHA has none.
- **Golden companies**: one row per GC-001 … GC-012 with events passed / known gaps / waiting for module, and the answer-key status: "Draft — pending CA sign-off" (amber) or "Signed by <name>, <date>" (green).
- **Guardrails**: gate result on the last 20 financial PRs, ledger writer files (target 0), active waivers and next expiry.
- **Workers**: heartbeat age, version, queue (waiting/running/failed/dead), lab DB state, companies checked/queued/stale.

**Status words** = `coreguard.tenant_status()`:
| Value | Word | Colour |
|---|---|---|
| green | Books OK | green |
| amber | Needs a look (warnings only) | amber |
| known_gaps | Known gaps (only waived findings) | amber |
| check_failed | Check failed (a check could not run; red outranks it) | grey |
| red | Books disagree (any open critical/high, acknowledged or not) | red |
| — | Not checked (no successful run in 26 h) | grey |

**Company page**: findings grouped by area (Ledger, Statements, Customers & suppliers, Stock, Tax), each with plain-language text, difference in LKR, first seen, occurrences, and "Being handled by …" when acknowledged. Plus "Resolved in the last 30 days" and a **Recheck this company** button. No customer names in findings; subjects are record IDs and amounts.

**Finding page**: explanation, expected/actual/difference, subject records, history of the difference per run, check ID/revision, rulebook refs, remediation. Actions: **Acknowledge** (note required; stops repeat emails; never changes the colour), **Recheck now**, **Link waiver** (existing waiver file only). There is no "resolve" or "delete" button.

### 6.8 `coreguard` worker

#### 6.8.1 Layout
```
apps/coreguard/src/index.ts          boot: env check, identity (VERSION, BUILD_SHA), lab-login isolation check, start loops
apps/coreguard/src/config.ts
apps/coreguard/src/db.ts             pools: monitor (read), writer, lab
apps/coreguard/src/jobs/queue.ts     enqueue / claim (FOR UPDATE SKIP LOCKED) / complete / fail with backoff / dead after 3
apps/coreguard/src/jobs/scheduler.ts schedule below; run_requests → jobs; new SHA → deploy jobs
apps/coreguard/src/jobs/{sentinel-sweep,sentinel-tenant,guards-presence,period-fingerprint,lab,notify,certificate-import,freshness,retention}.ts
apps/coreguard/src/heartbeat.ts
apps/coreguard/src/healthcheck.ts    Docker HEALTHCHECK only (no HTTP server)
apps/coreguard/src/lab/run.ts        lab runner, also `pnpm coreguard:lab` in CI
```

#### 6.8.2 Per-company run
```
checks = applicable checks (scope, cadence, modules, costing method)
monitor connection:
  BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY          -- one snapshot for all checks
  SELECT set_config('app.current_tenant_id', tenantId, true)
  for each check:
    SAVEPOINT cg_check
    SET LOCAL statement_timeout = '60s'
    try   rows = run check SQL;  RELEASE SAVEPOINT cg_check;  result = passed | violations(rows)
    catch ROLLBACK TO SAVEPOINT cg_check;  result = error(message)
  COMMIT                                                   -- if the connection dies: tenant run 'check_failed', record nothing
writer connection, one transaction:
  for each result: SELECT coreguard.record_check_result(runId, tenantId, checkId, outcome, error, rowsJson)
  status = SELECT coreguard.tenant_status(tenantId, runId)
  INSERT INTO coreguard.tenant_runs (...)
```
- Fingerprint = sha256(`checkId|tenantId|subjectKey(row)`).
- Five errors in a row for the same check and company → platform finding `CG-RUNTIME-ERROR` (high).
- Expired waivers: the nightly job sets those findings back to `open`.

#### 6.8.3 Schedule (Asia/Colombo)
| Job | When |
|---|---|
| sentinel-incremental | Every 15 min, for companies with ledger/document/stock rows newer than their watermark; incremental checks only |
| sentinel-full | 01:30 nightly, all companies, all checks, concurrency 2, 200 ms pause between companies |
| guards-presence (CG-P01, P02) | Boot, first boot of a new SHA, hourly |
| period-fingerprint | Every 15 min: verify new locks; nightly: verify all (CG-S03) |
| lab (staging only) | First boot of a new SHA, 03:00 nightly |
| notify | Immediately on a new critical finding (max 1 per company per hour); digest at 08:00 |
| freshness (CG-P05) | Every 5 min |
| retention | Weekly: delete resolved findings older than 400 days, done jobs older than 30 days, bypass_log older than 400 days |

### 6.9 Compose, environment, database logins

**Compose service** (add to both files; the only difference is the lab default):
```yaml
  coreguard:
    image: ghcr.io/dinu-sri/bookone-coreguard:latest
    pull_policy: always
    container_name: bookone-coreguard
    environment:
      - COREGUARD_DATABASE_URL=${COREGUARD_DATABASE_URL}
      - COREGUARD_WRITER_DATABASE_URL=${COREGUARD_WRITER_DATABASE_URL}
      - COREGUARD_LAB_DATABASE_URL=${COREGUARD_LAB_DATABASE_URL:-}
      - COREGUARD_LAB_ENABLED=${COREGUARD_LAB_ENABLED:-0}   # docker-compose.staging.yml: ${COREGUARD_LAB_ENABLED:-1}
      - COREGUARD_CONCURRENCY=${COREGUARD_CONCURRENCY:-2}
      - COREGUARD_TZ=Asia/Colombo
      - COREGUARD_NOTIFY_EMAILS=${PLATFORM_ADMIN_EMAIL:-}
      - RESEND_API_KEY=${RESEND_API_KEY:-}
      - NODE_ENV=production
    networks: [bookone_network]
    depends_on:
      postgres: { condition: service_healthy }
    restart: unless-stopped
    deploy:
      resources:
        limits: { cpus: '0.50', memory: 512M }
```
No Traefik labels and no dependency on `web`.

**Environment variables**
| Variable | Container | Login |
|---|---|---|
| `DATABASE_URL` | web | `bookone_app` (until Step 12: the current user) |
| `PLATFORM_DATABASE_URL` | web | `bookone_platform` (Step 12) |
| `MIGRATION_DATABASE_URL` | web entrypoint only | `bookone_owner` (Step 12) |
| `MAINTENANCE_DATABASE_URL` | web | `bookone_maintenance` |
| `COREGUARD_DATABASE_URL` | coreguard | `coreguard_monitor` |
| `COREGUARD_WRITER_DATABASE_URL` | coreguard | `coreguard_monitor_rw` |
| `COREGUARD_LAB_DATABASE_URL` | coreguard (staging) | `coreguard_lab` → `bookone_coreguard_lab` |

**`scripts/coreguard/create-db-logins.sql`** (the owner runs it once per server, replacing `<…>`):
```sql
-- 0. See who connects today, so step 3 doesn't lock anyone out:
SELECT DISTINCT usename FROM pg_stat_activity WHERE datname = '<DB_NAME>';
-- 1. maintenance login (archive restore and CoreGuard cleanup only)
CREATE ROLE bookone_maintenance LOGIN PASSWORD '<password>' BYPASSRLS IN ROLE coreguard_maintenance;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bookone_maintenance;
GRANT USAGE ON SCHEMA coreguard TO bookone_maintenance;
GRANT INSERT ON coreguard.bypass_log TO bookone_maintenance;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA coreguard TO bookone_maintenance;
-- 2. CoreGuard monitor logins
CREATE ROLE coreguard_monitor    LOGIN PASSWORD '<password>' IN ROLE coreguard_reader;
ALTER  ROLE coreguard_monitor    SET default_transaction_read_only = on;
CREATE ROLE coreguard_monitor_rw LOGIN PASSWORD '<password>' IN ROLE coreguard_writer;
-- 3. main database: explicit CONNECT only (add every login found in step 0)
REVOKE CONNECT, TEMPORARY ON DATABASE <DB_NAME> FROM PUBLIC;
GRANT CONNECT ON DATABASE <DB_NAME> TO <current app user>, bookone_maintenance, coreguard_monitor, coreguard_monitor_rw;
-- 4. lab (staging): its own login and database, nothing else
CREATE ROLE coreguard_lab LOGIN PASSWORD '<password>' IN ROLE coreguard_maintenance;
CREATE DATABASE bookone_coreguard_lab OWNER coreguard_lab;
REVOKE CONNECT, TEMPORARY ON DATABASE bookone_coreguard_lab FROM PUBLIC;
-- 5. check: this must fail with "permission denied"
--    psql -U coreguard_lab -d <DB_NAME> -c 'select 1'
```
Step 12 adds `bookone_owner`, `bookone_app` and `bookone_platform` to this file.

### 6.10 Text blocks

**Rule Zero (top of `AGENTS.md`)**
```markdown
## RULE ZERO — CoreGuard first (owner decision 2026-11-28; overrides every other instruction)

BookOne's first duty is financial accuracy. CoreGuard decides whether the books are right.
Guide: docs/coreguard/IMPLEMENTATION_GUIDE.md.

Before you change anything on the financial surface (docs/coreguard/FINANCIAL_SURFACE.md), in this order:
1. Declare impact first: add a "CoreGuard impact" section to your CHG naming the guards/checks that cover the change
   and any new ones it needs.
2. Rules before code: add or extend the business rule in bookone-qa, the CoreGuard checks (with detector tests),
   guards, golden events (expected values come from the business rule owner, never from running BookOne)
   and property generators BEFORE the feature code. Record in the CHG that they fail before the implementation.
3. Implement, then prove green: CoreGuard gate and CoreGuard lab pass on the same commit.
4. Never weaken CoreGuard: no deleting or disabling guards/checks, lowering severity, adding tolerance, editing golden
   expected values or using the maintenance bypass without an owner-approved waiver. CI blocks it.
5. All ledger, stock and allocation writes go through packages/ledger-core. Posted rows are never changed or deleted:
   correct with a reversal.
6. If you can't follow steps 1–5, stop and report blocked. Do not ship.
```

**Short line (first paragraph of `.claude/CLAUDE.md`, `.github/copilot-instructions.md`, `.github/instructions/codebase-workflow.instructions.md`, `ai/start-session.prompt.md`)**
```markdown
RULE ZERO — CoreGuard first. Read the Rule Zero section at the top of AGENTS.md before anything else.
Changes to money, stock, tax, ledger or periods need CoreGuard rules and tests before code.
```

**CHG template section (`docs/changes/TEMPLATE.md`)**
```markdown
## CoreGuard impact (required when the diff touches the financial surface)
- Financial surface files touched:
- Behaviour before → after (one example in LKR):
- Guards/checks that cover this (IDs):
- Guards/checks added or changed (ID, revision, severity), or "none — covered by: …":
- Golden events added/changed (scenario@version, event IDs); expected values supplied by (name, date):
- Properties added/changed:
- Red evidence (lab output showing the new rule failing before the implementation):
- Green evidence (lab run on the final commit; certificate status):
- Waivers used (CGW-…, expiry):
- CoreGuard version: before → after
```

**`.github/CODEOWNERS`**
```
/packages/coreguard/        @Dinu-Sri
/packages/ledger-core/      @Dinu-Sri
/packages/db/migrations/    @Dinu-Sri
/apps/coreguard/            @Dinu-Sri
/scripts/coreguard/         @Dinu-Sri
/docs/coreguard/            @Dinu-Sri
/AGENTS.md                  @Dinu-Sri
/.github/workflows/         @Dinu-Sri
```

### 6.11 Business rules to add to the `bookone-qa` rulebook

Add each one in `bookone-qa` (with a RULE_CHANGE record) **before** the step that implements it. Use the next free rule IDs there.

| # | Rule | Step |
|---|---|---|
| BR-1 | One payment may be allocated to one invoice in several operations. Total allocations from a payment ≤ the payment; to an invoice ≤ the invoice total after credit notes. Undo is a reversing allocation. | 8 |
| BR-2 | A payment from a party other than the invoice's customer is a third-party payment: payer, reason (parent company, group company, director/owner, insurer, family member, agent/broker, other + note) and reference are required; an attachment is required when the company setting says so (default on for gems/jewellery and real estate). The invoice stays in the customer's name. Refunds go to the payer unless an owner/admin approves otherwise with a reason and attachment. | 8 |
| BR-3 | For a VAT-registered company, money received before any invoice exists is a customer advance. | 8 |
| BR-4 | A physical product can't be sold at zero cost. | 7 |
| BR-5 | A purchase bill with goods and services posts goods to inventory/GRNI and services to expense. | 7 |
| BR-6 | A closed month can be reopened only with a reason, and the reopening is logged. | 2 |

The golden expected values follow correct accounting. Where BookOne doesn't yet comply (the gaps in `docs/ACCOUNTING_INTEGRATION_AUDIT.md`), the golden event is listed as a known gap with a waiver. Fixing each gap is separate product work, done under Rule Zero.

---

## 7. Owner actions (the only things the agent can't do)

| # | Action | Needed by |
|---|---|---|
| B1 | Give each draft `packages/coreguard/golden/gc-*/expected.v1.xlsx` to a Sri Lankan chartered accountant. They answer the CA questions, mark each event Agree / Disagree / Query, and sign. Apply corrections in `_model`, regenerate, set `answerKey.status` to `signed`. Start with GC-001 and GC-002. | GC-001/002 before the first real client; each sector key before a client in that sector |
| B2 | As part of B1 for GC-001, the CA confirms BR-3 (VAT on advances: GC-001 CA-Q1) and the BR-2 third-party payment handling (CA-Q10), plus the attachment defaults for gems/jewellery and real estate. Record the confirmation in the Step 8 CHG. | Before the first real client |
| B3 | Turn on branch protection for `master`: code-owner review, and required checks Production Check, CoreGuard gate, CoreGuard lab. | Step 6 |
| B4 | Run `scripts/coreguard/create-db-logins.sql` on staging (and on production when it exists), and put the passwords in Portainer. | Step 2 (maintenance), Step 4 (monitor, lab), Step 12 (app roles) |


---

## Appendix A — SQL migrations (copy verbatim into `packages/db/migrations/`)
Each file was applied twice to a fresh PostgreSQL 16 database (no errors) and exercised by the tests in Appendix B. The columns these files rely on are added to the Drizzle schema in the step named next to each file.

### A.060 `060_coreguard_schema.sql` — Step 2

```sql
-- 060_coreguard_schema.sql
-- CoreGuard schema, result tables, seal tables, operation keys, roles and platform helpers.
-- Idempotent: scripts/init-db.ts re-runs every migration on every start.

CREATE SCHEMA IF NOT EXISTS coreguard;

-- ── Roles (NOLOGIN groups; login roles are created by the operator, guide §6.9) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'coreguard_reader')      THEN CREATE ROLE coreguard_reader NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'coreguard_writer')      THEN CREATE ROLE coreguard_writer NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'coreguard_maintenance') THEN CREATE ROLE coreguard_maintenance NOLOGIN; END IF;
END $$;

-- ── Maintenance bypass log (written by guards when an authorised maintenance session changes ledger rows) ──
CREATE TABLE IF NOT EXISTS coreguard.bypass_log (
  id          bigserial PRIMARY KEY,
  reason      text NOT NULL,
  table_name  text NOT NULL,
  operation   text NOT NULL,
  txid        bigint NOT NULL DEFAULT txid_current(),
  login_role  text NOT NULL DEFAULT session_user,
  app_name    text DEFAULT current_setting('application_name', true),
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- ── Seal tables (guard G09) ──
CREATE TABLE IF NOT EXISTS coreguard.entry_seal (
  journal_entry_id uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_xact     xid8 NOT NULL
);
CREATE TABLE IF NOT EXISTS coreguard.tx_seal (
  transaction_id   uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_xact     xid8 NOT NULL
);

-- ── Sentinel runs and results ──
CREATE TABLE IF NOT EXISTS coreguard.runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              text NOT NULL CHECK (kind IN ('sentinel_full','sentinel_incremental','sentinel_tenant','guards','lab','period_fingerprint')),
  trigger           text NOT NULL CHECK (trigger IN ('schedule','deploy','request','boot')),
  requested_by      uuid,
  product_version   text NOT NULL,
  product_sha       text NOT NULL,
  coreguard_version text NOT NULL,
  ruleset_hash      text NOT NULL,
  status            text NOT NULL DEFAULT 'running' CHECK (status IN ('running','finished','failed')),
  stats             jsonb NOT NULL DEFAULT '{}',
  error             text,
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz
);
CREATE INDEX IF NOT EXISTS runs_kind_time_idx ON coreguard.runs (kind, started_at DESC);

CREATE TABLE IF NOT EXISTS coreguard.tenant_runs (
  run_id       uuid NOT NULL REFERENCES coreguard.runs(id),
  tenant_id    uuid NOT NULL,
  status       text NOT NULL CHECK (status IN ('green','amber','known_gaps','red','check_failed')),
  checks_run   int NOT NULL DEFAULT 0,
  checks_error int NOT NULL DEFAULT 0,
  duration_ms  int,
  watermark    timestamptz,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  PRIMARY KEY (run_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS tenant_runs_tenant_time_idx ON coreguard.tenant_runs (tenant_id, started_at DESC);

CREATE TABLE IF NOT EXISTS coreguard.check_results (
  run_id      uuid NOT NULL,
  tenant_id   uuid,
  check_id    text NOT NULL,
  outcome     text NOT NULL CHECK (outcome IN ('passed','violations','error','not_applicable')),
  error       text,
  rows_found  int NOT NULL DEFAULT 0,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX IF NOT EXISTS check_results_uidx
  ON coreguard.check_results (run_id, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), check_id);

CREATE TABLE IF NOT EXISTS coreguard.findings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint      text NOT NULL,
  check_id         text NOT NULL,
  check_revision   int  NOT NULL DEFAULT 1,
  tenant_id        uuid,
  severity         text NOT NULL CHECK (severity IN ('critical','high','warning','info')),
  subject          jsonb NOT NULL,
  difference_cents bigint,
  message          text NOT NULL,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','waived','resolved')),
  waiver_id        text,
  waiver_expires   date,
  acknowledged_by  uuid,          -- triage note only; never used to compute status
  acknowledged_at  timestamptz,
  acknowledge_note text,
  first_seen_run   uuid NOT NULL,
  last_seen_run    uuid NOT NULL,
  last_checked_run uuid,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  occurrences      int NOT NULL DEFAULT 1,
  resolved_run     uuid,
  resolved_at      timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS findings_open_fingerprint_uidx ON coreguard.findings (fingerprint) WHERE status <> 'resolved';
CREATE INDEX IF NOT EXISTS findings_tenant_status_idx ON coreguard.findings (tenant_id, status, severity);

CREATE TABLE IF NOT EXISTS coreguard.period_fingerprints (
  lock_id       uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  period        varchar(7) NOT NULL,
  tb_hash       text NOT NULL,
  tb_json       jsonb NOT NULL,
  computed_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS period_fingerprints_active_uidx
  ON coreguard.period_fingerprints (tenant_id, period) WHERE superseded_at IS NULL;

CREATE TABLE IF NOT EXISTS coreguard.jobs (
  id           bigserial PRIMARY KEY,
  kind         text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}',
  priority     int NOT NULL DEFAULT 100,
  run_after    timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','dead')),
  attempts     int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  locked_by    text,
  locked_at    timestamptz,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_claim_idx ON coreguard.jobs (status, run_after, priority);

CREATE TABLE IF NOT EXISTS coreguard.run_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope        text NOT NULL CHECK (scope IN ('all','tenant','guards','lab')),
  tenant_id    uuid,
  requested_by uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  picked_at    timestamptz,
  job_id       bigint
);

CREATE TABLE IF NOT EXISTS coreguard.heartbeats (
  worker_id         text PRIMARY KEY,
  product_version   text NOT NULL,
  product_sha       text NOT NULL,
  coreguard_version text NOT NULL,
  started_at        timestamptz NOT NULL,
  last_beat_at      timestamptz NOT NULL,
  current_job       bigint,
  info              jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS coreguard.certificates (
  product_sha       text PRIMARY KEY,
  product_version   text NOT NULL,
  coreguard_version text NOT NULL,
  ruleset_hash      text NOT NULL,
  ci_run_url        text,
  created_at        timestamptz NOT NULL,
  body              jsonb NOT NULL,
  imported_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coreguard.migration_runs (
  id              bigserial PRIMARY KEY,
  boot_id         uuid NOT NULL,
  file            text NOT NULL,
  outcome         text NOT NULL CHECK (outcome IN ('applied','skipped','failed')),
  message         text,
  product_version text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Operation keys (retry safety). Tenant data, so it lives in public with RLS. ──
CREATE TABLE IF NOT EXISTS public.ledger_operations (
  tenant_id     uuid NOT NULL,
  operation_key varchar(80) NOT NULL,
  request_hash  text NOT NULL,
  kind          varchar(40) NOT NULL,
  result        jsonb,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, operation_key)
);
ALTER TABLE public.ledger_operations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ledger_operations'
                 AND policyname = 'ledger_operations_isolation') THEN
    CREATE POLICY ledger_operations_isolation ON public.ledger_operations FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
END $$;

-- ── Grants ──
GRANT USAGE ON SCHEMA public, coreguard TO coreguard_reader, coreguard_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO coreguard_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA coreguard TO coreguard_reader, coreguard_writer;
GRANT INSERT, UPDATE ON coreguard.runs, coreguard.tenant_runs, coreguard.check_results, coreguard.findings,
  coreguard.period_fingerprints, coreguard.jobs, coreguard.run_requests, coreguard.heartbeats,
  coreguard.certificates TO coreguard_writer;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA coreguard TO coreguard_writer;

-- ── Platform helper: the tenant-scoped reader cannot list tenants through RLS ──
CREATE OR REPLACE FUNCTION coreguard.list_tenants()
RETURNS TABLE (id uuid, name text, status text, environment text, modules jsonb, entity_kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id, name::text, status::text, environment::text, modules, entity_kind::text
  FROM tenants WHERE voided_at IS NULL
$$;
REVOKE ALL ON FUNCTION coreguard.list_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION coreguard.list_tenants() TO coreguard_reader;
```

### A.061 `061_coreguard_indexes.sql` — Step 2

```sql
-- 061_coreguard_indexes.sql
-- Indexes the guards and checks need, plus two uniqueness rules.
-- Plain CREATE INDEX (init-db sends each file as one implicit transaction, so CONCURRENTLY is not possible).

CREATE INDEX IF NOT EXISTS cg_jl_entry_idx          ON journal_lines   (journal_entry_id);
CREATE INDEX IF NOT EXISTS cg_jl_tenant_acct_idx    ON journal_lines   (tenant_id, account_id);
CREATE INDEX IF NOT EXISTS cg_je_tenant_tx_idx      ON journal_entries (tenant_id, transaction_id);
CREATE INDEX IF NOT EXISTS cg_je_tenant_date_idx    ON journal_entries (tenant_id, entry_date);
CREATE INDEX IF NOT EXISTS cg_je_tenant_created_idx ON journal_entries (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS cg_bd_tenant_type_idx    ON business_documents (tenant_id, document_type, status);
CREATE INDEX IF NOT EXISTS cg_im_tenant_prod_idx    ON inventory_movements (tenant_id, product_id);
CREATE INDEX IF NOT EXISTS cg_sa_tenant_inv_idx     ON settlement_allocations (tenant_id, invoice_transaction_id);
CREATE INDEX IF NOT EXISTS cg_sa_tenant_pay_idx     ON settlement_allocations (tenant_id, payment_transaction_id);

-- Exactly one live journal entry per transaction (with G07 "at least one", this makes "exactly one").
CREATE UNIQUE INDEX IF NOT EXISTS cg_one_live_entry_per_tx
  ON journal_entries (transaction_id) WHERE voided_at IS NULL;

-- One active lock per tenant and period.
CREATE UNIQUE INDEX IF NOT EXISTS cg_period_locks_active_uidx
  ON period_locks (tenant_id, period) WHERE status = 'locked' AND voided_at IS NULL;
```

### A.062 `062_coreguard_guards.sql` — Step 2

```sql
-- 062_coreguard_guards.sql
-- Ledger guards G01–G07 and G09. Always enforced: a violation raises SQLSTATE 23514 with a message
-- starting "COREGUARD Gxx:" and the whole transaction rolls back.
-- Only an authorised maintenance session (guide §4.6) skips them, and every such statement is logged.

-- ── Helpers ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION coreguard.fail(p_guard text, p_message text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = format('COREGUARD %s: %s', p_guard, p_message);
END $$;

-- Returns the maintenance reason, or NULL. Raises if the setting is used without authorisation.
CREATE OR REPLACE FUNCTION coreguard.maintenance_reason() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_temp AS $$
DECLARE r text := NULLIF(current_setting('bookone.ledger_maintenance', true), '');
BEGIN
  IF r IS NULL THEN RETURN NULL; END IF;
  IF NOT pg_has_role(session_user, 'coreguard_maintenance', 'MEMBER') THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = format('COREGUARD G04: login %s is not allowed to use ledger maintenance', session_user);
  END IF;
  IF r NOT IN ('archive_restore', 'coreguard_cleanup', 'coreguard_corruption') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = format('COREGUARD G04: unknown maintenance reason %L', r);
  END IF;
  IF r = 'coreguard_corruption' AND current_database() !~* '(^|[_-])(test|pilot|coreguard|ci|lab)([_-]|$)' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COREGUARD G04: corruption mode is only allowed on lab/test databases';
  END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION coreguard.is_iso_date(p text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p IS NULL OR p !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN false; END IF;
  RETURN to_char(to_date(p, 'YYYY-MM-DD'), 'YYYY-MM-DD') = p;
EXCEPTION WHEN others THEN
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION coreguard.is_finite_number(p numeric) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT p IS NOT NULL AND p <> 'NaN'::numeric $$;

CREATE OR REPLACE FUNCTION coreguard.period_lock_key(p_tenant uuid, p_period text) RETURNS bigint
LANGUAGE sql IMMUTABLE AS $$ SELECT hashtextextended('bookone.period:' || p_tenant || ':' || p_period, 0) $$;

-- Statement-level log of every maintenance write to a guarded table.
CREATE OR REPLACE FUNCTION coreguard.trg_log_maintenance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = coreguard, pg_temp AS $$
DECLARE r text := coreguard.maintenance_reason();
BEGIN
  IF r IS NOT NULL THEN
    INSERT INTO coreguard.bypass_log (reason, table_name, operation) VALUES (r, TG_TABLE_NAME, TG_OP);
  END IF;
  RETURN NULL;
END $$;

-- ── G01: every live journal entry balances exactly, has a debit and a credit line, and no invalid line ──
CREATE OR REPLACE FUNCTION coreguard.trg_g01_entry_balanced() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, coreguard, pg_temp AS $$
DECLARE
  v_entry uuid; v_voided timestamptz;
  v_net numeric; v_dr int; v_cr int; v_bad int;
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN RETURN NULL; END IF;
  -- IF, not CASE: PL/pgSQL resolves NEW/OLD fields in every CASE branch, and NEW is unassigned on DELETE.
  IF TG_TABLE_NAME = 'journal_lines' THEN
    IF TG_OP = 'DELETE' THEN v_entry := OLD.journal_entry_id; ELSE v_entry := NEW.journal_entry_id; END IF;
  ELSE
    v_entry := NEW.id;
  END IF;
  SELECT voided_at INTO v_voided FROM journal_entries WHERE id = v_entry;
  IF NOT FOUND OR v_voided IS NOT NULL THEN RETURN NULL; END IF;
  -- ELSE 0 and explicit counts: SUM ignores NULL, so an invalid side must be counted, not summed.
  SELECT COALESCE(SUM(CASE side WHEN 'debit' THEN amount WHEN 'credit' THEN -amount ELSE 0 END), 0),
         COUNT(*) FILTER (WHERE side = 'debit'),
         COUNT(*) FILTER (WHERE side = 'credit'),
         COUNT(*) FILTER (WHERE side IS NULL OR side NOT IN ('debit','credit')
                             OR NOT coreguard.is_finite_number(amount) OR amount <= 0)
    INTO v_net, v_dr, v_cr, v_bad
    FROM journal_lines
   WHERE journal_entry_id = v_entry AND voided_at IS NULL;
  IF v_net <> 0 OR v_dr = 0 OR v_cr = 0 OR v_bad > 0 THEN
    PERFORM coreguard.fail('G01', format(
      'journal entry %s does not balance (difference %s, %s debit lines, %s credit lines, %s invalid lines)',
      v_entry, v_net, v_dr, v_cr, v_bad));
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS cg_g01_lines ON journal_lines;
CREATE CONSTRAINT TRIGGER cg_g01_lines AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g01_entry_balanced();
DROP TRIGGER IF EXISTS cg_g01_entries ON journal_entries;
CREATE CONSTRAINT TRIGGER cg_g01_entries AFTER INSERT OR UPDATE ON journal_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g01_entry_balanced();

-- ── G02: line shape ──
CREATE OR REPLACE FUNCTION coreguard.trg_g02_line_shape() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.side IS NULL OR NEW.side NOT IN ('debit','credit') THEN
    PERFORM coreguard.fail('G02', format('invalid side %L', NEW.side));
  END IF;
  -- PostgreSQL numeric accepts NaN (also numeric(18,2)) and orders it above every number, so "> 0" alone is not enough.
  IF NOT coreguard.is_finite_number(NEW.amount) OR NEW.amount <= 0 THEN
    PERFORM coreguard.fail('G02', format('amount must be a finite number greater than zero (got %s)', NEW.amount));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cg_g02_lines ON journal_lines;
CREATE TRIGGER cg_g02_lines BEFORE INSERT ON journal_lines FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g02_line_shape();

-- ── G03: tenant, account and party consistency ──
CREATE OR REPLACE FUNCTION coreguard.trg_g03_line_refs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, coreguard, pg_temp AS $$
DECLARE e_tenant uuid; a accounts%ROWTYPE; p_tenant uuid; p_voided timestamptz;
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN RETURN NEW; END IF;
  SELECT tenant_id INTO e_tenant FROM journal_entries WHERE id = NEW.journal_entry_id;
  SELECT * INTO a FROM accounts WHERE id = NEW.account_id;
  IF e_tenant IS DISTINCT FROM NEW.tenant_id OR a.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    PERFORM coreguard.fail('G03', format('journal line references another company''s entry or account (line tenant %s)', NEW.tenant_id));
  END IF;
  IF a.is_group = '1' THEN
    PERFORM coreguard.fail('G03', format('account %s is a group account and cannot be posted to', a.code));
  END IF;
  IF a.is_active IS DISTINCT FROM '1' OR a.voided_at IS NOT NULL THEN
    PERFORM coreguard.fail('G03', format('account %s is archived and cannot be posted to', a.code));
  END IF;
  IF NEW.party_id IS NOT NULL THEN
    SELECT tenant_id, voided_at INTO p_tenant, p_voided FROM parties WHERE id = NEW.party_id;
    IF p_tenant IS DISTINCT FROM NEW.tenant_id OR p_voided IS NOT NULL THEN
      PERFORM coreguard.fail('G03', 'journal line references a party of another company or an archived party');
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cg_g03_lines ON journal_lines;
CREATE TRIGGER cg_g03_lines BEFORE INSERT ON journal_lines FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g03_line_refs();

CREATE OR REPLACE FUNCTION coreguard.trg_g03_entry_refs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, coreguard, pg_temp AS $$
DECLARE t_tenant uuid;
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN RETURN NEW; END IF;
  SELECT tenant_id INTO t_tenant FROM transactions WHERE id = NEW.transaction_id;
  IF t_tenant IS DISTINCT FROM NEW.tenant_id THEN
    PERFORM coreguard.fail('G03', 'journal entry references a transaction of another company');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cg_g03_entries ON journal_entries;
CREATE TRIGGER cg_g03_entries BEFORE INSERT ON journal_entries FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g03_entry_refs();

-- ── G04: posted ledger rows are immutable; corrections are reversals ──
CREATE OR REPLACE FUNCTION coreguard.trg_g04_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME = 'period_locks' THEN
    PERFORM coreguard.fail('G04', 'period locks cannot be deleted; reopen the period with coreguard.unlock_period');
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM coreguard.fail('G04', format('%s rows cannot be deleted; post a reversal instead', TG_TABLE_NAME));
  END IF;
  IF TG_TABLE_NAME = 'journal_lines' THEN
    IF (NEW.tenant_id, NEW.journal_entry_id, NEW.account_id, NEW.side, NEW.amount, NEW.party_id,
        NEW.brand_id, NEW.location_id, NEW.voided_at, NEW.created_at)
       IS DISTINCT FROM
       (OLD.tenant_id, OLD.journal_entry_id, OLD.account_id, OLD.side, OLD.amount, OLD.party_id,
        OLD.brand_id, OLD.location_id, OLD.voided_at, OLD.created_at) THEN
      PERFORM coreguard.fail('G04', format('journal line %s is posted; only its memo can change', OLD.id));
    END IF;
  ELSIF TG_TABLE_NAME = 'journal_entries' THEN
    IF (NEW.tenant_id, NEW.user_id, NEW.transaction_id, NEW.entry_date, NEW.is_balanced, NEW.brand_id,
        NEW.location_id, NEW.book_domain, NEW.voided_at, NEW.created_at)
       IS DISTINCT FROM
       (OLD.tenant_id, OLD.user_id, OLD.transaction_id, OLD.entry_date, OLD.is_balanced, OLD.brand_id,
        OLD.location_id, OLD.book_domain, OLD.voided_at, OLD.created_at) THEN
      PERFORM coreguard.fail('G04', format('journal entry %s is posted; only memo and notes can change', OLD.id));
    END IF;
  ELSIF TG_TABLE_NAME = 'transactions' THEN
    IF (NEW.tenant_id, NEW.user_id, NEW.accounting_type, NEW.direction, NEW.amount, NEW.currency,
        NEW.payment_account_id, NEW.transfer_source_account_id, NEW.reverses_transaction_id, NEW.date,
        NEW.brand_id, NEW.location_id, NEW.book_domain, NEW.voided_at, NEW.created_at,
        NEW.source_kind, NEW.source_id)
       IS DISTINCT FROM
       (OLD.tenant_id, OLD.user_id, OLD.accounting_type, OLD.direction, OLD.amount, OLD.currency,
        OLD.payment_account_id, OLD.transfer_source_account_id, OLD.reverses_transaction_id, OLD.date,
        OLD.brand_id, OLD.location_id, OLD.book_domain, OLD.voided_at, OLD.created_at,
        OLD.source_kind, OLD.source_id) THEN
      PERFORM coreguard.fail('G04', format('transaction %s is posted; its financial fields cannot change', OLD.id));
    END IF;
    IF OLD.reversed_by_transaction_id IS NOT NULL
       AND NEW.reversed_by_transaction_id IS DISTINCT FROM OLD.reversed_by_transaction_id THEN
      PERFORM coreguard.fail('G04', format('transaction %s is already reversed', OLD.id));
    END IF;
  ELSIF TG_TABLE_NAME = 'period_locks' THEN
    IF (NEW.tenant_id, NEW.user_id, NEW.period, NEW.locked_at, NEW.voided_at, NEW.created_at)
       IS DISTINCT FROM (OLD.tenant_id, OLD.user_id, OLD.period, OLD.locked_at, OLD.voided_at, OLD.created_at)
       OR (OLD.status = 'unlocked' AND NEW.status <> 'unlocked')
       OR NEW.status NOT IN ('locked', 'unlocked') THEN
      PERFORM coreguard.fail('G04', 'a period lock can only change from locked to unlocked; relock creates a new lock');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cg_g04_lines ON journal_lines;
CREATE TRIGGER cg_g04_lines BEFORE UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g04_immutable();
DROP TRIGGER IF EXISTS cg_g04_entries ON journal_entries;
CREATE TRIGGER cg_g04_entries BEFORE UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g04_immutable();
DROP TRIGGER IF EXISTS cg_g04_transactions ON transactions;
CREATE TRIGGER cg_g04_transactions BEFORE UPDATE OR DELETE ON transactions FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g04_immutable();
DROP TRIGGER IF EXISTS cg_g04_period_locks ON period_locks;
CREATE TRIGGER cg_g04_period_locks BEFORE UPDATE OR DELETE ON period_locks FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g04_immutable();

DROP TRIGGER IF EXISTS cg_log_lines ON journal_lines;
CREATE TRIGGER cg_log_lines AFTER INSERT OR UPDATE OR DELETE ON journal_lines FOR EACH STATEMENT EXECUTE FUNCTION coreguard.trg_log_maintenance();
DROP TRIGGER IF EXISTS cg_log_entries ON journal_entries;
CREATE TRIGGER cg_log_entries AFTER INSERT OR UPDATE OR DELETE ON journal_entries FOR EACH STATEMENT EXECUTE FUNCTION coreguard.trg_log_maintenance();
DROP TRIGGER IF EXISTS cg_log_transactions ON transactions;
CREATE TRIGGER cg_log_transactions AFTER INSERT OR UPDATE OR DELETE ON transactions FOR EACH STATEMENT EXECUTE FUNCTION coreguard.trg_log_maintenance();

-- ── G05: nothing dated in a locked period. Takes the SHARED tenant-period lock first (close takes it EXCLUSIVE). ──
CREATE OR REPLACE FUNCTION coreguard.trg_g05_period_lock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, coreguard, pg_temp AS $$
DECLARE v_date text;
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'journal_entries' THEN v_date := NEW.entry_date; ELSE v_date := NEW.movement_date; END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    PERFORM coreguard.fail('G05', format('ledger writes must run in READ COMMITTED (got %s)', current_setting('transaction_isolation')));
  END IF;
  PERFORM pg_advisory_xact_lock_shared(coreguard.period_lock_key(NEW.tenant_id, left(v_date, 7)));
  IF EXISTS (SELECT 1 FROM period_locks
              WHERE tenant_id = NEW.tenant_id AND period = left(v_date, 7)
                AND status = 'locked' AND voided_at IS NULL) THEN
    PERFORM coreguard.fail('G05', format('period %s is locked', left(v_date, 7)));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cg_g05_entries ON journal_entries;
CREATE TRIGGER cg_g05_entries BEFORE INSERT ON journal_entries FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g05_period_lock();
DROP TRIGGER IF EXISTS cg_g05_movements ON inventory_movements;
CREATE TRIGGER cg_g05_movements BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g05_period_lock();

-- ── G06: field validity (dates, flags, finite amounts) ──
CREATE OR REPLACE FUNCTION coreguard.trg_g06_fields() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'journal_entries' THEN
    IF NOT coreguard.is_iso_date(NEW.entry_date) THEN PERFORM coreguard.fail('G06', format('invalid entry date %L', NEW.entry_date)); END IF;
    IF NEW.is_balanced NOT IN ('0','1') THEN PERFORM coreguard.fail('G06', 'is_balanced must be 0 or 1'); END IF;
  ELSIF TG_TABLE_NAME = 'transactions' THEN
    IF NOT coreguard.is_iso_date(NEW.date) THEN PERFORM coreguard.fail('G06', format('invalid transaction date %L', NEW.date)); END IF;
    IF NOT coreguard.is_finite_number(NEW.amount) OR NEW.amount <= 0 THEN
      PERFORM coreguard.fail('G06', format('transaction amount must be a finite number greater than zero (got %s)', NEW.amount));
    END IF;
    IF NEW.is_already_settled NOT IN ('0','1') THEN PERFORM coreguard.fail('G06', 'is_already_settled must be 0 or 1'); END IF;
  ELSIF TG_TABLE_NAME = 'inventory_movements' THEN
    IF NOT coreguard.is_iso_date(NEW.movement_date) THEN PERFORM coreguard.fail('G06', format('invalid movement date %L', NEW.movement_date)); END IF;
    IF NOT coreguard.is_finite_number(NEW.quantity) OR (NEW.unit_cost IS NOT NULL AND NOT coreguard.is_finite_number(NEW.unit_cost)) THEN
      PERFORM coreguard.fail('G06', 'stock quantity and unit cost must be finite numbers');
    END IF;
  ELSIF TG_TABLE_NAME = 'settlement_allocations' THEN
    IF NOT coreguard.is_finite_number(NEW.allocated_amount) OR NEW.allocated_amount <= 0 THEN
      PERFORM coreguard.fail('G06', format('allocated amount must be a finite number greater than zero (got %s)', NEW.allocated_amount));
    END IF;
  ELSIF TG_TABLE_NAME = 'business_documents' THEN
    IF 'NaN'::numeric IN (NEW.subtotal, NEW.discount_total, NEW.tax_total, NEW.total, NEW.paid_amount,
                          NEW.balance_due, NEW.freight_amount, NEW.duty_amount, NEW.other_charges, NEW.vat_rate) THEN
      PERFORM coreguard.fail('G06', 'document amounts must be finite numbers');
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cg_g06_entries ON journal_entries;
CREATE TRIGGER cg_g06_entries BEFORE INSERT OR UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g06_fields();
DROP TRIGGER IF EXISTS cg_g06_transactions ON transactions;
CREATE TRIGGER cg_g06_transactions BEFORE INSERT OR UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g06_fields();
DROP TRIGGER IF EXISTS cg_g06_movements ON inventory_movements;
CREATE TRIGGER cg_g06_movements BEFORE INSERT OR UPDATE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g06_fields();
DROP TRIGGER IF EXISTS cg_g06_allocations ON settlement_allocations;
CREATE TRIGGER cg_g06_allocations BEFORE INSERT OR UPDATE ON settlement_allocations FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g06_fields();
DROP TRIGGER IF EXISTS cg_g06_documents ON business_documents;
CREATE TRIGGER cg_g06_documents BEFORE INSERT OR UPDATE ON business_documents FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g06_fields();

-- ── G07: every transaction has a journal entry by COMMIT (index cg_one_live_entry_per_tx makes it exactly one) ──
CREATE OR REPLACE FUNCTION coreguard.trg_g07_tx_has_journal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, coreguard, pg_temp AS $$
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM transactions WHERE id = NEW.id) THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE transaction_id = NEW.id AND voided_at IS NULL) THEN
    PERFORM coreguard.fail('G07', format('transaction %s was saved without a journal entry', NEW.id));
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS cg_g07_transactions ON transactions;
CREATE CONSTRAINT TRIGGER cg_g07_transactions AFTER INSERT ON transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g07_tx_has_journal();

-- ── G09: seal — lines only in the transaction that created their entry; entries only in the transaction that created their transaction ──
CREATE OR REPLACE FUNCTION coreguard.trg_g09_record_seal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = coreguard, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    INSERT INTO coreguard.entry_seal (journal_entry_id, tenant_id, created_xact) VALUES (NEW.id, NEW.tenant_id, pg_current_xact_id());
  ELSE
    INSERT INTO coreguard.tx_seal (transaction_id, tenant_id, created_xact) VALUES (NEW.id, NEW.tenant_id, pg_current_xact_id());
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS cg_g09_seal_entries ON journal_entries;
CREATE TRIGGER cg_g09_seal_entries AFTER INSERT ON journal_entries FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g09_record_seal();
DROP TRIGGER IF EXISTS cg_g09_seal_transactions ON transactions;
CREATE TRIGGER cg_g09_seal_transactions AFTER INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g09_record_seal();

CREATE OR REPLACE FUNCTION coreguard.trg_g09_check_seal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = coreguard, pg_temp AS $$
DECLARE x xid8;
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'journal_lines' THEN
    SELECT created_xact INTO x FROM coreguard.entry_seal WHERE journal_entry_id = NEW.journal_entry_id;
    IF x IS DISTINCT FROM pg_current_xact_id() THEN   -- no seal row (older entry) also counts as sealed
      PERFORM coreguard.fail('G09', format('journal entry %s is sealed; post a new entry or a reversal instead', NEW.journal_entry_id));
    END IF;
  ELSE
    SELECT created_xact INTO x FROM coreguard.tx_seal WHERE transaction_id = NEW.transaction_id;
    IF x IS DISTINCT FROM pg_current_xact_id() THEN
      PERFORM coreguard.fail('G09', format('transaction %s is sealed; it already has its journal', NEW.transaction_id));
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cg_g09_check_lines ON journal_lines;
CREATE TRIGGER cg_g09_check_lines BEFORE INSERT ON journal_lines FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g09_check_seal();
DROP TRIGGER IF EXISTS cg_g09_check_entries ON journal_entries;
CREATE TRIGGER cg_g09_check_entries BEFORE INSERT ON journal_entries FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g09_check_seal();
```

### A.063 `063_coreguard_functions.sql` — Step 2

```sql
-- 063_coreguard_functions.sql
-- Period close/reopen protocol and the findings bookkeeping used by the CoreGuard worker.

-- ── Canonical trial balance through the end of a period (used by close and by check CG-S03) ──
CREATE OR REPLACE FUNCTION coreguard.tb_through_period(p_tenant uuid, p_period text)
RETURNS TABLE (tb_hash text, tb_json jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH live AS (
    SELECT a.code,
           SUM(CASE WHEN jl.side = 'debit'  THEN (jl.amount * 100)::bigint ELSE 0 END) AS debit_cents,
           SUM(CASE WHEN jl.side = 'credit' THEN (jl.amount * 100)::bigint ELSE 0 END) AS credit_cents
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      JOIN transactions t     ON t.id = je.transaction_id
      JOIN accounts a         ON a.id = jl.account_id
     WHERE jl.tenant_id = p_tenant AND je.tenant_id = p_tenant AND t.tenant_id = p_tenant
       AND jl.voided_at IS NULL AND je.voided_at IS NULL AND t.voided_at IS NULL
       AND je.entry_date <= to_char(to_date(p_period || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day', 'YYYY-MM-DD')
     GROUP BY a.code
  )
  SELECT encode(sha256(convert_to(COALESCE(string_agg(code || '|' || debit_cents || '|' || credit_cents, E'\n' ORDER BY code), ''), 'UTF8')), 'hex'),
         COALESCE(jsonb_object_agg(code, jsonb_build_object('debit_cents', debit_cents, 'credit_cents', credit_cents)), '{}'::jsonb)
    FROM live
$$;

-- ── Close a period. The only way to create a period lock. ──
CREATE OR REPLACE FUNCTION coreguard.lock_period(p_tenant uuid, p_period text, p_user uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, coreguard, pg_temp AS $$
DECLARE v_lock uuid;
BEGIN
  IF current_setting('app.current_tenant_id', true) IS DISTINCT FROM p_tenant::text THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'COREGUARD G05: tenant context mismatch';
  END IF;
  -- In REPEATABLE READ the snapshot predates the lock wait, so the fingerprint would miss postings committed meanwhile.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE = '25001',
      MESSAGE = format('COREGUARD G05: period close/reopen must run in READ COMMITTED (got %s)', current_setting('transaction_isolation'));
  END IF;
  -- The protocol only works if postings take the shared lock (trigger cg_g05_entries).
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'cg_g05_entries' AND tgenabled <> 'D') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'COREGUARD G05: period-lock trigger missing or disabled; refusing to close';
  END IF;
  IF p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = format('COREGUARD G05: invalid period %L', p_period);
  END IF;
  PERFORM pg_advisory_xact_lock(coreguard.period_lock_key(p_tenant, p_period));  -- exclusive: waits for in-flight postings
  SELECT id INTO v_lock FROM period_locks
   WHERE tenant_id = p_tenant AND period = p_period AND status = 'locked' AND voided_at IS NULL;
  IF FOUND THEN RETURN v_lock; END IF;                                            -- already locked: idempotent
  INSERT INTO period_locks (tenant_id, user_id, period, status, locked_at, notes)
  VALUES (p_tenant, p_user, p_period, 'locked', clock_timestamp(), p_reason)
  RETURNING id INTO v_lock;
  INSERT INTO coreguard.period_fingerprints (lock_id, tenant_id, period, tb_hash, tb_json)
  SELECT v_lock, p_tenant, p_period, x.tb_hash, x.tb_json FROM coreguard.tb_through_period(p_tenant, p_period) x;
  RETURN v_lock;
END $$;

-- ── Reopen a period. The only way to unlock. ──
CREATE OR REPLACE FUNCTION coreguard.unlock_period(p_tenant uuid, p_period text, p_user uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, coreguard, pg_temp AS $$
DECLARE v_lock uuid;
BEGIN
  IF current_setting('app.current_tenant_id', true) IS DISTINCT FROM p_tenant::text THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'COREGUARD G05: tenant context mismatch';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE = '25001',
      MESSAGE = format('COREGUARD G05: period close/reopen must run in READ COMMITTED (got %s)', current_setting('transaction_isolation'));
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'COREGUARD G05: a reason is required to reopen a period';
  END IF;
  PERFORM pg_advisory_xact_lock(coreguard.period_lock_key(p_tenant, p_period));
  UPDATE period_locks SET status = 'unlocked', unlocked_at = clock_timestamp(),
         notes = concat_ws(E'\n', notes, format('Reopened by %s: %s', p_user, p_reason)), updated_at = now()
   WHERE tenant_id = p_tenant AND period = p_period AND status = 'locked' AND voided_at IS NULL
  RETURNING id INTO v_lock;
  IF v_lock IS NULL THEN RETURN; END IF;                                          -- not locked: idempotent
  UPDATE coreguard.period_fingerprints SET superseded_at = clock_timestamp() WHERE lock_id = v_lock;
END $$;

-- ── Findings bookkeeping: the ONLY code that creates, updates or resolves findings ──
-- p_rows: [{"fp": "...", "severity": "critical", "difference_cents": 123, "subject": {...}, "message": "...", "revision": 1}]
CREATE OR REPLACE FUNCTION coreguard.record_check_result(
  p_run uuid, p_tenant uuid, p_check text, p_outcome text, p_error text, p_rows jsonb
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  INSERT INTO coreguard.check_results (run_id, tenant_id, check_id, outcome, error, rows_found)
  VALUES (p_run, p_tenant, p_check, p_outcome, p_error, jsonb_array_length(COALESCE(p_rows, '[]')));
  IF p_outcome IN ('error', 'not_applicable') THEN
    RETURN;  -- a check that did not complete never creates, changes or resolves findings
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]')) LOOP
    INSERT INTO coreguard.findings (fingerprint, check_id, check_revision, tenant_id, severity, subject,
                                    difference_cents, message, first_seen_run, last_seen_run, last_checked_run)
    VALUES (r->>'fp', p_check, COALESCE((r->>'revision')::int, 1), p_tenant, r->>'severity', r->'subject',
            (r->>'difference_cents')::bigint, COALESCE(r->>'message', p_check), p_run, p_run, p_run)
    ON CONFLICT (fingerprint) WHERE status <> 'resolved' DO UPDATE
      SET last_seen_run = p_run, last_checked_run = p_run, last_seen_at = now(),
          occurrences = coreguard.findings.occurrences + 1,
          acknowledged_by = CASE WHEN coreguard.findings.difference_cents IS DISTINCT FROM EXCLUDED.difference_cents
                                 THEN NULL ELSE coreguard.findings.acknowledged_by END,
          acknowledged_at = CASE WHEN coreguard.findings.difference_cents IS DISTINCT FROM EXCLUDED.difference_cents
                                 THEN NULL ELSE coreguard.findings.acknowledged_at END,
          difference_cents = EXCLUDED.difference_cents;
  END LOOP;
  UPDATE coreguard.findings f SET status = 'resolved', resolved_run = p_run, resolved_at = now()
   WHERE f.tenant_id IS NOT DISTINCT FROM p_tenant AND f.check_id = p_check AND f.status <> 'resolved'
     AND f.fingerprint NOT IN (SELECT e->>'fp' FROM jsonb_array_elements(COALESCE(p_rows, '[]')) e);
END $$;

-- ── Company status: from findings and this run's check outcomes ONLY (acknowledgment is not an input) ──
CREATE OR REPLACE FUNCTION coreguard.tenant_status(p_tenant uuid, p_run uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM coreguard.findings WHERE tenant_id = p_tenant AND status = 'open'
                  AND severity IN ('critical','high'))                                          THEN 'red'
    WHEN EXISTS (SELECT 1 FROM coreguard.check_results WHERE run_id = p_run AND tenant_id = p_tenant
                  AND outcome = 'error')                                                        THEN 'check_failed'
    WHEN EXISTS (SELECT 1 FROM coreguard.findings WHERE tenant_id = p_tenant AND status = 'open')   THEN 'amber'
    WHEN EXISTS (SELECT 1 FROM coreguard.findings WHERE tenant_id = p_tenant AND status = 'waived') THEN 'known_gaps'
    ELSE 'green' END
$$;

GRANT EXECUTE ON FUNCTION coreguard.record_check_result(uuid, uuid, text, text, text, jsonb) TO coreguard_writer;
GRANT EXECUTE ON FUNCTION coreguard.tenant_status(uuid, uuid) TO coreguard_writer, coreguard_reader;
GRANT EXECUTE ON FUNCTION coreguard.tb_through_period(uuid, text) TO coreguard_reader;
```

### A.064 `064_coreguard_operations.sql` — Step 7 (PR 7a)

```sql
-- 064_coreguard_operations.sql  (Step 7, first PR: posting service foundations)
-- Operation keys bound to request contents, post-once rule for source documents, one stock movement per document line.
-- Requires columns: transactions.source_kind/source_id (Step 1), inventory_movements.source_line_id (Step 7).

-- ── Claim an operation key inside the business transaction ──
-- Returns NULL for a new operation (proceed), the stored result for an identical retry,
-- and raises for a missing key or a key reused with different contents.
CREATE OR REPLACE FUNCTION coreguard.claim_operation(p_tenant uuid, p_key text, p_hash text, p_kind text)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE r public.ledger_operations%ROWTYPE;
BEGIN
  IF p_key IS NULL OR length(p_key) < 16 OR length(p_key) > 80 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'COREGUARD: operation key required (16-80 characters)';
  END IF;
  INSERT INTO public.ledger_operations (tenant_id, operation_key, request_hash, kind)
  VALUES (p_tenant, p_key, p_hash, p_kind)
  ON CONFLICT (tenant_id, operation_key) DO NOTHING;     -- a concurrent claimant waits here until the first commits or aborts
  IF FOUND THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.ledger_operations WHERE tenant_id = p_tenant AND operation_key = p_key;
  IF r.request_hash <> p_hash OR r.kind <> p_kind THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = format('COREGUARD: operation key %s reused with different contents', p_key);
  END IF;
  RETURN r.result;
END $$;

-- ── A source document has at most one live, unreversed posting. Reversed originals leave the index, so reposting works. ──
CREATE UNIQUE INDEX IF NOT EXISTS cg_post_once_live ON transactions (tenant_id, source_kind, source_id)
  WHERE source_id IS NOT NULL AND reverses_transaction_id IS NULL
    AND reversed_by_transaction_id IS NULL AND voided_at IS NULL;

-- ── One stock movement per document line and movement type ──
CREATE UNIQUE INDEX IF NOT EXISTS cg_movement_once ON inventory_movements
  (tenant_id, reference_type, reference_id, source_line_id, movement_type)
  WHERE reference_id IS NOT NULL AND source_line_id IS NOT NULL;
```

### A.065 `065_coreguard_party_guard.sql` — Step 7 (PR 7i, last)

```sql
-- 065_coreguard_party_guard.sql  (Step 7, LAST PR: only after every writer posts through ledger-core with party_id)

-- ── G10: lines on customer/supplier/advance control accounts must name the party ──
CREATE OR REPLACE FUNCTION coreguard.trg_g10_party_on_control() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, coreguard, pg_temp AS $$
DECLARE v_role text; v_code text;
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN RETURN NEW; END IF;
  SELECT control_role, code INTO v_role, v_code FROM accounts WHERE id = NEW.account_id;
  IF v_role IN ('ar','ap','customer_advance','supplier_advance','staff_advance') AND NEW.party_id IS NULL THEN
    PERFORM coreguard.fail('G10', format('a line on control account %s (%s) must name the customer, supplier or staff member', v_code, v_role));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cg_g10_lines ON journal_lines;
CREATE TRIGGER cg_g10_lines BEFORE INSERT ON journal_lines FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g10_party_on_control();
```

### A.066 `066_coreguard_allocations.sql` — Step 8

```sql
-- 066_coreguard_allocations.sql  (Step 8: allocations and third-party payments)
-- Requires the Step 8 columns on settlement_allocations (guide Step 8).

-- ── Allocations are immutable; undo is a reversing allocation row ──
CREATE OR REPLACE FUNCTION coreguard.trg_g04_allocations() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM coreguard.fail('G04', 'allocations cannot be deleted; post a reversing allocation instead');
  END IF;
  IF (NEW.tenant_id, NEW.payment_transaction_id, NEW.invoice_transaction_id, NEW.allocated_amount, NEW.operation_key,
      NEW.payer_party_id, NEW.debtor_party_id, NEW.third_party, NEW.third_party_reason, NEW.third_party_reference,
      NEW.reverses_allocation_id, NEW.voided_at, NEW.created_at)
     IS DISTINCT FROM
     (OLD.tenant_id, OLD.payment_transaction_id, OLD.invoice_transaction_id, OLD.allocated_amount, OLD.operation_key,
      OLD.payer_party_id, OLD.debtor_party_id, OLD.third_party, OLD.third_party_reason, OLD.third_party_reference,
      OLD.reverses_allocation_id, OLD.voided_at, OLD.created_at) THEN
    PERFORM coreguard.fail('G04', format('allocation %s is posted and cannot change', OLD.id));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cg_g04_allocations ON settlement_allocations;
CREATE TRIGGER cg_g04_allocations BEFORE UPDATE OR DELETE ON settlement_allocations
  FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g04_allocations();

-- ── G11: third-party rules on every new allocation ──
CREATE OR REPLACE FUNCTION coreguard.trg_g11_third_party() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, coreguard, pg_temp AS $$
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.operation_key IS NULL THEN
    PERFORM coreguard.fail('G11', 'allocation needs an operation key');
  END IF;
  IF NEW.payer_party_id IS NULL OR NEW.debtor_party_id IS NULL THEN
    PERFORM coreguard.fail('G11', 'allocation must record the payer and the debtor');
  END IF;
  IF NEW.payer_party_id <> NEW.debtor_party_id AND NEW.third_party <> '1' THEN
    PERFORM coreguard.fail('G11', 'payer and debtor differ: record it as a third-party payment with a reason and reference');
  END IF;
  IF NEW.payer_party_id = NEW.debtor_party_id AND NEW.third_party = '1' THEN
    PERFORM coreguard.fail('G11', 'third-party flag set but payer and debtor are the same party');
  END IF;
  IF NEW.third_party = '1' AND (
       NEW.third_party_reason IS NULL
    OR NEW.third_party_reason NOT IN ('parent_company','group_company','director_or_owner','insurer','family_member','agent_or_broker','other')
    OR coalesce(trim(NEW.third_party_reference), '') = ''
    OR (NEW.third_party_reason = 'other' AND coalesce(trim(NEW.third_party_note), '') = '')) THEN
    PERFORM coreguard.fail('G11', 'third-party payment needs a valid reason, a reference, and a note when the reason is other');
  END IF;
  IF EXISTS (SELECT 1 FROM parties WHERE id IN (NEW.payer_party_id, NEW.debtor_party_id)
              AND (tenant_id <> NEW.tenant_id OR voided_at IS NOT NULL)) THEN
    PERFORM coreguard.fail('G11', 'allocation references a party of another company or an archived party');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cg_g11_allocations ON settlement_allocations;
CREATE TRIGGER cg_g11_allocations BEFORE INSERT ON settlement_allocations
  FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g11_third_party();

CREATE UNIQUE INDEX IF NOT EXISTS cg_allocation_once ON settlement_allocations
  (tenant_id, operation_key, payment_transaction_id, invoice_transaction_id) WHERE voided_at IS NULL;
```

### A.067 `067_coreguard_hash_chain.sql` — Step 11

```sql
-- 067_coreguard_hash_chain.sql  (Step 11: tamper evidence)
-- Each committed journal entry gets a per-company chained SHA-256. Rows written with triggers switched off
-- have no chain row, so check CG-L13 reports them.

CREATE TABLE IF NOT EXISTS coreguard.ledger_chain (
  tenant_id        uuid   NOT NULL,
  seq              bigint NOT NULL,
  journal_entry_id uuid   NOT NULL UNIQUE,
  entry_hash       text   NOT NULL,
  prev_chain_hash  text   NOT NULL,
  chain_hash       text   NOT NULL,
  genesis_reason   text,
  created_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, seq)
);
GRANT SELECT ON coreguard.ledger_chain TO coreguard_reader;

-- Canonical text of one entry: header fields, then lines ordered by account, side, amount, id.
CREATE OR REPLACE FUNCTION coreguard.entry_canonical(p_entry uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT je.tenant_id || '|' || je.id || '|' || je.transaction_id || '|' || je.entry_date || '|' ||
         COALESCE((SELECT string_agg(jl.account_id || ':' || jl.side || ':' || (jl.amount * 100)::bigint || ':' || COALESCE(jl.party_id::text, ''),
                                     ';' ORDER BY jl.account_id, jl.side, jl.amount, jl.id)
                     FROM journal_lines jl WHERE jl.journal_entry_id = je.id), '')
    FROM journal_entries je WHERE je.id = p_entry
$$;

CREATE OR REPLACE FUNCTION coreguard.trg_g08_chain() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, coreguard, pg_temp AS $$
DECLARE v_prev text; v_seq bigint; v_hash text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE id = NEW.id) THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('coreguard.chain:' || NEW.tenant_id, 0));
  SELECT chain_hash, seq INTO v_prev, v_seq FROM coreguard.ledger_chain
   WHERE tenant_id = NEW.tenant_id ORDER BY seq DESC LIMIT 1;
  v_hash := encode(sha256(convert_to(coreguard.entry_canonical(NEW.id), 'UTF8')), 'hex');
  INSERT INTO coreguard.ledger_chain (tenant_id, seq, journal_entry_id, entry_hash, prev_chain_hash, chain_hash, genesis_reason)
  VALUES (NEW.tenant_id, COALESCE(v_seq, 0) + 1, NEW.id, v_hash, COALESCE(v_prev, repeat('0', 64)),
          encode(sha256(convert_to(COALESCE(v_prev, repeat('0', 64)) || v_hash, 'UTF8')), 'hex'),
          CASE WHEN v_prev IS NULL THEN 'first_entry' END);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS cg_g08_chain ON journal_entries;
CREATE CONSTRAINT TRIGGER cg_g08_chain AFTER INSERT ON journal_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g08_chain();

-- Verification used by check CG-L13: returns entries whose hash or link no longer matches, and live entries with no chain row.
CREATE OR REPLACE FUNCTION coreguard.verify_chain(p_tenant uuid)
RETURNS TABLE (journal_entry_id uuid, problem text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, coreguard, pg_temp AS $$
  WITH c AS (
    SELECT lc.*, lag(lc.chain_hash) OVER (ORDER BY lc.seq) AS expected_prev
      FROM coreguard.ledger_chain lc WHERE lc.tenant_id = p_tenant
  )
  SELECT c.journal_entry_id, 'entry changed after commit'
    FROM c WHERE c.entry_hash <> encode(sha256(convert_to(coreguard.entry_canonical(c.journal_entry_id), 'UTF8')), 'hex')
  UNION ALL
  SELECT c.journal_entry_id, 'chain link broken'
    FROM c WHERE c.prev_chain_hash <> COALESCE(c.expected_prev, repeat('0', 64))
              OR c.chain_hash <> encode(sha256(convert_to(c.prev_chain_hash || c.entry_hash, 'UTF8')), 'hex')
  UNION ALL
  SELECT je.id, 'entry missing from chain (written with triggers off?)'
    FROM journal_entries je
   WHERE je.tenant_id = p_tenant
     AND NOT EXISTS (SELECT 1 FROM coreguard.ledger_chain lc WHERE lc.journal_entry_id = je.id)
$$;
GRANT EXECUTE ON FUNCTION coreguard.verify_chain(uuid) TO coreguard_reader;

-- One-off: chain entries that existed before this migration (run once per company after deploying Step 11).
CREATE OR REPLACE FUNCTION coreguard.backfill_chain(p_tenant uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, coreguard, pg_temp AS $$
DECLARE e record; v_prev text; v_seq bigint; v_hash text; n int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('coreguard.chain:' || p_tenant, 0));
  FOR e IN SELECT je.id FROM journal_entries je
            WHERE je.tenant_id = p_tenant
              AND NOT EXISTS (SELECT 1 FROM coreguard.ledger_chain lc WHERE lc.journal_entry_id = je.id)
            ORDER BY je.created_at, je.id LOOP
    SELECT chain_hash, seq INTO v_prev, v_seq FROM coreguard.ledger_chain WHERE tenant_id = p_tenant ORDER BY seq DESC LIMIT 1;
    v_hash := encode(sha256(convert_to(coreguard.entry_canonical(e.id), 'UTF8')), 'hex');
    INSERT INTO coreguard.ledger_chain (tenant_id, seq, journal_entry_id, entry_hash, prev_chain_hash, chain_hash, genesis_reason)
    VALUES (p_tenant, COALESCE(v_seq, 0) + 1, e.id, v_hash, COALESCE(v_prev, repeat('0', 64)),
            encode(sha256(convert_to(COALESCE(v_prev, repeat('0', 64)) || v_hash, 'UTF8')), 'hex'), 'chain_introduced');
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
```

---

## Appendix B — Test record

Environment: PostgreSQL 16, a minimal copy of BookOne's tables with the real column names at `9bf3468` (plus the columns this guide adds), migrations `060`–`067` from Appendix A. The tests ran as a **non-superuser** login (`app_user`) unless noted; maintenance tests used a separate login in `coreguard_maintenance`. C1 and C2 used **separate connections** running at the same time. These are not tests of BookOne's application code: Step 2 ports them into `packages/coreguard/test/` and runs them in CI against the real migrations.

- Migrations: MIGRATE: 060-067 applied twice, errors=0
- Part 1 guards: `SUMMARY bookone_coreguard_lab: 49 passed, 0 failed`
- Part 2 flows: `SUMMARY flows bookone_coreguard_lab: 30 passed, 0 failed`

- Also verified: the Step 2 preflight query and the fingerprint backfill (a lock inserted without a fingerprint got one; running the backfill again added nothing); corruption mode refused on a database named `bookone` and allowed on the lab database; with CONNECT revoked from PUBLIC, the lab login can't connect to the main database, the monitor can't connect to the lab database, and the app login can't connect to the lab database; a login with only `USAGE` on schema `coreguard` (no table rights there) can post, close a month and claim an operation key, and is refused the maintenance bypass.


### Part 1 — guards (49)

| Result | Case | Observed |
|---|---|---|
| | **G01 balanced entries** | |
| PASS | G01 balanced entry accepted |  |
| PASS | G01 unbalanced (100 vs 99.99) refused | COREGUARD G01: journal entry c0000000-0000-0000-0000-000000000002 does not balance (differ |
| PASS | G01 header without lines refused | COREGUARD G01: journal entry c0000000-0000-0000-0000-000000000003 does not balance (differ |
| PASS | G01 alone: balanced pair + 'DEBIT' line refused | COREGUARD G01: journal entry c0000000-0000-0000-0000-000000000004 does not balance (differ |
| PASS | G01 alone: NaN pair refused | COREGUARD G01: journal entry c0000000-0000-0000-0000-000000000005 does not balance (differ |
| | **G02 line shape** | |
| PASS | G02 invalid side refused | COREGUARD G02: invalid side 'Debit' |
| PASS | G02 NaN refused | COREGUARD G02: amount must be a finite number greater than zero (got NaN) |
| PASS | G02 zero refused | COREGUARD G02: amount must be a finite number greater than zero (got 0.00) |
| PASS | G02 negative refused | COREGUARD G02: amount must be a finite number greater than zero (got -5.00) |
| | **G03 references** | |
| PASS | G03 other company's account refused | COREGUARD G03: journal line references another company's entry or account (line tenant 111 |
| PASS | G03 group account refused | COREGUARD G03: account 1000 is a group account and cannot be posted to |
| PASS | G03 archived account refused | COREGUARD G03: account 5999 is archived and cannot be posted to |
| PASS | G03 other company's party refused | COREGUARD G03: journal line references a party of another company or an archived party |
| PASS | G03 entry on other company's transaction refused | COREGUARD G03: journal entry references a transaction of another company |
| | **G04 immutability** | |
| PASS | G04 change line amount refused | COREGUARD G04: journal line fd308d6d-0257-4f9c-bb7d-2b3c6b57ae70 is posted; only its memo |
| PASS | G04 change line party refused | COREGUARD G04: journal line fd308d6d-0257-4f9c-bb7d-2b3c6b57ae70 is posted; only its memo |
| PASS | G04 change line memo allowed |  |
| PASS | G04 delete line refused | COREGUARD G04: journal_lines rows cannot be deleted; post a reversal instead |
| PASS | G04 change entry date refused | COREGUARD G04: journal entry c0000000-0000-0000-0000-000000000001 is posted; only memo and |
| PASS | G04 change entry memo allowed |  |
| PASS | G04 change transaction amount refused | COREGUARD G04: transaction b0000000-0000-0000-0000-000000000001 is posted; its financial f |
| PASS | G04 set reversed_by once allowed |  |
| PASS | G04 change reversed_by again refused | COREGUARD G04: transaction b0000000-0000-0000-0000-000000000001 is already reversed |
| PASS | G04 void a journal entry refused | COREGUARD G04: journal entry c0000000-0000-0000-0000-000000000001 is posted; only memo and |
| | **G05 period lock and close protocol** | |
| PASS | close Jan (READ COMMITTED) ok |  |
| PASS | close wrong tenant context refused | COREGUARD G05: tenant context mismatch |
| PASS | close in REPEATABLE READ refused | COREGUARD G05: period close/reopen must run in READ COMMITTED (got repeatable read) |
| PASS | post into locked Jan refused | COREGUARD G05: period 2026-01 is locked |
| PASS | stock movement in locked Jan refused | COREGUARD G05: period 2026-01 is locked |
| PASS | posting in REPEATABLE READ refused | COREGUARD G05: ledger writes must run in READ COMMITTED (got repeatable read) |
| PASS | delete a period lock refused | COREGUARD G04: period locks cannot be deleted; reopen the period with coreguard.unlock_per |
| PASS | insert a second active lock for Jan refused | duplicate key value violates unique constraint "cg_period_locks_active_uidx" |
| PASS | reopen Jan without reason refused | COREGUARD G05: a reason is required to reopen a period |
| PASS | reopen Jan with reason ok |  |
| PASS | relock by flipping status refused | COREGUARD G04: a period lock can only change from locked to unlocked; relock creates a new |
| PASS | relock via lock_period ok |  |
| PASS | fingerprints after reopen+relock: 1 superseded, 1 active |  |
| PASS | close refused when G05 trigger disabled | COREGUARD G05: period-lock trigger missing or disabled; refusing to close |
| | **G06 field validity** | |
| PASS | invalid date 2026-02-30 refused | COREGUARD G06: invalid transaction date '2026-02-30' |
| PASS | transaction amount NaN refused | COREGUARD G06: transaction amount must be a finite number greater than zero (got NaN) |
| PASS | document amount NaN refused | COREGUARD G06: document amounts must be finite numbers |
| | **G07 / G09 completeness and seal** | |
| PASS | transaction without journal refused | COREGUARD G07: transaction 18b23d24-a14f-4b2e-acf0-11b97c5e2004 was saved without a journa |
| PASS | two journal headers for one transaction refused | duplicate key value violates unique constraint "cg_one_live_entry_per_tx" |
| PASS | append balanced pair to posted entry refused | COREGUARD G09: journal entry c0000000-0000-0000-0000-000000000001 is sealed; post a new en |
| PASS | header and lines in separate commits refused | COREGUARD G01: journal entry c0000000-0000-0000-0000-000000000032 does not balance (differ |
| | **maintenance authorisation** | |
| PASS | app login using maintenance refused | COREGUARD G04: login app_user is not allowed to use ledger maintenance |
| PASS | maintenance login: unknown reason refused | COREGUARD G04: unknown maintenance reason 'hack' |
| PASS | maintenance login: cleanup allowed |  |
| PASS | bypass_log recorded the maintenance statement |  |

### Part 2 — flows (30)

| Result | Case | Observed |
|---|---|---|
| | **C1 posting in flight while April is closed (two connections)** | |
| PASS | C1 close waited 2.05s; fingerprint 4000 credit 109900 = ledger 109900 |  |
| | **C2/C3 operation keys (two connections)** | |
| PASS | C2 identical retry from two connections: 1 receipt, second returned the first result |  |
| PASS | C3 same key, changed contents refused | COREGUARD: operation key op-2026-receipt-000001 reused with different contents |
| PASS | C3 missing/short key refused | COREGUARD: operation key required (16-80 characters) |
| | **C4 post -> reverse -> repost (cg_post_once_live)** | |
| PASS | post document |  |
| PASS | second live post refused | duplicate key value violates unique constraint "cg_post_once_live" |
| PASS | reverse (reversal row + link, one transaction) |  |
| PASS | repost after reversal ok |  |
| PASS | second live repost refused | duplicate key value violates unique constraint "cg_post_once_live" |
| | **G10 party on control lines** | |
| PASS | AR line without party refused | COREGUARD G10: a line on control account 1300 (ar) must name the customer, supplier or sta |
| | **G11 allocations and third-party payments** | |
| PASS | same-party allocation ok |  |
| PASS | same payment+invoice, new operation ok (D10) |  |
| PASS | same operation key twice refused | duplicate key value violates unique constraint "cg_allocation_once" |
| PASS | payer != debtor without flag refused | COREGUARD G11: payer and debtor differ: record it as a third-party payment with a reason a |
| PASS | third-party without reference refused | COREGUARD G11: third-party payment needs a valid reason, a reference, and a note when the |
| PASS | third-party 'other' without note refused | COREGUARD G11: third-party payment needs a valid reason, a reference, and a note when the |
| PASS | third-party with reason+reference ok |  |
| PASS | allocation without operation key refused | COREGUARD G11: allocation needs an operation key |
| PASS | change allocation amount refused | COREGUARD G04: allocation a791fd0d-d9c4-4109-92e2-720e47528aa4 is posted and cannot change |
| PASS | delete allocation refused | COREGUARD G04: allocations cannot be deleted; post a reversing allocation instead |
| | **G08 hash chain** | |
| PASS | chain verifies clean after backfill | 0 |
| PASS | new posting chained automatically |  |
| PASS | chain still clean | 0 |
| PASS | superuser edit with triggers off is detected | entry changed after commit |
| PASS | entry written with triggers off is detected | entry changed after commit |
| | **A5 findings: acknowledge, timeout, recheck** | |
| PASS | run 1: red | red |
| PASS | after acknowledge: still red | red |
| PASS | after timeout: finding open, ack kept | open/true |
| PASS | after timeout: still red | red |
| PASS | recheck clean: resolved, green | resolved/green |

