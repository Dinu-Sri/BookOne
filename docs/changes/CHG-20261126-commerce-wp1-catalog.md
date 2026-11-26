# CHG-20261126-commerce-wp1-catalog — Catalog API, variants, photos, channel publishing (v2.21.0)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-26
- Product version and base: 2.21.0, pushed directly to `master` (owner-approved), based on `239f166` / v2.20.3
- Source: owner "Start WP1" on the Watercolor.LK brief (WP1: sales channels and full catalog read), and "update docs properly so other people can integrate their custom websites". No QA finding; no external UX/UXW/WB ID. Prior QA reference: Dinu-Sri/bookone-qa PR #129 at `91d7ce8e698517b2c50daeeb552ecd56104f5741`.
- Website release note: [docs/commerce/RELEASE-WP1.md](../commerce/RELEASE-WP1.md)

## Data (migration 056, additive and idempotent)

- `inventory_products` new columns:
  - `short_name`, `product_brand_id`, `parent_product_id`, `variant_options`, `product_options`;
  - `swatch_hex`, `variant_sort_order`, `is_default_variant`;
  - `tags`, `extra_barcodes`, `attribute_values`;
  - `weight_grams`, `length_mm`, `width_mm`, `height_mm`, `fragile`;
  - `min_order_qty`, `max_order_qty`, `order_qty_step`, `allow_backorder`.
- New tables (all with tenant-isolation RLS policies):
  - `inventory_product_brands`;
  - `inventory_product_images` (gallery; WebP up to 2000 px with width, height, checksum, position, alt);
  - `inventory_attributes`;
  - `commerce_channel_products` (published set per connection).
- `inventory_product_categories` gains `description` and `image_key`; `commerce_connections` gains `channel_settings` (safety buffer, backorder, timezone).

## Behaviour

- **Variants.** A "listing with variants" is a non-stock product (forced `service`, not sellable or purchasable) with `product_options`. Each variant is a normal SKU with `parent_product_id`. Posting, POS, stock and costing are unchanged.
- **Catalog read model.** `packages/commerce/src/catalog.ts` is pure; the store supplies a bundle.
  - It covers publishing (explicit, or linked/mapped), parent-publishes-variants, filters, a keyset cursor by (revision, id), and `include`.
  - It produces image URLs on the public media route, prices (`default` price list), and inventory (on hand − committed − buffer).
  - It also handles tax category and rate, the missing-weight list, and an ETag that ignores `asOf`, `requestId` and `serviceTime`.
- **API.** `/catalog/products`, `/catalog/products/{id}`, `/catalog/products/by-sku/{sku}`, `/catalog/categories`, `/catalog/brands`, `/catalog/attributes`. All GETs get an ETag, 304 on match, `X-RateLimit-*` and `X-Request-Id`. The rate limit is 600 per minute. `/connection` gains the C5 fields. `/inventory` covers the published set plus the buffer.
- **Change feed.** New `product` kind for publish, unpublish and update. `notifyCommerce` runs after commit for:
  - commercial document postings (invoices, POS, purchases, returns);
  - stock adjustments and transfers;
  - product create, update, archive, restore and delete;
  - photo changes.

  Commerce postings keep their own `inventory` events (`forceBlockNegative` path).
- **Screens.**
  - Product form gets an **Online store** tab (`product-catalog-fields.tsx`).
  - The product edit page gets **Photos for online stores** (`product-gallery.tsx`).
  - Categories page gets **Product brands**.
  - Commerce **Products** tab gets **Products on this store** (bulk publish with filters, missing weight).
  - Commerce **Settings** gets **Stock shown to the website**.
  - Commerce **Developer** gets **Add sample catalog** (sandbox only; 30 listings / 48 SKUs, zero-cost stock, no journals).
- **Docs.**
  - `/docs/developers/custom-website` is rewritten as a general integration guide (setup, conventions, sync loop, stock, change feed, orders, payments, held stock, tax, fulfilment, events, Node sample, changelog).
  - New `/docs/developers/catalog`.
  - Index, errors and compatibility pages updated.
  - New operator page `/docs/inventory/online-store`.
  - OpenAPI 1.2.0 documents the catalog schemas and paths.

## UI/UX compatibility

- New components use registry `SelectField`, `TextField`, `TextAreaField` and `SearchField`, plus shared `Button`, `Badge`, `ConfirmDialog` and `withFormPending`. There are no native selects or date inputs. Checkboxes and file inputs are allowed HTML.
- **Exception:** `components/inventory/product-form.tsx` (legacy, recorded UI-02 baseline) gained a tab and a prop only. Its existing native selects (type, unit, status, category) are unchanged and remain on the baseline. Owner: coding agent; review trigger: next product-form change.
- Existing classes are reused. New CSS from WP0 (`commerce-overview-tiles`, row selection) is reused; nothing new here.
- Preserved:
  - product field names and the other product create/update callers (catalog parsing runs only when `catalogFields=1`);
  - posting, permissions (Inventory write; Commerce Integrations write; sample catalog also needs Inventory write and a sandbox connection);
  - v1 `/products`, candidates and acknowledge.

## Evidence

- `packages/commerce/test/wp1-catalog.test.ts` (7):
  - publishing and parent→variants;
  - type, brand, category path, options, slug, description text;
  - variant price, inventory, swatch, inherited weight;
  - image order and URL;
  - `scope=all`; keyset paging; category-tree, brand, SKU and `updatedSince` filters;
  - by-SKU and 404 when unpublished;
  - categories, brands, attributes;
  - buffer, backorder and held stock on catalog and `/inventory`;
  - missing weight and product change events;
  - the `/connection` C5 fields and a stable ETag;
  - single-variant publishing.
- `packages/commerce/test/openapi-shape.test.ts` (1): every WP0/WP1 route is documented with responses.
- `packages/auth/test/commerce-wp1-catalog.test.ts` (9):
  - form parsing (weight, specifications, quantities, parent and variant rules, error messages);
  - migration 056 shape;
  - routes, media route and notify hooks;
  - registry-only controls;
  - sample catalog limited to sandbox with no journals.
- `pnpm typecheck` 8/8. Unit tests: commerce 53, auth 232 (+5 skipped), accounting 298, agent-bridge 162, statement-import 44.
- Not run locally: Postgres (migration 056, media route, gallery upload to MinIO, sample catalog). Staging check after deploy: see TASK_LOG.

## Rollback

Revert the commit. Migration 056 only adds columns and tables. Reverted code ignores them, and products created as variants remain normal products.
