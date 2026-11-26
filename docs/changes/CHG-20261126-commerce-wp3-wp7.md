# CHG-20261126-commerce-wp3-wp7: reservations, webhooks, order payload, customers, scopes, stats (v2.23.0)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-26
- Product version and base: 2.23.0, pushed directly to `master` (owner-approved), based on `def41ad` / v2.22.1
- Source: owner, "do any needed test and finish rest of the development all at once", on the Watercolor.LK brief (WP3–WP7). No QA finding and no external UX/UXW/WB ID. Prior QA reference: Dinu-Sri/bookone-qa PR #129 at `91d7ce8e698517b2c50daeeb552ecd56104f5741`.
- Website release note: [docs/commerce/RELEASE-WP3-WP7.md](../commerce/RELEASE-WP3-WP7.md)

## Data (migration 058, additive and idempotent)

- `commerce_stock_commitments`: `order_id` is nullable (reservation holds have no order). It gains `reservation_id` and `expires_at`. Active means `status = 'active' AND (expires_at IS NULL OR expires_at > now())` everywhere: the pg store, POS/posting `committedWebOrderQty` and the memory store.
- New tables, each with tenant-isolation RLS:
  - `commerce_reservations`;
  - `commerce_webhooks` (secret AES-256-GCM encrypted with a key derived from the app secret, previous secret plus overlap, status, `last_revision` cursor);
  - `commerce_webhook_deliveries`;
  - `commerce_customers`;
  - `commerce_api_calls` (pruned at 30 days).
- `bookone_commerce_background_tenants()` (SECURITY DEFINER, pinned `search_path`): returns tenant ids only, for companies with new feed items for a webhook, due retries, or expired active reservations.

## Behaviour

**WP3 reservations**
- The service has `createReservation`, `getReservation`, `updateReservation`, `releaseReservation` and `expireReservations`.
- Holds go through `holdReservation`, which takes the same per-product advisory lock as posting. It is all-or-nothing by default, or `partial`.
- `submitOrder` with `reservationId`:
  1. `transferReservationToOrder` moves the active holds to the order (no expiry);
  2. the reservation becomes `converted`;
  3. the order's stock is `committed`;
  4. held SKUs skip the paid-order stock pre-check;
  5. `commitOnReceipt` skips an already-held order;
  6. `tryPostInvoice` consumes the holds as before.
- `/inventory` adds `lowStockThreshold` (reorder level) and `incoming` (open POs minus GRN receipts, by delivery date).

**WP4 feed and webhooks**
- `/changes`:
  - takes `?kinds=`;
  - items gain `entityId` and `occurredAt` (`CommerceService.feedItem`);
  - the window is 5,000,000 revisions.
- New kinds:
  - `reservation` and `customer`;
  - `image` (photo actions; a `product` change is also emitted);
  - `category` and `brand` (category create/rename/delete and brand save/archive via `notifyCommerceTaxonomy`).
- `runBackground(tenantId, send)`:
  1. expires reservations;
  2. queues new outbox items per webhook, filtered by kind, from `last_revision`;
  3. sends due deliveries signed with `t=…,v1=…` (both secrets during rotation);
  4. on non-2xx, retries with backoff `30 s × 2^(n-1)`, capped at 6 h;
  5. after 24 h the delivery `failed` and the webhook `failing`.
- `lib/commerce-background.ts` runs it every 5 s for tenants from the definer function. It starts lazily from the Commerce API route and the Commerce page (not `instrumentation.ts`, because `@bookone/db` imports `server-only`). `fetch` uses `redirect: 'manual'` with a 10 s timeout.
- URL rules: https only. Sandbox may use `http://127.0.0.1` or `localhost`. Live connections refuse private-network hosts.

**WP5 orders**
- Order input gains the WP5 optional fields. `normalizeOrderInput` folds `fees` (or `delivery.fee`) into `shippingAmount` and `discounts` into `discountAmount` when absent.
- The posting port writes `invoiceNotes()` (ship-to, delivery, coupons, fees, note) as the invoice notes. They print on the invoice.
- New events:
  - `payment_pending_verification`: attachment, review note;
  - `payment_failed`: releases the hold; refused once posted;
  - `address_updated`: refused after dispatch.
- Reads: `GET /orders/{id}` returns `orderView` (lines, payment, invoice, shipments with lines) plus the receipt fields, and `GET /orders` lists the channel's orders.
- Staff: `markWebOrderReturned` (`returned` op).
- Orders tab detail: address, delivery, discounts, fees, note, attachments, payment ref, gateway fee, line descriptions, **Mark returned**, **Packing slip** (new page `/company/commerce/packing-slip`).

