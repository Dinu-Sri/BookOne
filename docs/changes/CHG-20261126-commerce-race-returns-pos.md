# CHG-20261126-commerce-race-returns-pos — QA-1126-16..21 (v2.18.1)

Status: ready-for-QA (independent retest required; findings stay open until QA closes them).

- Author/agent and date: coding agent, 2026-11-26
- Product version and base: 2.18.1, pushed directly to `master` (owner-approved), based on `43766e8` / v2.18.0 ([CHG-20261126-qa-retest-fixes](CHG-20261126-qa-retest-fixes.md))
- QA references: same handoff `handoffs/CODING-20261126-QA-RETEST.md` (second part, QA-1126-16 to 21) and run record in Dinu-Sri/bookone-qa PR #129, pinned at `91d7ce8e698517b2c50daeeb552ecd56104f5741`. No UX/UXW/WB ref.

## Root causes found

- **16:** `adjustStock` and `consumeCostLayers` read the quantity without a lock. Also, `createCommercialDocumentWithUser` loaded inventory and purchase settings through session-based getters. Commerce and AgentBridge post with no browser session, so those getters threw and the code fell back to the defaults (negative stock **Allow**). That is why "Block" was ignored on the API path.
- **17:** `nextDocumentNumber` / `nextPartyCode` used `count(*) + 1` with no lock or unique index. The document count also skipped voided rows, so a void could free a number for reuse.
- **18:** the commerce posting port sent every return as party "Commerce refund", which the linked-return guard rejects. The service then threw (422) and left the order `posted`, with nothing in Activity.
- **20:** commerce always posted `invoiceKind: 'commercial'`, and BookOne posts output VAT only on tax invoices.

## Changes

| ID | Fix |
|----|-----|
| 16 P1 | `lockProductStock` takes `pg_advisory_xact_lock` per tenant and product before lot consumption and before any stock decrement. The lock is held until the posting transaction commits, so a concurrent order waits and then sees the committed quantity. Posting loads inventory and purchase settings **by tenant** (`lib/tenant-settings.ts`). Commerce posts with `forceBlockNegative`, so a web order never takes stock below zero whatever the company policy. The refused orders become `needs_review` with the stock reason (existing `tryPostInvoice` path). |
| 17 P1 | Document numbers and party codes are allocated under a per-series advisory transaction lock. Voided documents count, and the allocator skips any number already used. Migration `053_unique_document_numbers.sql` first gives later duplicates a suffix (`-D2`… for documents, `-2`… for party codes, oldest keeps its number; amounts and links untouched), then adds the unique indexes `(tenant_id, document_type, document_number)` and `(tenant_id, code)`. |
| 18 P1 | Commerce returns use the original invoice's party (id and legal name). If BookOne refuses a cancel or refund, the shop gets a normal receipt: the order goes to **needs review** with "Refund/Cancellation was not booked in BookOne: …" (shown in Activity), line refund counters are restored, and the event stays `retryable`. **Retry** on a posted order replays its retryable events. |
| 19 P2 | Rule chosen: refunds stay a manager permission (`sales.returns.write`). The POS Return tab is disabled for jobs without it, with "Refunds need a manager". `completePosReturn` refuses with the same message on the server. An Owner can add Sales Returns to the Cashier job to allow till refunds. |
| 20 P2 | The web posting port handles store tax (`lib/commerce-tax.ts`). For a VAT-registered company, if the shop's tax equals the company rate on the net after discounts, the order posts as a **tax invoice**. No tax, or a different amount, is held for review with the reason. For a company that is not VAT registered, an untaxed order posts as a commercial invoice and a taxed one is held. Shipping is not VAT'd (same as the engine). If some products are exempt, the order is held rather than guessed. |
| 21 P3 | A later review reason is added to the earlier one (`a \| b`), not overwritten. Negative stock now defaults to **Block** for companies that never saved a policy. Walk-in: POS already reuses one "Walk-in" party per company via name match; no change. **Not done:** a per-connection clearing account to settle paid web orders. That needs a setting and UI, and is left as a follow-up. |

## Shared consumers and preserved behaviour

- `adjustStock` / `consumeCostLayers` serve every stock posting (sales, POS, purchases, returns, adjustments). Increases skip the lock; behaviour is otherwise unchanged.
- `createCommercialDocumentWithUser` gains an optional `forceBlockNegative`; other callers are unaffected.
- `CommerceStore.listOrderEvents` and `PostingPort.handlesStoreTax` are optional, so existing stores and ports work as before. The memory test port still holds taxed orders.
- POS bootstrap adds `canRefund`; selling is unchanged.

## Evidence

- New: `packages/commerce/test/qa-1126-commerce.test.ts` (5): three concurrent last-unit orders → exactly one posted, two in review, stock 0; refused refund → needs review, then Retry → refunded; refused cancel → needs review; reasons kept; tax-aware port posts taxed orders.
- New: `packages/auth/test/qa-1126-commerce-pos.test.ts` (13): lock placement, tenant settings, force-block, numbering lock and skip, migration order, commerce return party, Cashier/Owner refund rule, VAT decisions.
- `pnpm typecheck` 8/8; unit tests 749 passed (29 commerce, 298 accounting, 44 statement-import, 216 auth, 162 agent-bridge).
- Not covered by unit tests: real Postgres concurrency. Retest checklist item 5 (3 concurrent paid orders on staging) is the proof; migration 053 runs on the next staging boot.
