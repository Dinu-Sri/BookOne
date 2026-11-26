# Commerce API — WP2 release note (BookOne 2.22.0, 26 Nov 2026)

For website teams (first consumer: Watercolor.LK). Everything is additive to v1. Guides: `/docs/developers/custom-website` (Prices section) and `/docs/developers/catalog#prices`; spec: `/api/commerce/v1/openapi.json` (1.3.0).

## What changed for websites

| Item | Notes |
|---|---|
| PR1 price and was price | `price.price` is the list price (or the BookOne sell price when the product is not on the list). `compareAtPrice` is sent only when it is higher than `price`. |
| PR2 scheduled sales | `price.sale = { price, startsAt, endsAt, active }`. Dates are whole days in the company timezone. |
| PR3 quantity prices | `price.tiers = [{ minQty, price }]`: unit price from `minQty` upward. |
| `effectivePrice` | Unit price for one item right now (sale when active, else price). |
| PR4 `GET /pricing?sku=` | 1 to 100 product or variant SKUs (repeat or comma-separate). Returns `items[{ sku, productId, parentProductId, price }]`, `missing`, `priceListId`, `customerGroup`. |
| PR5 customer groups | `customerGroup=wholesale` on `/catalog/products`, `/catalog/products/by-sku/{sku}` and `/pricing` returns that group's list when one exists, otherwise the channel list. |
| PR6 change kind `price` | Sent when a list price changes, the channel's list is switched or archived, a sale starts or ends, or a product's sell price changes. Payload: `productId`, `variantId`, `sku`, `price` (full object). |
| PR8 price check | `POST /orders/validate` adds a non-blocking issue `{ code: "PRICE_MISMATCH", message: "PRICE_MISMATCH:<sku>", expected, received, blocking: false }`. The order is still accepted and posted at the price the customer paid. |
| C2 channel price list | `/connection.priceListId` is the list the channel sells at (`default` = BookOne sell price). |
| Capabilities | `priceExport`, `priceLists`, `salePrices`, `priceTiers`, `customerGroupPricing` are `true`; `changeKinds` includes `price`. |

## BookOne screen added

**Commerce Integrations → Prices** (between Products and Payments):
- **Prices on this store**: the price list this connection sells at.
- **Price lists**: create (name, optional customer group) and archive. Archiving moves stores that used it back to sell prices.
- **Prices in <list>**: per product/variant list price, was price, sale price with from/to dates, quantity prices (`6=1050; 12=990`), the price charged now, search and paging.
- **Set every price from the sell price ±%** and **Clear all prices** for the whole list.

## Deviations from the brief and why

- **Sale start/end events.** BookOne emits the `price` change for a sale boundary when the channel next polls `/changes` (it checks for sales that started or ended since the last poll). A website polling every minute sees it within a minute. `sale.active` is always computed at read time, so catalog and `/pricing` reads are exact.
- **Sale dates are whole days.** The screen takes from/to dates; the API returns exact timestamps with the company timezone offset.
- **One currency.** Lists are in the company currency (LKR). Multi-currency lists are not in scope.
- **Customer group is a label.** BookOne does not know which website customer is wholesale; the website decides and passes `customerGroup`. Groups are lower-case letters, digits, `-` and `_`.
- **Orders keep the price paid.** `PRICE_MISMATCH` is a warning only (coupons and manual discounts are legitimate), as the brief asks.

## Try it on a sandbox

1. On a sandbox connection, **Developer → Add sample catalog** (if not done).
2. **Prices → Create price list** "Online Retail", then **Use this price list**.
3. **Edit prices**: set `-10` and **Apply to all**; edit one SKU with a was price, a sale for today and `6=…` tiers.
4. `GET /changes?cursor=…` shows `price` items; `GET /pricing?sku=<that SKU>` shows `sale.active: true` and the tiers.
5. Create a list with customer group `wholesale` and read `/pricing?sku=…&customerGroup=wholesale`.
6. `POST /orders/validate` with a different `unitPrice`: `ok: true` and a `PRICE_MISMATCH` issue.

## Next

WP3 (reservations during card checkout), WP4 (webhooks).
