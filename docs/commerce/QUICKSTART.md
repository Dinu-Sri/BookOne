# BookOne Commerce v1 quickstart

Keep the commerce token on the server. Never put it in a theme file, shopper HTML, URL, screenshot or job payload.

HTTP 2xx means the request was accepted for processing. Confirm stock, journals and the BookOne document by reading them back.

## 1. Company screen

1. Open **Company → Commerce Integrations**.
2. Add a **WooCommerce** sandbox connection and a **Custom Website** sandbox connection.
3. Pick the stock location. Posting starts in **preview**.
4. Issue a scoped key. Copy it once. Later visits show only the prefix.
5. Map SKU-1 and a variant, then **Publish BookOne stock**.
6. After mappings look right, set posting to **Post supported paid orders**.
7. Pause inbound orders and outbound stock independently if needed.
8. Rotate keeps the old key for 24 hours. Revoke ends it immediately.

Owner and Admin can issue keys. Viewer can open the screen and cannot issue, rotate or revoke.

## 2. Generic HTTP client

```bash
export BOOKONE_COMMERCE_BASE='https://example/api/commerce/v1'
export BOOKONE_COMMERCE_TOKEN='bkc_sand_prefix_secret'

curl -sS -H "Authorization: Bearer $BOOKONE_COMMERCE_TOKEN" \
  "$BOOKONE_COMMERCE_BASE/connection"

curl -sS -H "Authorization: Bearer $BOOKONE_COMMERCE_TOKEN" \
  "$BOOKONE_COMMERCE_BASE/products"

curl -sS -H "Authorization: Bearer $BOOKONE_COMMERCE_TOKEN" \
  "$BOOKONE_COMMERCE_BASE/inventory?sku=SKU-1"

npx tsx scripts/commerce/http-client.ts \
  --base "$BOOKONE_COMMERCE_BASE" \
  --token "$BOOKONE_COMMERCE_TOKEN" \
  --sku SKU-1
```

OpenAPI: `GET /api/commerce/v1/openapi.json` and `docs/commerce/openapi.yaml`.

## 3. Durable order

`POST /api/commerce/v1/orders` requires `Idempotency-Key` and an immutable store `externalId`. Response is **202**. Replay the same key and payload to recover a lost response. A different payload under that key is **409**.

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $BOOKONE_COMMERCE_TOKEN" \
  -H "Idempotency-Key: store-1001" \
  -H "Content-Type: application/json" \
  -d '{"externalId":"1001","currency":"LKR","placedAt":"2026-11-20T10:00:00Z","sourceTimezone":"Asia/Colombo","customer":{"name":"Walk-in"},"lines":[{"externalLineId":"1001-1","sku":"SKU-1","quantity":"1","unitPrice":"1500.00"}],"total":"1500.00","payment":{"status":"paid"}}' \
  "$BOOKONE_COMMERCE_BASE/orders"
```

Then `GET /orders/1001`. Lifecycle: `POST /orders/1001/events` with `paid`, `cancelled`, `fulfilled` or `refunded`. Refunds need `externalRefundId`. `restock: true` returns sellable stock. `restock: false` is money-only.

Reservations stay **422** until a contention test passes.

## 4. WooCommerce plugin

```bash
node scripts/commerce/package-plugin.mjs
```

Install `connectors/woocommerce/release/bookone-commerce-1.0.0.zip` in WordPress. Confirm HPOS is on. Paste the BookOne API base and sandbox key. Test connection, preview mapping, publish stock. Do not put the token in a theme file.

WP-Cron hook `bookone_commerce_tick` every five minutes is the durable worker. Repair from Woo → BookOne.

## 5. Bootstrap for CoreGuard

```bash
pnpm coreguard:pilot
```

Requires a disposable `bookone_test` database. Seeds SKU-1 qty 1 and SKU-VAR qty 2, Woo + HTTP connections in posting mode, and known sandbox tokens. Browser evidence writes `.local/commerce-results.json` with HTTP last-unit `firstStatus` 202. A missing required result fails the lane.

Disposable Woo store: `docker compose -f docker/docker-compose.commerce-woo.yml up`. See [OPS.md](OPS.md).
