# BookOne Commerce C1–C3 test matrix

v1 scope: single-store, single-location, single-currency (LKR), approved domestic tax/clearing. Simple products and variants. BookOne is inventory authority. Website merchandising stays on the store. Async stock with oversell **review**. Reservation mode **disabled**.

HTTP 2xx is not accounting acceptance.

## Supported

| Flow | Effect |
|---|---|
| Catalog snapshot + change feed | Mapped SKUs only. Absolute qty + revision. Cursor resync when expired. |
| Validate order | Side-effect free. Warns that preview cannot guarantee stock. |
| Paid order in posting mode with stock | Sales invoice through `createCommercialDocumentWithUser(..., { alreadyAuthorized: true })`. One inventory movement. |
| Same Idempotency-Key + payload | Original receipt. No second journal. |
| Different payload / same key | 409. |
| Last-unit race (async) | Winner posts. Loser `needs_review`. No negative stock. |
| Payment pending/failed | Received or review. No stock/journals. |
| Unmapped SKU / total mismatch / fractional qty | `needs_review`. No journals. |
| Cancel before post | Status cancelled. No journals. |
| Cancel after post | Linked sales return with restock. |
| Refund `restock: false` | Money-only sales return. Stock unchanged. |
| Refund `restock: true` | Linked return restores sellable qty. |
| Pause inbound / outbound | Independent 409. Receipts kept. |
| Rotate | 24h overlap. Revoke ends the old key. |
| Reservations | 422 `RESERVATION_DISABLED`. |

## Unsupported (staged, no accounting)

FX, export tax, kits/bundles, nonstock services as stocked SKUs, fractional units, backorders, multi-location, Shopify install, reservation checkout, BookOne charging a payment gateway, price export.

## What this candidate actually ran

| Check | Result |
|---|---|
| `@bookone/commerce` vitest (credentials, validate, last-unit, replay, oversell review, refunds, isolation, pause, posting failure) | required; run locally and in Docker web image quality + CoreGuard |
| `@bookone/auth` `commerce-gate.test.ts` (catalog v2, grants, RLS, HPOS, CoreGuard wiring) | required |
| CoreGuard Playwright `coreguard-commerce.spec.ts` company UI + HTTP last-unit | required when `COREGUARD_PILOT_BROWSER=1` or GitHub Actions; missing `.local/commerce-results.json` firstStatus 202 fails the lane |
| Plugin ZIP `node scripts/commerce/package-plugin.mjs` | required in CoreGuard. Local artifact `connectors/woocommerce/release/bookone-commerce-1.0.0.zip` sha256 `61a645b02e6e4633cdf220d470a5e7b794a7ec4e7c0173b73100a7d24b37f59c` |
| Independent HTTP client `scripts/commerce/http-client.ts` | required; no Woo imports |
| Disposable Woo docker compose + live checkout | **not-run** in this candidate. Compose file and plugin ZIP are shipped. C4 supervised store pilot installs the ZIP on a real store. |
| Live tenant CoA / AgentBridge posting | not-run. Company flags stay Inbox on / draft-only off / posting-stop on. |

## Expected vs actual (HTTP last-unit fixture)

Seed: SKU-1 qty 1, SKU-VAR qty 2, posting mode, LKR.

| Client | Orders | Stock remaining | Journals |
|---|---|---|---|
| HTTP last unit + replay | 1 BookOne order | SKU-1 = 0 when status is `posted`; 1 and `needs_review` if posting cannot complete (period/party/tax) | 0 duplicates. HTTP 202 is acceptance for processing |
| Competing second paid order | 1 posted or first-wins, second `needs_review` | never negative | no second invoice |
| Woo live checkout | not-run here | plugin overwrites mapped Woo qty from BookOne | BookOne posts once per store order id `woo-{id}` |

## Compatibility

| Piece | Version |
|---|---|
| BookOne | 2.15.0 / migration 050 |
| Plugin | 1.0.0 |
| WordPress | 6.4+ (compose 6.7) |
| WooCommerce | 8.8+ HPOS declared |
| PHP | 8.1+ |
| API | Commerce v1 |
