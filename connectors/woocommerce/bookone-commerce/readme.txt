=== BookOne Commerce ===
Contributors: bookone
Requires at least: 6.4
Tested up to: 6.7
Requires PHP: 8.1
Stable tag: 1.0.0
License: GPLv2 or later

Connect WooCommerce to BookOne. BookOne remains the inventory authority.

== Description ==

Private test connector for BookOne Commerce v1.

* Setup under WooCommerce → BookOne. Paste the BookOne API base and scoped key.
* The key is stored in a WordPress option with autoload off. It is never printed to shoppers or theme files.
* HPOS (custom order tables) is declared compatible. Orders are read through WooCommerce CRUD.
* Background work uses WP-Cron hook `bookone_commerce_tick` every five minutes, plus a Repair worker button.
* Mapped products receive absolute BookOne quantities. Native Woo stock for those SKUs is overwritten by the feed so retries do not restore stale counts.
* Orders are submitted with Idempotency-Key `woo-{orderId}`. Duplicate deliveries replay the original BookOne receipt.
* Supported refunds: money-only (restock off) and physical restock (restock on).

Unsupported in v1: multi-currency, reservation checkout, bundles/kits, fractional quantities, Shopify.

== Installation ==

1. Install WooCommerce.
2. Upload the ZIP from `connectors/woocommerce/release/`.
3. Activate BookOne Commerce.
4. Open WooCommerce → BookOne, paste the sandbox key issued in BookOne Company → Commerce Integrations, and test the connection.
5. Preview mappings for a simple product and a variant, then publish stock.

== Changelog ==

= 1.0.0 =
* Initial C3 connector for BookOne 2.15.0.
