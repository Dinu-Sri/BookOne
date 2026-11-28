# CHG-20261128-coreguard-step-1 — CoreGuard Step 1: make the existing writers guard-ready

Status: merged (PR Dinu-Sri/BookOne#57, 69690ad); all Step 1 "Done when" items met.

- Author/agent and date: Claude Code (Opus 5.5), 2026-11-28.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.35.2 → **2.35.3**; base `a2bb4fc`; branch `coreguard/step-1-writers`; one PR per step (guide §1.1).
- QA repository revision and companion PR/change ID: none. Guide §6.11 has no business rule for Step 1 (the first, BR-6, comes before Step 2).
- Intended before/after behaviour with a concrete example:
  - Atomicity. Before: applying a customer advance to an invoice posted the journal in its own transaction, then wrote the allocation, advance, invoice balance and settlement allocation as separate statements. If the advance's version check failed, the action returned "This advance changed…" but the LKR 5,000.00 journal stayed posted. After: the whole action is one transaction, and the version check throws, so the journal rolls back too.
  - Exact cents. Before: `postBalancedJournal` accepted lines of Dr 100.004 / Cr 100.00 (|difference| < 0.005) and the database rounded each line on its own. After: every line must be an exact 2-decimal amount, and Σdebits === Σcredits in integer cents, with no tolerance. That entry is refused before anything is written.
- Existing behaviour that must remain correct: every posting that balanced to the cent still posts with the same accounts, sides and amounts; reversals, period-lock checks, idempotency keys, tenant isolation and audit rows are unchanged; stock quantities and cost layers are unchanged.
- Actual changed paths/symbols/routes: see "Writers" and "Other changes" below.
- Business rule/profile/scenario IDs: none new.
- Accounting, stock/rental, tenant/access and customer-data effects: no change to correct postings. Partial writes are no longer possible in the wrapped actions. A posting with a sub-cent line amount (only reachable through float arithmetic) is now refused instead of being silently rounded per line.
- Migrations, schema/history compatibility and recovery implications: three nullable columns, added by `push-additive` on startup: `journal_lines.party_id` (FK `parties.id`), `transactions.source_kind` varchar(40), `transactions.source_id` uuid. No backfill, no SQL migration (triggers arrive in Step 2).
- Dependencies, settings/flags, deployment and external-service changes: `packages/db` gets a `test` script and a `vitest` dev dependency (same version as the other packages; lockfile updated).
- Independent diff/impact review and uncertainties: listed under "Left for later steps" below.
- Codebase Memory MCP: not available in this session, so discovery used `grep` and a brace-depth scan of every insert site (method below).

## Step 1 item 1 — every writer (guide grep plus raw SQL; nothing outside these files)

Method: the guide's grep (`insert(transactions|journalEntries|journalLines|inventoryMovements|inventoryCostLayer*|settlementAllocations)`) over `apps packages scripts` excluding tests, plus a case-insensitive grep for raw `INSERT INTO` these tables (none found). For each hit, a brace-depth scan found the enclosing `db().transaction(` / `withTenantContext(`; for helper functions, the same scan ran on every caller.

**Why `db()` calls inside a transaction callback were only atomic by accident:** inside `withTenantContext`, `db()` is the tenant's reserved connection, and `db().transaction` sends `BEGIN` on it, so a `db()` call in the callback ran inside the transaction. Outside a tenant scope it used another pool connection. Worse, a nested `db().transaction` (for example `postBalancedJournal` called from inside a transaction) sent a second `BEGIN` on the same connection, and its `COMMIT` ended the outer transaction early. **Fix (`packages/db/src/ambient-transaction.ts`, used by `db()`):** inside `db().transaction(cb)`, every `db()` returns that transaction (AsyncLocalStorage), and a nested `db().transaction` becomes a savepoint. A new tenant scope (`runWithTenantDb`) starts with no ambient transaction. This makes every "already atomic" row below atomic by construction, not by connection reuse.

| Writer (file → action) | Rows written | Result |
| --- | --- | --- |
| `commercial-docs.ts` → `createCommercialDocumentWithUser` (incl. helper `adjustStock`, cost layers via `consumeCostLayers`/`receiveCostLayer`) | transactions, journal entry, lines, inventory movements, cost layers, settlement allocations | already atomic (one `db().transaction`) |
| `commercial-docs.ts` → `approvePurchaseDocument` (incl. `adjustStock`, `receiveCostLayer`) | transactions, journal entry, lines, movements, cost layers | already atomic |
| `documents.ts` → `createDocument` | transactions, journal entry, lines | already atomic |
| `documents.ts` → `allocateDocumentPayment`, `payVendorBills` (helper `allocateDocumentPaymentBody`, batch `allocatePaymentBatch`) | payment transaction, journal, lines, settlement allocation | already atomic (helper takes `tx`; batch runs inside one transaction in tenant scope) |
| `inventory.ts` → `createStockDocFromForm` | transactions, journal entry, lines, movements, cost layers | already atomic |
| `inventory.ts` → `createStockTransfer` | movements, cost layers | already atomic |
| `inventory.ts` → `createProductFromForm` (opening stock) | product, stock level, cost layer, movement, opening transaction, journal entry, lines | **wrapped** (was separate statements); transaction amount is now the journal's exact total, and lines are exact strings |
| `inventory-settings.ts` → `saveInventorySettingsFromForm` (FIFO `seedAllProductLots`) | settings, cost layers | **wrapped** |
| `record-entry.ts` → `recordEntry`, `createReversingEntry` | transactions, journal entry, lines, reversal link | already atomic |
| `entity-lifecycle.ts` → `incorporateSoleToCompany` (the guide's known case) | new company chart/profile/brand/location, opening transaction, journal entry, lines, audit | **wrapped** (the new-tenant seeding block is one transaction); exact cents for the balances and the equity plug; lines in one multi-row insert |
| `rental-money.ts` → `collectRentalDeposit`, `refundRentalDeposit` (helper `postBalanced`) | transactions, journal entry, lines | already atomic |
| `rental-money.ts` → `invoiceHireCharges` | charges invoice (via `createCommercialDocument`) + deposit applied to it | **wrapped**: was two transactions; now one, and a failed invoice throws instead of returning |
| `rental-bookings.ts` → `dispatchRentalLine` | stock transfer (movements), booking line, serials, audit | **wrapped**: the transfer used to commit before the serial check, which could still refuse |
| `rental-bookings.ts` → `returnRentalLine` (helper `consumeAtLocation` for missing stock) | stock transfers, missing write-off movement, line, serials, photos, audit | **wrapped** |
| `rental-bookings.ts` → `releaseFleetBay` | stock transfer, audit | **wrapped** |
| `advances.ts` → `issuePartyAdvance` | journal (via `postBalancedJournal`), advance row, audit link | **wrapped** |
| `advances.ts` → `applyPartyAdvance` | journal, advance allocation, advance, invoice balance, settlement allocation | **wrapped**; stale-version check now throws (rolls back) instead of returning after the journal was posted |
| `opening-balances.ts` → `postOpeningBalances` | journal, run, run lines, audit | **wrapped** |
| `apps/web/src/lib/post-balanced-journal.ts` → `postBalancedJournal` | transaction, journal entry, lines, audit | already atomic; exact cents; lines now one multi-row insert (§4.2) |
| `apps/web/src/lib/commerce-sample-catalog.ts` → `seedSampleCatalog`, called by `commerce.ts` → `seedSampleCatalogFromForm` | products, stock levels, cost layers, movements | **wrapped** at the caller |
| `packages/accounting/src/engine/document-posting.ts` | none (pure line builder) | exact-cents balance check (item 2) |
| `scripts/coreguard/{ledger,seed}.ts` | pilot fixtures | allowlisted for the pilot (CI-6/CI-7 allow `scripts/coreguard/**`); unchanged |

## Step 1 item 2 — exact cents, no tolerance

- New `packages/accounting/src/money.ts`: `toCents(string | number): bigint` (rejects NaN, ±Infinity, exponents, junk and a third significant decimal; trailing zeros such as `"12.3400"` from numeric(18,4) columns are accepted because their value has 2 decimals), `centsToString(bigint)`, `centsToNumber`, `sideTotalsCents`, `assertLinesBalanceExactly`. Exported from `@bookone/accounting`.
- Balance checks rewritten to Σdebits === Σcredits in bigint cents: `post-balanced-journal.ts` (removed `roundMoney` and `>= 0.005`), `document-posting.ts → assertBalanced` and `sumSides` (removed `round2` from the check), `journal-generator.ts → assertBalanced` (removed `> 0.0001`), `entity-lifecycle.ts` (removed `>= 0.005` and float sums), `packages/accounting/src/advances.ts → linesBalance` (removed `< 0.005`), `packages/accounting/src/opening-balances.ts → previewOpeningBalances` (removed `< 0.005`).
- Not changed (they aren't debit/credit balance checks): `0.005` thresholds for document status (paid/partial), credit limit, discount caps, payment-over-balance epsilon, statement display filters. They will be reviewed when those amounts move to ledger-core (Step 7).
- Done-when check: `grep -rn "0\.005" apps/web/src/lib/post-balanced-journal.ts packages/accounting/src/engine` → **no output** (exit 1).

## Step 1 item 3 — UPDATE/DELETE of ledger tables

grep for `update(`/`delete(` on `transactions`, `journalEntries`, `journalLines`, `periodLocks`, `settlementAllocations`, plus raw `UPDATE`/`DELETE FROM` SQL:
- `record-entry.ts → createReversingEntry`: sets `reversed_by_transaction_id` (and `updated_at`) once, from NULL — allowed.
- `scripts/coreguard/ledger.ts`: sets `receipt_ref` — allowed (descriptive field).
- `scripts/coreguard/seed.ts`: deletes the pilot's own disposable seed rows (`settlement_allocations`, `journal_lines`, `journal_entries`, `transactions`) in its cleanup. Not app code; after Step 2 these deletes need the maintenance bypass (allowed for `scripts/coreguard/**` by CI-7). Flagged for Step 2.
- No app code updates or deletes these rows otherwise. `reconciliation.ts` **inserts** into `period_locks`; Step 2 moves period close to `coreguard.lock_period` (D5, CI-9).

## Step 1 items 4 and 5

- Drizzle schema: `journal_lines.partyId` = `uuid('party_id').references(() => parties.id)` (nullable); `transactions.sourceKind` = `varchar('source_kind', { length: 40 })`; `transactions.sourceId` = `uuid('source_id')`.
- No insert sets `created_at` on `journal_entries` or `journal_lines` (scan of 25 lines after every insert, plus raw SQL grep: none).

## Other changes

- `packages/db/src/db.ts`: `db()` returns the ambient transaction; `runWithTenantDb` clears it for a new tenant connection.
- `packages/db/package.json`: `test` script and `vitest` dev dependency; `pnpm-lock.yaml`.
- `audit_log.new_values.amount` written by `postBalancedJournal` is now the exact string (`"100.00"`), not a number.

## Left for later steps (not changed here)

- Zero-amount lines: G02 (Step 2) refuses `amount <= 0` lines. Builders were not audited for zero lines in this step; Step 2's guard tests will show any.
- `incorporateSoleToCompany`: creating the company tenant (pool transaction) and seeding its books (new tenant connection) are still two transactions because they run on different tenant connections. The ledger part is atomic.
- `syncFifoMasterCost` swallows its own errors; inside a transaction a failed statement would abort it. Already true before this change (same connection), not new.

## Checks executed

| Check | Result |
| --- | --- |
| `pnpm --filter @bookone/db test` (new `test/ambient-transaction.test.ts`) | 5/5 pass |
| Red evidence: the same tests with `db()` as before (no ambient transaction) | 4/5 **fail** (inside-callback, nested savepoint, rollback-after-nested, new scope) |
| `pnpm --filter @bookone/accounting test` (incl. new `test/money.test.ts`, 10 tests) | 32 files / 318 tests pass |
| Red evidence for money: `test/money.test.ts` before `src/money.ts` existed | fails (module missing); the sub-cent case (Dr 100.004 / Cr 100) was accepted by the removed `>= 0.005` check |
| `pnpm test` (turbo, all packages) | 6/7 tasks pass; `@bookone/auth` had 2 failures, both at ~5.5 s, when run in parallel (`no-browser-popups`, `ui-02-lint`: 5 s timeout under load) |
| `pnpm --filter @bookone/auth test` alone | 38 files pass, 2 skipped; 247 tests pass, 5 skipped |
| `tsc --noEmit` for `@bookone/db`, `@bookone/accounting`, `apps/web` (the repo's `lint` is `tsc --noEmit`) | clean |
| `grep -rn "0\.005" apps/web/src/lib/post-balanced-journal.ts packages/accounting/src/engine` | no output |
| `pnpm coreguard:pilot` and the Playwright lane | not runnable locally (no PostgreSQL or Docker on this machine). Run in "Docker web image" by `workflow_dispatch` on the PR branch; result recorded in the PR |

- Failed/skipped/flaky/blocked/not-run checks and reasons: the 2 auth timeouts are load-dependent and pass alone. Pilot/Playwright are pending CI. No staging browser check: no UI change; staging gets the image after merge.
- Created staging records/cleanup, if any: none.
- Documentation updated: this CHG, TASK_LOG, PROJECT_STATUS.
- Next exact action and responsible role: agent — after this PR merges and the pilot/Playwright lane is green, Step 2 (database guards). Owner action **B4** (run `scripts/coreguard/create-db-logins.sql` on staging, maintenance login) is needed at Step 2.

## Step 1 "Done when" (guide §5)

| Item | Result |
| --- | --- |
| The CHG lists every writer from item 1 with "wrapped" or "already atomic" | Done (table above) |
| `pnpm test`, `pnpm coreguard:pilot` and the Playwright lane pass | Done. `pnpm test` pass (auth timeouts pass alone). Pilot + Playwright: "Docker web image" run 46133859270 on the branch (commit 2762613) and run 46140527409 on master after merge (69690ad): all jobs success, including "AgentBridge CoreGuard" (Playwright lane + `pnpm coreguard:pilot`) |
| `grep -rn "0\.005" apps/web/src/lib/post-balanced-journal.ts packages/accounting/src/engine` returns nothing | Done |

## CoreGuard impact (required when the diff touches the financial surface)
- Financial surface files touched: `packages/accounting/**` (money.ts, advances.ts, opening-balances.ts, engine/document-posting.ts, engine/journal-generator.ts, index.ts), `apps/web/src/lib/post-balanced-journal.ts`, `packages/db/src/schema/{journal-lines,transactions}.ts`, `apps/web/src/app/actions/{advances,commerce,entity-lifecycle,inventory,opening-balances,rental-bookings,rental-money}.ts`. Also `packages/db/src/db.ts` (not on the list, but it is how every writer reaches the database).
- Behaviour before → after (one example in LKR): Dr 100.004 / Cr 100.00 was accepted and stored per line by numeric rounding; now refused. Applying a LKR 5,000.00 advance against a stale version used to leave a posted journal; now nothing is saved.
- Guards/checks that cover this (IDs): G01 (exact balance, deferred), G02 (line shape), G07 (transaction has a journal by commit), G09 (lines/entries only in the creating transaction) — all arrive in Step 2; this step makes the app pass them.
- Guards/checks added or changed (ID, revision, severity), or "none — covered by: …": none — covered by G01, G02, G07, G09 (Step 2).
- Golden events added/changed (scenario@version, event IDs); expected values supplied by (name, date): none.
- Properties added/changed: none.
- Red evidence (lab output showing the new rule failing before the implementation): no lab yet. Unit-level red evidence above (ambient transaction 4/5 fail on the old shape; money module missing / tolerance accepted the sub-cent entry).
- Green evidence (lab run on the final commit; certificate status): no lab yet (Step 3+). Unit tests green as above; no certificate yet.
- Waivers used (CGW-…, expiry): none.
- CoreGuard version: none → none (`packages/coreguard` starts at 2.0.0 in Step 3).

## UI/UX impact

Not applicable: the diff has no UI files. The error texts users can see are the existing ones; a refused sub-cent entry shows "Journal is not balanced (debits …, credits …)." through each action's existing error path.
