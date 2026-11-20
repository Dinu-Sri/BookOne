<?php
if (!defined('ABSPATH')) {
    exit;
}

final class BookOne_Commerce_Admin {
    public static function init(): void {
        add_action('admin_menu', [self::class, 'menu']);
        add_action('admin_init', [self::class, 'handle']);
        add_action('add_meta_boxes', [self::class, 'order_box']);
    }

    public static function menu(): void {
        add_submenu_page(
            'woocommerce',
            __('BookOne', 'bookone-commerce'),
            __('BookOne', 'bookone-commerce'),
            'manage_woocommerce',
            'bookone-commerce',
            [self::class, 'render']
        );
    }

    public static function handle(): void {
        if (!isset($_POST['bookone_commerce_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['bookone_commerce_nonce'])), 'bookone_commerce')) {
            return;
        }
        if (!current_user_can('manage_woocommerce')) {
            return;
        }
        $action = sanitize_text_field(wp_unslash($_POST['bookone_action'] ?? ''));
        if ($action === 'save') {
            $token = sanitize_text_field(wp_unslash($_POST['token'] ?? ''));
            $payload = [
                'base_url' => esc_url_raw(wp_unslash($_POST['base_url'] ?? '')),
                'store_identity' => sanitize_text_field(wp_unslash($_POST['store_identity'] ?? '')),
            ];
            if ($token !== '') {
                $payload['token'] = $token;
            }
            BookOne_Commerce_Client::save($payload);
            add_settings_error('bookone_commerce', 'saved', __('Connection saved. The token is stored on the server and is never sent to shoppers.', 'bookone-commerce'), 'updated');
        }
        if ($action === 'test') {
            $result = BookOne_Commerce_Client::request('GET', '/connection');
            BookOne_Commerce_Client::save([
                'last_ok' => $result['ok'] ? gmdate('c') : '',
                'last_error' => $result['ok'] ? '' : (string) $result['error'],
            ]);
        }
        if ($action === 'preview_map') {
            BookOne_Commerce_Sync::preview_and_apply();
        }
        if ($action === 'publish_stock') {
            BookOne_Commerce_Sync::publish_stock();
        }
        if ($action === 'repair') {
            BookOne_Commerce_Worker::tick(true);
        }
        if ($action === 'retry_dead') {
            $job_key = sanitize_text_field(wp_unslash($_POST['job_key'] ?? ''));
            if ($job_key !== '') {
                BookOne_Commerce_Worker::retry_dead($job_key);
            }
        }
    }

    public static function render(): void {
        if (!current_user_can('manage_woocommerce')) {
            return;
        }
        $s = BookOne_Commerce_Client::settings();
        $has_token = $s['token'] !== '';
        echo '<div class="wrap"><h1>BookOne Commerce</h1>';
        settings_errors('bookone_commerce');
        echo '<p>Install, paste the BookOne sandbox key, test the connection, preview SKU mapping, then publish stock. Do not put the token in a theme file.</p>';
        echo '<form method="post">';
        wp_nonce_field('bookone_commerce', 'bookone_commerce_nonce');
        echo '<table class="form-table"><tr><th>BookOne API base</th><td><input class="regular-text" name="base_url" value="' . esc_attr($s['base_url']) . '" placeholder="https://example/api/commerce/v1" /></td></tr>';
        echo '<tr><th>Commerce key</th><td><input class="regular-text" type="password" name="token" value="" autocomplete="new-password" placeholder="' . ($has_token ? esc_attr__('Stored on the server', 'bookone-commerce') : '') . '" />';
        echo '<p class="description">Shown once in BookOne. WooCommerce keeps it in an autoload-off option.</p></td></tr>';
        echo '<tr><th>Store identity</th><td><input class="regular-text" name="store_identity" value="' . esc_attr($s['store_identity']) . '" /></td></tr></table>';
        echo '<input type="hidden" name="bookone_action" value="save" />';
        submit_button(__('Save connection', 'bookone-commerce'));
        echo '</form>';
        echo '<form method="post" style="display:inline">';
        wp_nonce_field('bookone_commerce', 'bookone_commerce_nonce');
        echo '<input type="hidden" name="bookone_action" value="test" />';
        submit_button(__('Test connection', 'bookone-commerce'), 'secondary', 'submit', false);
        echo '</form> ';
        echo '<form method="post" style="display:inline">';
        wp_nonce_field('bookone_commerce', 'bookone_commerce_nonce');
        echo '<input type="hidden" name="bookone_action" value="preview_map" />';
        submit_button(__('Preview and apply mappings', 'bookone-commerce'), 'secondary', 'submit', false);
        echo '</form> ';
        echo '<form method="post" style="display:inline">';
        wp_nonce_field('bookone_commerce', 'bookone_commerce_nonce');
        echo '<input type="hidden" name="bookone_action" value="publish_stock" />';
        submit_button(__('Publish stock', 'bookone-commerce'), 'secondary', 'submit', false);
        echo '</form> ';
        echo '<form method="post" style="display:inline">';
        wp_nonce_field('bookone_commerce', 'bookone_commerce_nonce');
        echo '<input type="hidden" name="bookone_action" value="repair" />';
        submit_button(__('Repair worker', 'bookone-commerce'), 'secondary', 'submit', false);
        echo '</form>';
        echo '<p>Last success: ' . esc_html($s['last_ok'] ?: '—') . ' · Last error: ' . esc_html($s['last_error'] ?: '—') . '</p>';
        echo '<p>Worker hook <code>bookone_commerce_tick</code>. Next run: ' . esc_html((string) wp_next_scheduled('bookone_commerce_tick')) . '</p>';
        echo '<p>Supported: WordPress 6.4–6.7, WooCommerce 8.8–9.4 with HPOS, PHP 8.1+. Payment evidence uses Woo <code>is_paid()</code>. COD and processing without paid stay pending.</p>';
        $dead = BookOne_Commerce_Worker::dead_jobs();
        echo '<h2>Dead jobs</h2>';
        if (!$dead) {
            echo '<p>None.</p>';
        } else {
            echo '<table class="widefat"><thead><tr><th>Job</th><th>Attempts</th><th>Error</th><th></th></tr></thead><tbody>';
            foreach ($dead as $job) {
                echo '<tr><td>' . esc_html((string) $job['job_key']) . '</td><td>' . esc_html((string) $job['attempts']) . '</td><td>' . esc_html((string) ($job['last_error'] ?? '')) . '</td><td>';
                echo '<form method="post" style="display:inline">';
                wp_nonce_field('bookone_commerce', 'bookone_commerce_nonce');
                echo '<input type="hidden" name="bookone_action" value="retry_dead" />';
                echo '<input type="hidden" name="job_key" value="' . esc_attr((string) $job['job_key']) . '" />';
                submit_button(__('Retry', 'bookone-commerce'), 'secondary', 'submit', false);
                echo '</form></td></tr>';
            }
            echo '</tbody></table>';
        }
        echo '</div>';
    }

    public static function order_box(): void {
        $screen = class_exists(\Automattic\WooCommerce\Utilities\OrderUtil::class)
            && \Automattic\WooCommerce\Utilities\OrderUtil::custom_orders_table_usage_is_enabled()
            ? wc_get_page_screen_id('shop-order')
            : 'shop_order';
        add_meta_box('bookone-commerce-status', __('BookOne', 'bookone-commerce'), [self::class, 'render_order_box'], $screen, 'side');
    }

    public static function render_order_box($post_or_order): void {
        $order = $post_or_order instanceof WC_Order ? $post_or_order : wc_get_order($post_or_order->ID);
        if (!$order) {
            return;
        }
        echo '<p>Status: ' . esc_html((string) $order->get_meta('_bookone_status')) . '</p>';
        echo '<p>Reason: ' . esc_html((string) $order->get_meta('_bookone_review_reason')) . '</p>';
        echo '<p>Document: ' . esc_html((string) $order->get_meta('_bookone_document_number')) . '</p>';
    }
}
