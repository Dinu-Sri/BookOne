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

    /**
     * Create Woo drafts from BookOne queued catalog candidates, then acknowledge
     * the resulting product IDs. Existing SKUs are acknowledged, never duplicated.
     */
    public static function publish_from_bookone(): void {
        $candidates = BookOne_Commerce_Client::request('GET', '/catalog/candidates');
        if (!$candidates['ok']) {
            BookOne_Commerce_Client::save(['last_error' => (string) ($candidates['error'] ?: 'Catalog candidates failed.')]);
            return;
        }
        $items = $candidates['json']['items'] ?? [];
        if (!$items) {
            BookOne_Commerce_Client::save(['last_error' => 'No queued BookOne products. Queue Publish from BookOne in Company → Commerce Integrations first.']);
            return;
        }
        $acks = [];
        foreach ($items as $item) {
            $sku = (string) ($item['sku'] ?? '');
            $bookone_id = (string) ($item['bookoneProductId'] ?? '');
            if ($sku === '' || $bookone_id === '') {
                continue;
            }
            $existing_id = wc_get_product_id_by_sku($sku);
            if ($existing_id) {
                $acks[] = [
                    'bookoneProductId' => $bookone_id,
                    'claimId' => (string) ($item['claimId'] ?? ''),
                    'externalProductId' => (string) $existing_id,
                ];
                update_post_meta($existing_id, '_bookone_product_id', $bookone_id);
                continue;
            }
            if (!class_exists('WC_Product_Simple')) {
                BookOne_Commerce_Client::save(['last_error' => 'WooCommerce product CRUD is not available.']);
                return;
            }
            $product = new WC_Product_Simple();
            $product->set_name((string) ($item['name'] ?? $sku));
            $product->set_sku($sku);
            $product->set_status('draft');
            $product->set_catalog_visibility('hidden');
            $price = (string) ($item['sellPrice'] ?? '');
            if ($price !== '') {
                $product->set_regular_price($price);
            }
            $product->set_manage_stock(true);
            $product->update_meta_data('_bookone_product_id', $bookone_id);
            $product->update_meta_data('_bookone_claim_id', (string) ($item['claimId'] ?? ''));
            $created_id = $product->save();
            if (!$created_id) {
                continue;
            }
            $acks[] = [
                'bookoneProductId' => $bookone_id,
                'claimId' => (string) ($item['claimId'] ?? ''),
                'externalProductId' => (string) $created_id,
            ];
        }
        if (!$acks) {
            BookOne_Commerce_Client::save(['last_error' => 'No Woo products were created or matched.']);
            return;
        }
        $ack = BookOne_Commerce_Client::request('POST', '/catalog/acknowledge', ['items' => $acks]);
        if (!$ack['ok']) {
            BookOne_Commerce_Client::save(['last_error' => (string) ($ack['error'] ?: 'Acknowledgement failed after Woo create.')]);
            return;
        }
        BookOne_Commerce_Client::save(['last_ok' => gmdate('c'), 'last_error' => '']);
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
