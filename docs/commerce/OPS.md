# BookOne Commerce operations

## First-store checklist

1. Confirm domestic LKR, one location, inventory + sales modules, and an approved tax/clearing profile.
2. Create sandbox Woo and Custom Website connections. Leave posting on preview.
3. Issue keys. Copy them from the one-time dialog. They are never placed in the page URL. Store them in the plugin option or the website server. Never in theme files.
4. Map a simple SKU and a variant. Unrelated listings stay untouched.
5. Publish stock. Confirm Woo native qty for mapped SKUs equals the BookOne absolute feed.
6. Submit a validate-only order. Then a paid last-unit order in posting mode.
7. Confirm one BookOne sales invoice, one stock movement, remaining qty 0, no duplicate journals.
8. Replay the same Idempotency-Key. Confirm the original document link.
9. Exercise a money-only refund and a restock refund on separate fixtures.
10. Pause inbound, confirm new orders are refused, resume, confirm the worker continues from the durable queue.

## Rotate keys issued before 2.16.0

Keys issued before BookOne 2.16.0 were returned in `?issued=` query data. Treat every active key created before this release as potentially present in browser history, server access logs, or shared links.

1. Open Company → Commerce Integrations.
2. For each connection, rotate every **active** key.
3. Copy the new secret from the one-time dialog.
4. Update the WooCommerce plugin option or HTTP client.
5. After the store is on the new key, revoke leftover rotated keys when the 24-hour overlap ends.

## Pause and resume

- **Inbound paused:** `POST /orders` and lifecycle events return 409 `INBOUND_PAUSED`. Existing receipts, mappings and checkpoints stay.
- **Outbound paused:** `GET /inventory` and stock publish return 409 `OUTBOUND_PAUSED`. Catalog read still works.
- Woo worker skips inbound jobs when the plugin pause flag is set. Repair (`tick(true)`) still drains the queue.

## Recovery

- Lost HTTP response after BookOne commit: retry the same Idempotency-Key and payload. BookOne returns the original receipt.
- Crash after post, before ack: unique `(tenant, connection, external order id)` plus idempotency recover the original document. Do not post again.
- Expired change cursor: 422 `CURSOR_EXPIRED` with `fullResync: true`. Take a products + inventory snapshot, then resume `/changes`.
- Worker restart: Woo jobs live in `{prefix}bookone_commerce_jobs` with pending/processing/dead, attempt backoff, and explicit Retry. Missing orders stay pending. Validation failures become dead, not successful delivery.
- Stale Woo native stock: BookOne is the authority. The plugin overwrites mapped Woo qty with the absolute feed. Connector-originated stock writes set `_bookone_origin` so order hooks do not loop.
- Oversell under async mode: the losing paid order is `needs_review`. Stock is never negative. Journals are not created for the losing claim.

## Security and PII

- Token format `bkc_<sand|live>_<prefix>_<secret>`. Lookup is prefix + SHA-256(`pepper:secret`) with `AUTH_SECRET` as pepper.
- Prefix lookup uses `bookone_commerce_lookup_credential` (SECURITY DEFINER) because it happens before tenant GUC.
- Ordinary UI readback never returns the secret. Activity rows store prefix and scopes only.
- Store only customer name/email needed for the sales document. Do not log tokens.
- Commerce credentials are separate from AgentBridge tokens and browser cookies.

## Migration and rollback

- Migration **050** is additive. Default posting is preview. Rollback is `DROP` of `commerce_*` tables and the lookup function. Sales and inventory tables stay.
- Forward-repair: re-run `scripts/init-db.ts`. Existing connections, mappings, receipts and checkpoints are preserved.
- Plugin 1.1.0 settings survive deactivate. The job table is created on activate. Uninstall leaves the autoload-off option unless the operator deletes it.

## Conflicts

Operators own mapping, oversell review, pause and posting enablement. BookOne does not charge or refund a payment gateway through this API. Unsupported tax, FX, kits, fractional qty, and reservation requests go to review with zero unintended accounting.

Reservation mode stays disabled until a real contention test passes. Do not advertise it.
