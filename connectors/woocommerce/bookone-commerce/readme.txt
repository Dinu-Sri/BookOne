=== BookOne Commerce ===
Contributors: bookone
Requires at least: 6.4
Tested up to: 6.7
Requires PHP: 8.1
Stable tag: 1.2.0
License: GPLv2 or later

Connect WooCommerce to BookOne. BookOne remains the inventory authority.

== Description ==

Private test connector for BookOne Commerce v1.

* Setup under WooCommerce → BookOne. Paste the BookOne API base and scoped key.
* The key is stored in a WordPress option with autoload off. It is never printed to shoppers or theme files.
* HPOS (custom order tables) is declared compatible. Orders are read through WooCommerce CRUD.
* Background work uses WP-Cron hook `bookone_commerce_tick` every five minutes, plus a Repair worker button.
* Mapped products receive absolute BookOne quantities. Native Woo stock for those SKUs is overwritten by the feed so retries do not restore stale counts.
* Publish from BookOne creates Woo drafts from a BookOne queue, then acknowledges the Woo product IDs. Existing SKUs are linked, not duplicated.
* Orders are submitted with Idempotency-Key `woo-{orderId}`. Duplicate deliveries replay the original BookOne receipt.
* Supported refunds: money-only (restock off) and physical restock (restock on).

Unsupported in v1: multi-currency, reservation checkout, bundles/kits, fractional quantities, Shopify.

== Installation ==

1. Install WooCommerce.
2. Upload the ZIP from `connectors/woocommerce/release/`.
3. Activate BookOne Commerce.
4. Open WooCommerce → BookOne, paste the sandbox key issued in BookOne Company → Commerce Integrations, and test the connection.
5. For an existing catalog, preview mappings then publish stock. For an empty store, queue products in BookOne and click Publish from BookOne.

== Changelog ==

= 1.2.0 =
* Publish from BookOne creates Woo draft products from queued BookOne catalog candidates.
* Existing SKUs are acknowledged instead of creating a second listing.
* BookOne GET /products stays mapped-only. Bootstrap uses /catalog/candidates and /catalog/acknowledge.

= 1.1.0 =
* Durable claimed job table with backoff, dead state and retry.
* Paid events require Woo payment evidence (`is_paid()`). COD/processing without paid stay pending.
* First order POST is not repeated for later snapshot edits. Refunds send original line references.

= 1.0.0 =
* Initial C3 connector for BookOne 2.15.0.
