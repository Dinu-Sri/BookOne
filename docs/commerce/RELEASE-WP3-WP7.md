# Commerce API — WP3 to WP7 release note (BookOne 2.23.0, 26 Nov 2026)

For website teams (first consumer: Watercolor.LK). Everything is additive to v1. Guides:
- `/docs/developers/custom-website`, sections 4a (reservations), 5 (feed and webhooks), 6 (orders, returns, customers, write safety, scopes, health);
- `/docs/developers/webhooks`;
- `/docs/developers/catalog`, "Stats, related products and new arrivals".

Spec: `/api/commerce/v1/openapi.json` (1.4.0).

## WP3 — Inventory and reservations

| Endpoint | Notes |
|---|---|
| `GET /inventory` | Adds `lowStockThreshold` (product reorder level) and `incoming[{quantity, expectedAt}]` (open purchase orders, ordered − received). `committed` includes active reservations. |
| `POST /reservations` | `externalId`, `lines[{sku, quantity}]`, `ttlSeconds` (60–3600, default 900), `partial` (default false). Returns `reservationId`, `status`, `expiresAt` and per-line `held` or `insufficient` with `available`. The same `externalId` while active returns the existing hold. |
| `GET /reservations/{id}` | `active`, `converted`, `released` or `expired`. |
| `PATCH /reservations/{id}` | `ttlSeconds` (extend from now) and/or `lines`. If there is not enough stock for the new quantities, it returns `409 INSUFFICIENT_STOCK` and keeps the old hold. |
| `DELETE /reservations/{id}` | Release. |
| `POST /orders` with `reservationId` | Converts the hold into the order's hold in one step. Held lines never fail on stock. |

The acceptance check is met:
- Holds use the same commitment table the POS and invoices check. A held last unit cannot sell at the POS.
- A hold stops counting at `expiresAt` (checked in SQL, no job needed).
- The `reservation` and `inventory` changes for an expiry follow within about 5 seconds (background loop) or on the next `/changes` call.

## WP4 — Change feed and webhooks

What changed on `/changes`:
- `?kinds=a,b` filters the feed; the cursor still advances past other kinds.
- `variant` selects `product` items that carry `variantId`.
- Items add `entityId` and `occurredAt`.
- New kinds: `image`, `category`, `brand`, `reservation` and `customer`. `catalog`, `product`, `price`, `inventory`, `order`, `mapping` and `publish` stay.
- The cursor window is now 5,000,000 revisions, so cursors stay valid well beyond 7 days.

Webhooks:

| Endpoint | Notes |
|---|---|
| `POST /webhooks` | Takes `url` and optional `kinds`. Returns `secret` once. Max 5 per connection, `https` only (sandbox may use `http://127.0.0.1`/`localhost`). Live connections refuse private network addresses. |
| `GET /webhooks` | Lists the connection's webhooks. |
| `DELETE /webhooks/{id}` | Removes a webhook. |
| `POST /webhooks/{id}/test` | Queues a signed `ping`. |
| `POST /webhooks/{id}/rotate` | New secret. The old one keeps signing (second `v1=`) for 24 h. |
| `GET /webhooks/{id}/deliveries` | Delivery log: status, attempts, last HTTP status, next retry. |

- **Signing (W3):** `X-BookOne-Signature: t=<unix>,v1=<hex HMAC-SHA256("<t>.<raw body>")>`. Receivers reject signatures more than 300 s from their clock.
- **Headers:** `X-BookOne-Event-Id` (= item `id`), `X-BookOne-Kind`, `X-BookOne-Delivery`.
- **Retries (W4):** exponential backoff (30 s, 1 min, 2 min … capped at 6 h) for 24 h. After that the endpoint is marked `failing`, and staff can re-enable it.
- **Delivery (W6):** at least once. Receivers de-duplicate on `id`.
- **BookOne screen:** Developer → **Webhooks** lets staff add a webhook (with kinds), send a test, rotate the secret, re-enable, remove, and read the delivery log.

## WP5 — Orders

- **Payload (all optional):**
  - `displayNumber`, `channelCustomerId`, `customerId`, `customerGroup`;
  - `shippingAddress`, `billingAddress`, `delivery{method, carrier, fee, weightGrams, notes}`;
  - `reservationId`, `discounts[]`, `fees[]`, `attachments[]`, `customerNote`, `marketing`;
  - line `listPrice`, `description` and `bundleParentLineId`;
  - `payment.gatewayFee`.
- **Totals:** when `shippingAmount` is missing, BookOne posts the sum of `fees` (or `delivery.fee`) as shipping. When `discountAmount` is missing, it posts the sum of `discounts`. Explicit v1 fields win.
- **New events:** `payment_pending_verification` (`attachment`), `payment_failed` (`externalRef`, `reason`; releases held stock), `address_updated` (`shippingAddress`; `409` after dispatch). Each is idempotent on `externalEventId`.
- **Reads:**
  - `GET /orders/{externalId}` adds `lines` (with `fulfilledQuantity`, `refundedAmount`, `restockedQuantity`), `payment`, `invoice`, address, delivery, discounts, fees, and `fulfilment.shipments[].lines`.
  - `GET /orders?updatedSince&status&cursor&limit` lists the connection's orders.
