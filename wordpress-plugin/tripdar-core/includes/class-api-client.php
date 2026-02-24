<?php
/**
 * Tripdar API Client - Shared HTTP client for tripd.ar API
 */

if (!defined('ABSPATH')) exit;

class Tripdar_API_Client {

    protected $cache;

    public function __construct() {
        $this->cache = tripdar_cache();
    }

    public function get_api_key() {
        return get_option('tripdar_api_key', '');
    }

    public function request($endpoint, $method = 'GET', $body = null, $cache_duration = 0) {
        $url = TRIPDAR_API_BASE . $endpoint;

        if ($method === 'GET' && $cache_duration > 0) {
            $cache_key = $this->cache->make_key('api', [$endpoint, $method]);
            $cached = $this->cache->get($cache_key);
            if ($cached !== false) {
                return $cached;
            }
        }

        $api_key = $this->get_api_key();
        $args = [
            'method'  => $method,
            'timeout' => 15,
            'headers' => [
                'Content-Type' => 'application/json',
                'Accept'       => 'application/json',
            ],
        ];

        if (!empty($api_key)) {
            $args['headers']['Authorization'] = 'Bearer ' . $api_key;
        }

        if ($body !== null && $method !== 'GET') {
            $args['body'] = wp_json_encode($body);
        }

        $response = wp_remote_request($url, $args);

        if (is_wp_error($response)) {
            error_log('Tripdar API Error: ' . $response->get_error_message());
            return [
                'success' => false,
                'error' => [
                    'code' => 'REQUEST_FAILED',
                    'message' => $response->get_error_message(),
                ],
            ];
        }

        $status = wp_remote_retrieve_response_code($response);
        $data = json_decode(wp_remote_retrieve_body($response), true);

        if ($status === 429) {
            $retry_after = wp_remote_retrieve_header($response, 'retry-after');
            error_log("Tripdar API rate limited. Retry after: " . ($retry_after ?: '60') . "s");
            return [
                'success' => false,
                'error' => [
                    'code' => 'RATE_LIMITED',
                    'message' => 'Rate limit exceeded. Retry after ' . ($retry_after ?: '60') . ' seconds.',
                ],
            ];
        }

        if ($status >= 400) {
            return [
                'success' => false,
                'error' => $data['error'] ?? [
                    'code' => 'HTTP_' . $status,
                    'message' => 'API returned status ' . $status,
                ],
            ];
        }

        $result = $data ?: ['success' => true];

        if ($method === 'GET' && $cache_duration > 0 && isset($result['success']) && $result['success']) {
            $this->cache->set($cache_key, $result, $cache_duration);
        }

        return $result;
    }

    public function get($endpoint, $cache_duration = 0) {
        return $this->request($endpoint, 'GET', null, $cache_duration);
    }

    public function post($endpoint, $body = []) {
        return $this->request($endpoint, 'POST', $body, 0);
    }

    public function put($endpoint, $body = []) {
        return $this->request($endpoint, 'PUT', $body, 0);
    }

    public function test_connection() {
        return $this->get('/strains?page=1&pageSize=1', 0);
    }
}
