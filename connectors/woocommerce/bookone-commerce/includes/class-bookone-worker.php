<?php
if (!defined('ABSPATH')) {
    exit;
}

final class BookOne_Commerce_Worker {
    public static function init(): void {
        add_action('bookone_commerce_tick', [self::class, 'tick']);
    }

    public static function enqueue(string $kind, string $key): void {
        $queue = get_option('bookone_commerce_queue', []);
        if (!is_array($queue)) {
            $queue = [];
        }
        $queue[$kind . ':' . $key] = ['kind' => $kind, 'key' => $key, 'attempts' => 0];
        update_option('bookone_commerce_queue', $queue, false);
    }

    public static function tick(bool $repair = false): void {
        $settings = BookOne_Commerce_Client::settings();
        if ($settings['pause_inbound'] === '1' && !$repair) {
            return;
        }
        $queue = get_option('bookone_commerce_queue', []);
        if (!is_array($queue) || !$queue) {
            BookOne_Commerce_Sync::pull_changes();
            return;
        }
        foreach ($queue as $id => $job) {
            $ok = self::run($job);
            if ($ok) {
                unset($queue[$id]);
            } else {
                $queue[$id]['attempts'] = (int) ($job['attempts'] ?? 0) + 1;
                if ($queue[$id]['attempts'] > 8) {
                    $queue[$id]['dead'] = 1;
                }
            }
        }
        update_option('bookone_commerce_queue', $queue, false);
        BookOne_Commerce_Sync::pull_changes();
    }

    private static function run(array $job): bool {
        $kind = $job['kind'] ?? '';
        $key = (string) ($job['key'] ?? '');
        if ($kind === 'order') {
            $order = wc_get_order((int) $key);
            if (!$order) {
                return true;
            }
            $payload = BookOne_Commerce_Orders::payload($order);
            $result = BookOne_Commerce_Client::request('POST', '/orders', $payload, [
                'Idempotency-Key' => 'woo-' . $order->get_id(),
            ]);
            if ($result['status'] === 409 && str_contains((string) $result['error'], 'different payload')) {
                $order->update_meta_data('_bookone_status', 'needs_review');
                $order->update_meta_data('_bookone_review_reason', (string) $result['error']);
                $order->save();
                return true;
            }
            if (!$result['ok']) {
                return false;
            }
            $json = $result['json'] ?? [];
            $order->update_meta_data('_bookone_status', (string) ($json['status'] ?? ''));
            $order->update_meta_data('_bookone_review_reason', (string) ($json['reviewReason'] ?? ''));
            $order->update_meta_data('_bookone_document_number', (string) ($json['documentNumber'] ?? ''));
            $order->save();
            return true;
        }
        if ($kind === 'event') {
            [$order_id, $status] = array_pad(explode(':', $key, 2), 2, '');
            $map = ['cancelled' => 'cancelled', 'completed' => 'fulfilled', 'processing' => 'paid', 'refunded' => 'refunded'];
            $event = $map[$status] ?? '';
            if ($event === '') {
                return true;
            }
            $result = BookOne_Commerce_Client::request('POST', '/orders/' . rawurlencode($order_id) . '/events', [
                'externalEventId' => 'woo-' . $order_id . '-' . $status,
                'kind' => $event,
                'effectiveAt' => gmdate('c'),
            ]);
            return $result['ok'] || $result['status'] === 404;
        }
        if ($kind === 'refund') {
            [$order_id, $refund_id] = array_pad(explode(':', $key, 2), 2, '');
            $refund = wc_get_order((int) $refund_id);
            $amount = $refund ? (string) wc_format_decimal($refund->get_amount(), 2) : '0';
            $restock = $refund ? (bool) $refund->get_restock_items() : false;
            $result = BookOne_Commerce_Client::request('POST', '/orders/' . rawurlencode($order_id) . '/events', [
                'externalEventId' => 'woo-refund-' . $refund_id,
                'kind' => 'refunded',
                'effectiveAt' => gmdate('c'),
                'amount' => $amount,
                'restock' => $restock,
                'externalRefundId' => (string) $refund_id,
            ]);
            return $result['ok'] || $result['status'] === 422;
        }
        return true;
    }
}
