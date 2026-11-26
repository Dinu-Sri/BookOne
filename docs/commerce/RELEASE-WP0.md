# Commerce API — WP0 release note (BookOne 2.20.0, 26 Nov 2026)

For the Watercolor.LK web team (brief: "extend Commerce API for e-commerce websites", WP0). All changes are additive to v1 (G1): no field, scope or route was removed or renamed.

## What shipped

| WP0 item | Status | Detail |
|---|---|---|
| 1. Web orders visible in BookOne | **Done** | New **Orders** tab per connection (Company → Commerce Integrations). Lists **every** received order: number, date, customer, total, payment method and status, status, next step. Filters (need action, awaiting payment, to dispatch, dispatched, delivered, cancelled), search, detail view with lines. Staff actions: **Confirm**, **Mark paid**, **Dispatch** (courier + tracking number), **Mark delivered**, **Cancel** (releases held stock; a posted order gets a linked return with restock), **Refund**, **Refund and restock**, **Retry posting**. The Overview counts orders received and orders to handle. |
| 2. COD / bank transfer commit stock on receipt | **Done** | A `payment.status: "pending"` order with method `cod` or `bank_transfer` holds its stock immediately (`stock: "committed"`). It is released on cancel, and becomes the invoice stock movement when paid and posted. Configurable per connection (Settings → Orders and delivery). The hold also blocks POS and manual sales when negative stock is set to Block (the default). If stock is short, the order is received as `needs_review` and nothing is held. |
| 3. Payment method codes | **Done — names accepted** | Send `payment.method` as `cod`, `bank_transfer`, `payhere` or any name. Each name maps to a BookOne account under **Payments** (default account + per-method rows). New `GET /payment-methods` lists methods with `settlementAccountCode`, `settlesOnPaid`, `holdsStockWhilePending`. 4-digit codes still work. |
| 4. Inventory scope | **Documented** | `/inventory` returns the SKUs **linked to the connection** (`scope: "mapped"`), which is the channel's published set today. Channel-level publishing of every SKU comes with WP1 C1. |
| 5. Publish-queue / mapping events | **Done** | New change kinds: `publish` (`action: queued` when staff queue a product, `claimed` when you acknowledge it) and `mapping` (`action: applied`). |

## Endpoint changes

- **New** `GET /payment-methods`. Example and errors (401, 403) are in `openapi.json`.
- **Changed (additive)** `GET /inventory` items gain `onHand`, `committed`, `available`, and the response gains `scope`. **`quantity` now equals `available`** (on hand minus held stock).
- **Changed (additive)** `GET /orders/{externalId}` and the `POST /orders` receipt gain `paymentStatus`, `stock` (`none|committed|released|consumed`) and `fulfilment` (`status`, `confirmedAt`, `shipments[]`).
- **Changed (additive)** `GET /changes` kinds: `order`, `mapping`, `publish` (in addition to `catalog`, `inventory`). `order` payload: `externalId, action, status, paymentStatus, fulfilment, documentNumber`. Actions are `stock_held, confirmed, paid, dispatched, delivered, cancelled, refunded, posted, needs_review, event:<kind>`.
- `sku` on `/inventory` accepts a comma list (G6).

## Deviations from the brief and why

- **`quantity` meaning.** It now excludes held stock. Keeping it as on-hand would let the website oversell units held for COD orders, which is the bug item 2 fixes. `onHand` is available if you need the physical count.
- **Fulfilment statuses.** `confirmed` is added before `picking`. `picking`, `packed` and `out_for_delivery` exist in the schema but have no staff button yet (WP5).
- **Courier list.** Staff configure couriers and tracking link templates per connection. No courier is pre-loaded, because we did not want to guess tracking URLs. Add Fardar Express with its real tracking link under Settings.
- **Settled orders.** "Mark paid" settles into the account configured for the method. If `cod` is set to "leave unpaid", the invoice stays open until the cash is received in Sales → Receive Payments.
- **Not in WP0:** G2–G10 cross-cutting rules (pagination with `limit`/`updatedSince`, ETag, rate-limit headers, `revision` on every entity) are planned with WP1, where the new catalog endpoints are built.

## Sandbox data to test with

On your `watercolorlkv2` connection:

1. Make sure `WC0001` is linked (Products tab) and has stock at the connection's location.
2. Send a COD order (as `WLK-100001`). Expect `stock: "committed"`, `/inventory` `available` down by 1, and the order on the Orders tab within seconds.
3. Staff: Confirm → Dispatch (courier + tracking) → Mark delivered → Mark paid. Watch `/changes` for `kind: "order"` items and `GET /orders/WLK-100001` for `fulfilment`.
4. Send another COD order and cancel it (your `cancelled` event or staff **Cancel**). Expect `stock: "released"` and `available` back up.
5. `GET /payment-methods` after the first orders.

## Next packages

WP1 (catalog, channels, weights) needs new BookOne product data: variants, multiple images, attributes, weights and price lists. It ships as its own release with a migration and product-form changes.