- **BookOne screen (Orders tab):**
  - the order shows ship-to, bill-to, delivery, discounts, fees, customer note, bank slips, payment reference and gateway fee;
  - new actions **Mark returned** and **Packing slip** (printable);
  - the invoice notes print ship-to, delivery, coupons and the customer note.

## WP6 — Customers, payments, invoices, returns

| Endpoint | Notes |
|---|---|
| `PUT /customers/{channelCustomerId}` | Upserts a customer. Matches an existing BookOne customer by email, then phone, so POS customers are not duplicated, and links it to a BookOne customer record. Returns `customerId`, `matchedExisting` and `created`. |
| `GET /customers/{customerId}` | The website's own id also works. |
| `GET /customers/{customerId}/orders` | Website orders plus in-store invoices (POS and BookOne), each with `source`: `web`, `pos` or `store`. |
| `GET /orders/{externalId}/invoice` | Returns `{documentNumber, issuedAt, total, pdfUrl}`. |
| `POST /orders/{externalId}/returns` | Takes `externalReturnId`, `restock` and `lines[{externalLineId, quantity, reason, condition}]`. Books a linked sales return. Needs the `lifecycle` scope. |
| `GET /payment-methods` | Shipped in WP0. |

## WP7 — Scopes, reporting, operations

- **Scope aliases:** `catalog:read`, `pricing:read`, `webhooks:manage` → `catalog`; `inventory:read`, `reservations:write` → `inventory`; `orders:write`, `orders:read`, `customers:read`, `customers:write` → `order`; `lifecycle`. Old names keep working. `/connection` lists `grantedScopes`.
- **Reporting:**
  - `include=stats` adds `unitsSold30d`, `unitsSold90d` and `unitsSoldAllTime` (all channels including POS; a listing sums its variants).
  - `GET /catalog/related?sku=` returns products often bought together.
  - `GET /catalog/new-arrivals?days=30` returns recently created published products.
- **Operations:**
  - `GET /health` (no key).
  - `Idempotency-Key` on every POST, PUT and PATCH (G4); a replay returns `replayed: true`.
  - API call log per connection: Developer → **API calls**, kept 30 days.
  - Key rotation with overlap already existed.

## Deviations from the brief and why

- **Change kinds.**
  - A variant change is still `kind: "product"` with `variantId`, and `kinds=variant` selects those. Renaming the kind would break WP1 clients that read `product`.
  - A photo change emits both `image` and `product`.
  - `category` and `brand` are emitted when they are created, renamed or removed.
- **Fulfilment statuses.** `picking`, `packed` and `out_for_delivery` exist in the schema, but BookOne staff actions set `confirmed`, `shipped`, `delivered` and `returned`. Shipments cover all lines (partial shipments later).
- **Gateway fee.** `payment.gatewayFee` is stored and shown on the web order and in `GET /orders`. It is not booked automatically. Book it when reconciling the gateway payout: the settlement account receives the gross amount today. Automatic fee booking needs a per-gateway expense account setting, planned next.
- **Invoice PDF.** `pdfUrl` is BookOne's public invoice page (the same link as the invoice QR code). The customer prints it or saves it as PDF. It does not expire, which more than meets the 24 h requirement. There is no separate PDF file.
- **Webhook timing.** A background loop in the web server delivers within about 5 seconds. It starts with the first Commerce API request or Commerce page load after a deploy, and websites poll every minute, so it starts at once in practice.
- **Not shipped (P2):**
  - per-key IP allow-list (`capabilities.ipAllowList: false`);
  - 99.5 % availability and deprecation notice periods, which are operations policy rather than code;
  - multi-location channels and bundles.
- **Returns.** `POST /orders/{id}/returns` books money and stock as one linked sales return. `reason` and `condition` are accepted but only kept with the event.

## Try it on a sandbox

1. Issue a key on a sandbox connection, then call `GET /health` and `GET /connection` (`capabilities.reservations: true`, `webhooks: true`).
2. `POST /reservations` for a SKU with 1 in stock, then try to sell it at the POS (refused), then `DELETE` the reservation (the POS can sell it again).
3. `POST /reservations`, then `POST /orders` with the `reservationId` and `payment.status: paid`. The order posts and the reservation becomes `converted`.
4. `POST /webhooks` with a request-bin URL, then `POST /webhooks/{id}/test`. Check the signature with the Node snippet in `/docs/developers/webhooks`.
5. Send an order with `shippingAddress`, `delivery`, `discounts` and `fees`. Open it on the Orders tab and print the packing slip. Dispatch it, then `GET /orders/{id}` shows the shipment and an `order` change arrives.
6. `PUT /customers/usr_1` with an email of an existing POS customer: `matchedExisting: true`. Then `GET /customers/{id}/orders`.
