<?php
if (!defined('ABSPATH')) {
    exit;
}

final class BookOne_Commerce_Orders {
    public static function init(): void {
        add_action('woocommerce_new_order', [self::class, 'queue_new_order'], 20, 2);
        add_action('woocommerce_order_status_changed', [self::class, 'queue_status'], 20, 4);
        add_action('woocommerce_order_refunded', [self::class, 'queue_refund'], 20, 2);
        add_action('woocommerce_payment_complete', [self::class, 'queue_paid'], 20, 1);
    }

    public static function queue_new_order($order_id, $order = null): void {
        $order = $order instanceof WC_Order ? $order : wc_get_order($order_id);
        if (!$order) {
            return;
        }
        if ($order->get_meta('_bookone_origin') === 'bookone') {
            return;
        }
        if ($order->get_meta('_bookone_submitted') === '1') {
            return;
        }
        BookOne_Commerce_Worker::enqueue('order', (string) $order->get_id());
        if ($order->is_paid()) {
            BookOne_Commerce_Worker::enqueue('paid', (string) $order->get_id());
        }
    }

    public static function queue_paid($order_id): void {
        $order = wc_get_order($order_id);
        if (!$order || $order->get_meta('_bookone_origin') === 'bookone') {
            return;
        }
        if (!$order->is_paid()) {
            return;
        }
        BookOne_Commerce_Worker::enqueue('paid', (string) $order->get_id());
    }

    public static function queue_status($order_id, $from, $to, $order): void {
        unset($from);
        $order = $order instanceof WC_Order ? $order : wc_get_order($order_id);
        if (!$order || $order->get_meta('_bookone_origin') === 'bookone') {
            return;
        }
        if (in_array($to, ['cancelled', 'completed', 'refunded'], true)) {
            BookOne_Commerce_Worker::enqueue('event', (string) $order->get_id() . ':' . $to);
        }
        if ($to === 'processing' && $order->is_paid()) {
            BookOne_Commerce_Worker::enqueue('paid', (string) $order->get_id());
        }
    }

    public static function queue_refund($order_id, $refund_id): void {
        BookOne_Commerce_Worker::enqueue('refund', (string) $order_id . ':' . (string) $refund_id);
    }

    public static function payload(WC_Order $order): array {
        $lines = [];
        foreach ($order->get_items() as $item_id => $item) {
            $product = $item->get_product();
            $discount = (float) $item->get_subtotal() - (float) $item->get_total();
            $lines[] = [
                'externalLineId' => (string) $item_id,
                'sku' => $product ? (string) $product->get_sku() : '',
                'quantity' => (string) (int) $item->get_quantity(),
                'unitPrice' => (string) wc_format_decimal($order->get_item_subtotal($item, false, false), 2),
                'discountAmount' => (string) wc_format_decimal(max(0, $discount), 2),
                'taxAmount' => (string) wc_format_decimal($item->get_total_tax(), 2),
                'description' => $item->get_name(),
            ];
        }
        $paid = $order->is_paid();
        $failed = in_array($order->get_status(), ['failed', 'cancelled'], true) && !$paid;
        return [
            'externalId' => (string) $order->get_id(),
            'currency' => $order->get_currency(),
            'placedAt' => gmdate('c', $order->get_date_created() ? $order->get_date_created()->getTimestamp() : time()),
            'sourceTimezone' => wp_timezone_string(),
            'sourceVersion' => (string) $order->get_date_modified()?->getTimestamp(),
            'customer' => [
                'name' => trim($order->get_formatted_billing_full_name()) ?: 'WooCommerce customer',
                'email' => $order->get_billing_email(),
            ],
            'lines' => $lines,
            'shippingAmount' => (string) wc_format_decimal($order->get_shipping_total(), 2),
            'discountAmount' => (string) wc_format_decimal($order->get_discount_total(), 2),
            'taxAmount' => (string) wc_format_decimal($order->get_total_tax(), 2),
            'total' => (string) wc_format_decimal($order->get_total(), 2),
            'payment' => [
                'status' => $paid ? 'paid' : ($failed ? 'failed' : 'pending'),
                'method' => $order->get_payment_method(),
                'amount' => (string) wc_format_decimal($order->get_total(), 2),
            ],
        ];
    }
}
