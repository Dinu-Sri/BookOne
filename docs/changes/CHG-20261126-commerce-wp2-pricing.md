# CHG-20261126-commerce-wp2-pricing — Price lists, sales, tiers, /pricing (v2.22.0)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-26
- Product version and base: 2.22.0, pushed directly to `master` (owner-approved), based on `0d632f2` / v2.21.1
- Source: owner "start WP2" on the Watercolor.LK brief (WP2: pricing — PR1–PR6, PR8, C2, `priceExport`). No QA finding; no external UX/UXW/WB ID. Prior QA reference: Dinu-Sri/bookone-qa PR #129 at `91d7ce8e698517b2c50daeeb552ecd56104f5741`.
- Website release note: [docs/commerce/RELEASE-WP2.md](../commerce/RELEASE-WP2.md)

## Data (migration 057, additive and idempotent)

- `price_lists` (tenant, name, currency, customer_group, voided_at) and `price_list_items` (list, product, price, compare_at_price, sale_price, sale_starts_at, sale_ends_at, tiers jsonb), unique `(price_list_id, product_id)`, tenant-isolation RLS on both (DO block, re-runnable).
- `commerce_connections.channel_settings` gains `priceListId` and `priceTickAt` (jsonb keys, no DDL).

## Behaviour

- **Pricing rules** (`packages/commerce/src/pricing.ts`, pure):
  - `channelPrice`: list entry price or the sell price;
  - `compareAtPrice` only when higher;
  - `sale` with `active` at read time;
  - `tiers`;
  - `effectivePrice`.

  Also `unitPriceFor(price, qty)`, `pickPriceList` (customer-group list first, else the channel list) and `parseTiers`.
- **Catalog.** Every `price` object uses the channel list. `customerGroup` is supported on list and by-SKU reads.
- **API.**
  - `GET /pricing?sku=` (1–100, published SKUs only, `missing` for the rest).
  - `/connection.priceListId` and the capabilities `priceExport`, `priceLists`, `salePrices`, `priceTiers` and `customerGroupPricing` are now true.
  - `changeKinds` includes `price`.
- **Change feed `price`.** Emitted:
  - on list price save (only channels selling at that list);
  - on channel list switch and list archive (every published SKU of that channel);
  - on product sell-price edit (`notifyCommerce(..., 'price')` after the product update);
  - when a sale starts or ends, checked on each `/changes` poll from `priceTickAt` (`saleBoundaryProductIds`).
- **Validate (PR8).** Adds a non-blocking `PRICE_MISMATCH:<sku>` issue with `expected`/`received` (tier-aware); `ok` is unchanged. Submit and posting are unchanged.
- **Screen.** New Commerce **Prices** tab (`components/commerce/commerce-prices.tsx`), placed after Products:
  - the channel's price list;
  - create and archive lists, with a customer group;
  - per-SKU editor: list price, was price, sale price with DateField from/to (whole days in the company timezone via `lib/zoned-day.ts`), and tiers text;
  - bulk "sell price ±%" and clear.

  Actions: `savePriceListFromForm`, `setChannelPriceListFromForm`, `savePriceEntryFromForm` and `bulkPriceListFromForm`. All need Commerce Integrations write and are audited (`price_list.save/archive/prices`, `connection.price_list`). Redirects keep `tab=prices&list=`.
- **Docs.**
  - `/docs/developers/custom-website` gets a Prices section, the `price` row in the feed table, a PRICE_MISMATCH note and a changelog entry.
  - `/docs/developers/catalog` gets a Prices section, `customerGroup`, `/pricing`, and drops price lists from "Not yet available".
  - `/docs/inventory/online-store` gets §5 Prices for websites.
  - OpenAPI 1.3.0 adds `/pricing`, the extended CatalogPrice, `customerGroup` params, the `price` kind and the object-shaped validate `issues` (previously mis-documented as strings).

## UI/UX compatibility

- Registry controls only: `SelectField`, `TextField`, `SearchField`, `DateField`, and shared `Button`/`Badge`/`ConfirmDialog`. Archive goes through `withFormPending`; the other writes are server-action forms with shared `Button type="submit"`. No native select or date input (locked by `packages/auth/test/commerce-wp2-pricing.test.ts`).
- Reuses `commerce-card`, `commerce-table`, `commerce-table-scroll`, `form-grid`, `tr.is-selected`. No new CSS.
- Shared consumers: `company-commerce.tsx` gets one tab id and one prop; existing tabs, keyboard tab order (Overview → Orders → Products, End → Activity) and CoreGuard selectors are unchanged.
- Preserved:
  - posting and order acceptance (prices are never enforced);
  - the BookOne sell price when no list is set (existing channels behave exactly as in 2.21);
  - permissions and tenant RLS.

## Evidence

- `packages/commerce/test/wp2-pricing.test.ts` (10):
  - sell-price default;
  - list, compare-at, active sale and tiers;
  - hidden lower compare-at;
  - customer-group pick;
  - tier parsing;
  - channel list → `/pricing` and catalog;
  - `price` change events;
  - PRICE_MISMATCH non-blocking;
  - validation and archive fallback;
  - the 1–100 SKU limit.
- `packages/commerce/test/openapi-shape.test.ts`: `/pricing`, PRICE_MISMATCH, version 1.3.0.
- `packages/auth/test/commerce-wp2-pricing.test.ts` (5):
  - timezone day boundaries;
  - migration 057 shape;
  - route;
  - registry-only Prices tab and wiring;
  - sell-price notify.
- Commerce tests 63 passing; web typecheck passing (full results in TASK_LOG).
- Not run locally: Postgres (migration 057, pg store price queries). Staging check after deploy: see TASK_LOG.

## Rollback

Revert the commit. Migration 057 only adds tables, which reverted code ignores. Channels fall back to the BookOne sell price (the `priceListId` key in `channel_settings` is ignored).
