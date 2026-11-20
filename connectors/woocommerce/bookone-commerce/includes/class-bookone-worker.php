<?php
if (!defined('ABSPATH')) {
    exit;
}

final class BookOne_Commerce_Worker {
    public static function init(): void {
        add_action('bookone_commerce_tick', [self::class, 'tick']);
        add_action('init', [self::class, 'ensure_table']);
    }

    public static function table(): string {
        global $wpdb;
        return $wpdb->prefix . 'bookone_commerce_jobs';
    }

    public static function ensure_table(): void {
        global $wpdb;
        $table = self::table();
        $found = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table));
        if ($found === $table) {
            return;
        }
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $charset = $wpdb->get_charset_collate();
        dbDelta("CREATE TABLE {$table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            job_key varchar(191) NOT NULL,
            kind varchar(32) NOT NULL,
            payload longtext NULL,
            status varchar(20) NOT NULL DEFAULT 'pending',
            attempts int(11) NOT NULL DEFAULT 0,
            available_at datetime NOT NULL,
            last_error text NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY job_key (job_key),
            KEY status_available (status, available_at)
        ) {$charset};");
    }

    public static function enqueue(string $kind, string $key): void {
        global $wpdb;
        self::ensure_table();
        $table = self::table();
        $now = gmdate('Y-m-d H:i:s');
        $job_key = $kind . ':' . $key;
        $wpdb->query(
            $wpdb->prepare(
                "INSERT INTO {$table} (job_key, kind, payload, status, attempts, available_at)
                 VALUES (%s, %s, %s, 'pending', 0, %s)
                 ON DUPLICATE KEY UPDATE
                    kind = VALUES(kind),
                    payload = VALUES(payload),
                    status = IF(status = 'dead', status, IF(status = 'processing', status, 'pending')),
                    available_at = IF(status = 'dead', available_at, VALUES(available_at))",
                $job_key,
                $kind,
                wp_json_encode(['key' => $key]),
                $now
            )
        );
    }

    public static function dead_jobs(): array {
        global $wpdb;
        self::ensure_table();
        $table = self::table();
        $rows = $wpdb->get_results("SELECT job_key, kind, attempts, last_error, available_at FROM {$table} WHERE status = 'dead' ORDER BY id DESC LIMIT 50", ARRAY_A);
        return is_array($rows) ? $rows : [];
    }

    public static function retry_dead(string $job_key): void {
        global $wpdb;
        self::ensure_table();
        $table = self::table();
        $wpdb->update(
            $table,
            [
                'status' => 'pending',
                'available_at' => gmdate('Y-m-d H:i:s'),
                'last_error' => null,
            ],
            ['job_key' => $job_key, 'status' => 'dead']
        );
    }

    public static function tick(bool $repair = false): void {
        global $wpdb;
        self::ensure_table();
        self::migrate_option_queue();
        $settings = BookOne_Commerce_Client::settings();
        if ($settings['pause_inbound'] === '1' && !$repair) {
            BookOne_Commerce_Sync::pull_changes();
            return;
        }
        $table = self::table();
        $now = gmdate('Y-m-d H:i:s');
        $jobs = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE status = 'pending' AND available_at <= %s ORDER BY id ASC LIMIT 20",
                $now
            ),
            ARRAY_A
        );
        foreach (is_array($jobs) ? $jobs : [] as $job) {
            $claimed = $wpdb->query(
                $wpdb->prepare(
                    "UPDATE {$table} SET status = 'processing' WHERE id = %d AND status = 'pending'",
                    (int) $job['id']
                )
            );
            if (!$claimed) {
                continue;
            }
            [$outcome, $error] = self::run($job);
            if ($outcome === 'done') {
                $wpdb->delete($table, ['id' => (int) $job['id']]);
                continue;
            }
            $attempts = (int) ($job['attempts'] ?? 0) + 1;
            $dead = $outcome === 'dead' || $attempts > 8;
            $delay = min(3600, 30 * (2 ** max(0, $attempts - 1)));
            $wpdb->update(
                $table,
                [
                    'status' => $dead ? 'dead' : 'pending',
                    'attempts' => $attempts,
                    'available_at' => gmdate('Y-m-d H:i:s', time() + $delay),
                    'last_error' => substr((string) $error, 0, 500),
                ],
                ['id' => (int) $job['id']]
            );
        }
        BookOne_Commerce_Sync::pull_changes();
    }

    private static function migrate_option_queue(): void {
        $queue = get_option('bookone_commerce_queue', []);
        if (!is_array($queue) || !$queue) {
            return;
        }
        foreach ($queue as $job) {
            if (!is_array($job)) {
                continue;
            }
            self::enqueue((string) ($job['kind'] ?? ''), (string) ($job['key'] ?? ''));
        }
        delete_option('bookone_commerce_queue');
    }

    /**
     * @return array{0: 'done'|'retry'|'dead', 1: string}
     */
    private static function run(array $job): array {
        $kind = $job['kind'] ?? '';
        $payload = json_decode((string) ($job['payload'] ?? ''), true);
        $key = is_array($payload) ? (string) ($payload['key'] ?? '') : '';
        if ($key === '') {
            $parts = explode(':', (string) ($job['job_key'] ?? ''), 2);
            $key = $parts[1] ?? '';
        }
        if ($kind === 'order') {
            $order = wc_get_order((int) $key);
            if (!$order) {
                return ['retry', 'Order is not available yet.'];
            }
            if ($order->get_meta('_bookone_submitted') === '1') {
                return ['done', ''];
            }
            $body = BookOne_Commerce_Orders::payload($order);
            $result = BookOne_Commerce_Client::request('POST', '/orders', $body, [
                'Idempotency-Key' => 'woo-' . $order->get_id(),
            ]);
            if ($result['status'] === 409 && str_contains((string) $result['error'], 'different payload')) {
                $order->update_meta_data('_bookone_status', 'needs_review');
                $order->update_meta_data('_bookone_review_reason', (string) $result['error']);
                $order->save();
                return ['dead', (string) $result['error']];
            }
            if (!$result['ok']) {
                $error = (string) ($result['error'] ?? 'Order POST failed');
                return [((int) $result['status'] === 422) ? 'dead' : 'retry', $error];
            }
            $json = $result['json'] ?? [];
            $order->update_meta_data('_bookone_submitted', '1');
            $order->update_meta_data('_bookone_status', (string) ($json['status'] ?? ''));
            $order->update_meta_data('_bookone_review_reason', (string) ($json['reviewReason'] ?? ''));
            $order->update_meta_data('_bookone_document_number', (string) ($json['documentNumber'] ?? ''));
            $order->save();
            return ['done', ''];
        }
        if ($kind === 'event') {
            [$order_id, $status] = array_pad(explode(':', $key, 2), 2, '');
            $map = ['cancelled' => 'cancelled', 'completed' => 'fulfilled', 'refunded' => 'refunded'];
            $event = $map[$status] ?? '';
            if ($event === '') {
                return ['dead', 'Unsupported lifecycle status ' . $status];
            }
            $order = wc_get_order((int) $order_id);
            if (!$order) {
                return ['retry', 'Order is not available yet.'];
            }
            $body = [
                'externalEventId' => 'woo-' . $order_id . '-' . $status,
                'kind' => $event,
                'sourceVersion' => (string) $order->get_date_modified()?->getTimestamp(),
                'effectiveAt' => gmdate('c'),
            ];
            $result = BookOne_Commerce_Client::request('POST', '/orders/' . rawurlencode($order_id) . '/events', $body);
            if ((int) $result['status'] === 404) {
                return ['retry', 'Order receipt is not in BookOne yet.'];
            }
            if (!$result['ok']) {
                $error = (string) ($result['error'] ?? 'Event POST failed');
                return [((int) $result['status'] === 422) ? 'dead' : 'retry', $error];
            }
            return ['done', ''];
        }
        if ($kind === 'refund') {
            [$order_id, $refund_id] = array_pad(explode(':', $key, 2), 2, '');
            $refund = wc_get_order((int) $refund_id);
            if (!$refund) {
                return ['retry', 'Refund is not available yet.'];
            }
            $lines = [];
            foreach ($refund->get_items() as $item) {
                $original = $item->get_meta('_refunded_item_id');
                $qty = abs((int) $item->get_quantity());
                if (!$original || $qty <= 0) {
                    continue;
                }
                $lines[] = [
                    'externalLineId' => (string) $original,
                    'quantity' => (string) $qty,
                    'amount' => (string) wc_format_decimal(abs((float) $item->get_total()), 2),
                ];
            }
            $restock = (bool) $refund->get_restock_items();
            $body = [
                'externalEventId' => 'woo-refund-' . $refund_id,
                'kind' => 'refunded',
                'effectiveAt' => gmdate('c'),
                'amount' => (string) wc_format_decimal($refund->get_amount(), 2),
                'restock' => $restock,
                'externalRefundId' => (string) $refund_id,
            ];
            if ($lines) {
                $body['lines'] = $lines;
            }
            $result = BookOne_Commerce_Client::request('POST', '/orders/' . rawurlencode($order_id) . '/events', $body);
            if ((int) $result['status'] === 404) {
                return ['retry', 'Order receipt is not in BookOne yet.'];
            }
            if (!$result['ok']) {
                $error = (string) ($result['error'] ?? 'Refund POST failed');
                return [((int) $result['status'] === 422) ? 'dead' : 'retry', $error];
            }
            return ['done', ''];
        }
        if ($kind === 'paid') {
            $order = wc_get_order((int) $key);
            if (!$order) {
                return ['retry', 'Order is not available yet.'];
            }
            if (!$order->is_paid()) {
                return ['retry', 'Payment evidence is not present.'];
            }
            $result = BookOne_Commerce_Client::request('POST', '/orders/' . rawurlencode((string) $order->get_id()) . '/events', [
                'externalEventId' => 'woo-' . $order->get_id() . '-paid',
                'kind' => 'paid',
                'sourceVersion' => (string) $order->get_date_modified()?->getTimestamp(),
                'effectiveAt' => gmdate('c'),
            ]);
            if ((int) $result['status'] === 404) {
                return ['retry', 'Order receipt is not in BookOne yet.'];
            }
            if (!$result['ok']) {
                $error = (string) ($result['error'] ?? 'Paid event failed');
                return [((int) $result['status'] === 422) ? 'dead' : 'retry', $error];
            }
            return ['done', ''];
        }
        return ['dead', 'Unknown job kind'];
    }
}
