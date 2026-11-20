<?php
if (!defined('ABSPATH')) {
    exit;
}

final class BookOne_Commerce_Sync {
    public static function init(): void {
        add_action('bookone_commerce_tick', [self::class, 'pull_changes']);
    }

    public static function preview_and_apply(): void {
        $catalog = BookOne_Commerce_Client::request('GET', '/products');
        if (!$catalog['ok'] || empty($catalog['json']['items'])) {
            BookOne_Commerce_Client::save(['last_error' => $catalog['error'] ?: 'No mapped products.']);
            return;
        }
        foreach ($catalog['json']['items'] as $item) {
            $sku = (string) ($item['sku'] ?? '');
            if ($sku === '') {
                continue;
            }
            $product_id = wc_get_product_id_by_sku($sku);
            if (!$product_id) {
                continue;
            }
            update_post_meta($product_id, '_bookone_product_id', (string) $item['id']);
            update_post_meta($product_id, '_bookone_revision', (string) ($item['revision'] ?? '0'));
        }
        BookOne_Commerce_Client::save(['last_ok' => gmdate('c'), 'last_error' => '']);
    }

    public static function publish_stock(): void {
        $inventory = BookOne_Commerce_Client::request('GET', '/inventory');
        if (!$inventory['ok']) {
            BookOne_Commerce_Client::save(['last_error' => (string) $inventory['error']]);
            return;
        }
        self::apply_inventory($inventory['json']['items'] ?? []);
    }

    public static function pull_changes(): void {
        $settings = BookOne_Commerce_Client::settings();
        if ($settings['pause_outbound'] === '1') {
            return;
        }
        $cursor = $settings['checkpoint'];
        $path = '/changes' . ($cursor ? ('?cursor=' . rawurlencode($cursor)) : '');
        $result = BookOne_Commerce_Client::request('GET', $path);
        if (!$result['ok']) {
            if (($result['json']['code'] ?? '') === 'CURSOR_EXPIRED') {
                BookOne_Commerce_Client::save(['checkpoint' => '']);
                self::publish_stock();
            }
            return;
        }
        foreach ($result['json']['items'] ?? [] as $change) {
            if (($change['kind'] ?? '') === 'inventory') {
                self::apply_inventory([$change['payload'] ?? []]);
            }
        }
        if (!empty($result['json']['nextCursor'])) {
            BookOne_Commerce_Client::save(['checkpoint' => (string) $result['json']['nextCursor']]);
        }
    }

    public static function apply_inventory(array $items): void {
        foreach ($items as $item) {
            $sku = (string) ($item['sku'] ?? '');
            if ($sku === '') {
                continue;
            }
            $product_id = wc_get_product_id_by_sku($sku);
            if (!$product_id) {
                continue;
            }
            $product = wc_get_product($product_id);
            if (!$product) {
                continue;
            }
            $revision = (int) ($item['revision'] ?? 0);
            $previous = (int) $product->get_meta('_bookone_stock_revision');
            if ($revision && $previous && $revision < $previous) {
                continue;
            }
            $qty = (string) ($item['quantity'] ?? '0');
            $product->set_manage_stock(true);
            $product->set_stock_quantity((float) $qty);
            $product->set_stock_status(((float) $qty) > 0 ? 'instock' : 'outofstock');
            $product->update_meta_data('_bookone_stock_revision', (string) $revision);
            $product->save();
        }
    }
}
