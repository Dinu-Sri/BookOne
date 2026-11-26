# Commerce API — WP1 release note (BookOne 2.21.0, 26 Nov 2026)

For website teams (first consumer: Watercolor.LK). Everything is additive to v1 (G1). The full integration guide is public at `/docs/developers/custom-website` and `/docs/developers/catalog`; the spec is at `/api/commerce/v1/openapi.json`.

## Endpoints added

| Endpoint | Notes |
|---|---|
| `GET /catalog/products` | Published products. `cursor`, `limit` (≤ 250), `updatedSince`, `status`, `categoryId` (includes children), `brandId`, `sku` (≤ 100), `include=variants,images,prices,inventory,attributes`, `scope=all`. Keyset order by revision |
| `GET /catalog/products/{productId}` | A variant id returns its parent |
| `GET /catalog/products/by-sku/{sku}` | Product or variant SKU |
| `GET /catalog/categories` | Flat list with `parentId` |
| `GET /catalog/brands` | Product (maker) brands |
| `GET /catalog/attributes` | Defined attributes plus codes used on products |
| `GET /api/commerce/media/{company}/{imageId}/{checksum}.webp` | Public product photos (no key), cacheable for a year |

Changed (additive):
- `GET /connection` adds `channel`, `priceListId`, `stockLocationIds`, `taxMode`, `timezone`, `safetyBuffer`, `allowBackorder` and more `capabilities`.
- `GET /inventory` now covers **published** products (linked products still count), applies the channel safety buffer, and adds `safetyBuffer`, `allowBackorder` and `locations`.
- New change kind `product` (published, unpublished, updated). Stock changes from POS, invoices, purchases and adjustments now reach the feed.
- All GETs: weak `ETag` with `If-None-Match` → 304, `X-RateLimit-Limit` / `X-RateLimit-Remaining`, `X-Request-Id`. Rate limit raised to 600 per minute per key.

## BookOne screens added

- **Inventory → Products → Online store** tab:
  - short name, product brand, weight and dimensions, fragile;
  - tags, extra barcodes, specifications;
  - minimum, maximum and step quantity, backorder;
  - variants: a listing with options, and each variant as its own SKU with swatch and default.
- **Product page → Photos for online stores**: upload multiple images (kept up to 2000 px WebP), reorder, set the main one, edit alt text, remove.
- **Inventory → Categories → Product brands**.
- **Commerce Integrations → Products → Products on this store**: filter by category or brand, bulk publish or unpublish, missing-weight list.
- **Settings → Stock shown to the website**: safety buffer, channel backorders, timezone.
- **Developer → Add sample catalog** (sandbox only).

## Deviations from the brief and why

- **C2 price lists / WP2:** every channel uses `priceListId: "default"` (the BookOne sell price) and `compareAtPrice` is `null`. Price lists, sale prices and tiers come with WP2. `capabilities.priceLists` is `false`.
- **C3 multiple stock locations:** a channel still sells from one location (`stockLocationIds` has one id). Selling from several locations needs a rule for which shop's stock an order deducts; it is planned separately (`capabilities.multiLocation: false`).
- **Variants are BookOne products.** A variable product is a listing (not stocked) and each variant is a normal SKU, so POS, invoices and stock work unchanged. Product `type` is `simple`, `variable` or `service`. Bundles are not available yet.
- **Images.** Originals are kept up to 2000 px (the brief asks ≥ 1600 px). Photos uploaded earlier through the old single-photo field are 400×400 and are returned as `p_<productId>` images until a gallery photo is added.
- **`include` is opt-in.** Without `include`, products return the core fields only; this keeps list pages small.
- **Attributes.** Specifications are entered per product as `code=value`; `/catalog/attributes` returns defined attributes plus codes in use (type `text`). A screen to define attribute types and allowed values comes later.
- **Revision.** `revision` is the epoch-milliseconds of the latest change to the product, its variants or photos. It only increases.

## Sandbox data to test with

On a sandbox connection, an Owner clicks **Developer → Add sample catalog**. It creates (once) and publishes:
- 30 listings and 48 SKUs (`SAMPLE-` prefix);
- 3 brands and a category tree (Sample Art Supplies → Paints → Watercolour Paints, Brushes, Paper and Pads, Pencils and Sketching, Accessories);
- 3 paint ranges with 6 colour variants each, with swatches;
- 1600 px photos, weights, specifications and stock.

The stock has zero cost, so nothing is posted to the books. Then:
1. `GET /catalog/products?include=variants,images,prices,inventory,attributes&limit=250`. Expect 30 items, 3 of them `variable` with 6 variants each.
2. Download a few `images[].url`.
3. Sell one variant at the POS and watch `/changes` for an `inventory` item with the lower `available`.
4. Unpublish a product on the Products tab and watch for `product` / `unpublished`.

## Next

WP2 (pricing: price lists, compare-at and sale prices, `GET /pricing`, `price` change kind), then WP3 (reservations), WP4 (webhooks).