**WP6**
- Customers:
  - `upsertChannelCustomer` calls the posting port's `upsertCustomerParty`, which matches a party by id, email, then the last 9 phone digits, or else `ensureParty` creates one;
  - `getChannelCustomer`;
  - `channelCustomerOrders` returns web orders plus `partyInvoices` (sales invoices and POS sales).
- Invoice link: `orderInvoice` calls `invoiceLink`, which reuses or creates the document's public token and returns `/i/<token>`.
- `createReturn` maps to a `refunded` event with line amounts and `externalRefundId = externalReturnId`.

**WP7**
- Scopes: `SCOPE_ALIASES` are accepted in `parseScopes`, and `/connection` returns `grantedScopes`.
- Catalog reads:
  - `include=stats` through `salesStats` (sales invoices and POS sales, not drafts or voided);
  - `relatedProducts` (co-occurring lines);
  - `newArrivals`.
- Operations:
  - `GET /health` with no auth;
  - generic `Idempotency-Key` for POST/PUT/PATCH (`idempotentReplay` / `rememberIdempotent`, stored in `commerce_idempotency` with a hashed key);
  - API call log written after each authenticated call;
  - new error code `INSUFFICIENT_STOCK` (409).
- The route was rewritten around `handle()`: auth, tenant context, idempotency and the log. It adds PATCH, PUT and DELETE.

**Docs.** OpenAPI 1.4.0 (all new paths, schemas `Address`, `OrderView`, `Reservation`, `Webhook`, `Customer`, examples). The developer guide has new sections, there is a new `/docs/developers/webhooks` page, and the index, compatibility, catalog and operator guide are updated.

## UI/UX compatibility

- New components (`commerce-developer-extras.tsx`) use the registry `TextField` and shared `Button`, `Badge`, `ConfirmDialog` and `withFormPending`. Kind selection uses checkboxes (allowed HTML). There is no native select or date input.
- The packing slip is a standalone print page, like the existing print pages, and uses `PrintSheetButton`.
- Shared consumers:
  - `company-commerce.tsx` gains three cards in the Developer panel and three props;
  - `commerce-web-orders.tsx` gains optional fields, two actions and a link.
- Existing tabs, selectors and keyboard order are unchanged.
- Preserved:
  - v1 request and response fields (additive only), order idempotency, and posting and tax rules;
  - permissions: Commerce Integrations write for staff actions, and key scopes for the API;
  - tenant RLS (the background loop runs per tenant after a tenant-id-only definer lookup).

## Evidence

- `packages/commerce/test/wp3-7.test.ts` (15):
  - reservation hold vs POS commitments, expiry, extend/change/partial, conversion for paid and COD orders;
  - kinds filter; signing, verify, backoff, crypto, URL rules; delivery, retry, failing, rotation;
  - fee and coupon folding and invoice notes; full order view and invoice link; new events; returns;
  - customers with POS match and orders; scope aliases and capabilities; stats, related and new arrivals.
- `openapi-shape.test.ts`: all new paths, version 1.4.0, signature and `INSUFFICIENT_STOCK` documented.
- `packages/auth/test/commerce-wp3-7.test.ts` (6): migration shape, expiry clause in POS and store, route handlers, background loop, registry-only UI, notes and feed hooks.
- CoreGuard (`e2e/coreguard-commerce.spec.ts`), new HTTP test against real Postgres:
  - health; reservation create, read and release; inventory `incoming`;
  - webhook to a local receiver, with signature verified;
  - customer PUT with Idempotency-Key replay; order list and invoice link;
  - kinds filter; stats; capabilities.
- Unit totals: commerce 78, auth 243 (+5 skipped). Typecheck passing. The rest of the evidence is in TASK_LOG.
- Not run locally: Postgres, which is covered by CoreGuard in CI, then staging.

## Rollback

Revert the commit. Migration 058 only adds tables, columns and a function, and drops NOT NULL on `commerce_stock_commitments.order_id`. Reverted code ignores reservation rows: their `expires_at` is ignored by old code, so release active reservations first (`UPDATE commerce_stock_commitments SET status='released' WHERE reservation_id IS NOT NULL AND status='active'`).

## Follow-up v2.23.1 — CoreGuard cleanup

CoreGuard on `03b578f` passed every browser and HTTP test, including the new WP3–WP7 HTTP test against Postgres. The pilot then failed in teardown: `commerce_api_calls` rows (written by the new API call log) block deleting the test connection, because the schema sync created that foreign key without cascade. `scripts/coreguard/seed.ts` cleanup now deletes the newer commerce tables (API calls, webhook deliveries, webhooks, customers, reservations, stock commitments, channel products, publish claims, mapping proposals) first, each only if the table exists. Test infrastructure only; no product behaviour changes.
