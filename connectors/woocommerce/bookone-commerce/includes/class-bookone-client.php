<?php
if (!defined('ABSPATH')) {
    exit;
}

final class BookOne_Commerce_Client {
    public static function settings(): array {
        $stored = get_option('bookone_commerce_settings', []);
        return wp_parse_args(is_array($stored) ? $stored : [], [
            'base_url' => '',
            'token' => '',
            'store_identity' => '',
            'pause_inbound' => '0',
            'pause_outbound' => '0',
            'manage_woo_stock' => '1',
            'checkpoint' => '',
            'last_error' => '',
            'last_ok' => '',
        ]);
    }

    public static function save(array $settings): void {
        $current = self::settings();
        if (isset($settings['token']) && $settings['token'] === '') {
            unset($settings['token']);
        }
        update_option('bookone_commerce_settings', array_merge($current, $settings), false);
    }

    public static function request(string $method, string $path, array $body = null, array $headers = []): array {
        $settings = self::settings();
        $base = rtrim((string) $settings['base_url'], '/');
        $token = (string) $settings['token'];
        if ($base === '' || $token === '') {
            return ['ok' => false, 'status' => 0, 'error' => 'Missing BookOne base URL or token.', 'json' => null];
        }
        $args = [
            'method' => $method,
            'timeout' => 20,
            'headers' => array_merge([
                'Authorization' => 'Bearer ' . $token,
                'Accept' => 'application/json',
                'Content-Type' => 'application/json',
            ], $headers),
        ];
        if ($body !== null) {
            $args['body'] = wp_json_encode($body);
        }
        $response = wp_remote_request($base . $path, $args);
        if (is_wp_error($response)) {
            return ['ok' => false, 'status' => 0, 'error' => $response->get_error_message(), 'json' => null];
        }
        $status = (int) wp_remote_retrieve_response_code($response);
        $raw = (string) wp_remote_retrieve_body($response);
        $json = json_decode($raw, true);
        return [
            'ok' => $status >= 200 && $status < 300,
            'status' => $status,
            'error' => is_array($json) ? (string) ($json['error'] ?? '') : $raw,
            'json' => is_array($json) ? $json : null,
            'raw' => $raw,
        ];
    }
}
