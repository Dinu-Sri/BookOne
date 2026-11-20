<?php
/**
 * Plugin Name: BookOne Commerce
 * Plugin URI: https://github.com/Dinu-Sri/BookOne
 * Description: Connect WooCommerce to BookOne inventory and order intake. Credentials stay on the server.
 * Version: 1.1.0
 * Author: BookOne
 * Requires at least: 6.4
 * Requires PHP: 8.1
 * Requires Plugins: woocommerce
 * WC requires at least: 8.8
 * WC tested up to: 9.4
 * Text Domain: bookone-commerce
 */

if (!defined('ABSPATH')) {
    exit;
}

define('BOOKONE_COMMERCE_VERSION', '1.1.0');
define('BOOKONE_COMMERCE_FILE', __FILE__);
define('BOOKONE_COMMERCE_DIR', plugin_dir_path(__FILE__));

add_action('before_woocommerce_init', static function () {
    if (class_exists(\Automattic\WooCommerce\Utilities\FeaturesUtil::class)) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', BOOKONE_COMMERCE_FILE, true);
    }
});

require_once BOOKONE_COMMERCE_DIR . 'includes/class-bookone-client.php';
require_once BOOKONE_COMMERCE_DIR . 'includes/class-bookone-admin.php';
require_once BOOKONE_COMMERCE_DIR . 'includes/class-bookone-sync.php';
require_once BOOKONE_COMMERCE_DIR . 'includes/class-bookone-orders.php';
require_once BOOKONE_COMMERCE_DIR . 'includes/class-bookone-worker.php';

add_action('plugins_loaded', static function () {
    if (!class_exists('WooCommerce')) {
        return;
    }
    BookOne_Commerce_Admin::init();
    BookOne_Commerce_Sync::init();
    BookOne_Commerce_Orders::init();
    BookOne_Commerce_Worker::init();
});

register_activation_hook(__FILE__, static function () {
    BookOne_Commerce_Worker::ensure_table();
    if (!wp_next_scheduled('bookone_commerce_tick')) {
        wp_schedule_event(time() + 60, 'bookone_five_minutes', 'bookone_commerce_tick');
    }
});

register_deactivation_hook(__FILE__, static function () {
    wp_clear_scheduled_hook('bookone_commerce_tick');
});

add_filter('cron_schedules', static function ($schedules) {
    $schedules['bookone_five_minutes'] = [
        'interval' => 300,
        'display' => __('Every five minutes', 'bookone-commerce'),
    ];
    return $schedules;
});
