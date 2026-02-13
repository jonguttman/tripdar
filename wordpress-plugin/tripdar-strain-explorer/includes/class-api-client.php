<?php
/**
 * Tripdar API Client
 *
 * Handles all communication with the Tripdar API with built-in caching.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Tripdar_API_Client {

    /**
     * Cache durations (in seconds)
     */
    const CACHE_STRAIN_LIST = 300;    // 5 minutes
    const CACHE_STRAIN_DETAIL = 600;  // 10 minutes
    const CACHE_QUIZ_QUESTIONS = 3600; // 1 hour
    const CACHE_SURVEY_QUESTIONS = 3600; // 1 hour

    /**
     * Get API key
     */
    private function get_api_key() {
        return get_option('tripdar_api_key', '');
    }

    /**
     * Get cache duration multiplier from settings
     */
    private function get_cache_multiplier() {
        $minutes = intval(get_option('tripdar_cache_duration', 5));
        return max(1, $minutes) * 60; // Convert to seconds
    }

    /**
     * Make authenticated API request
     */
    private function request($endpoint, $method = 'GET', $body = null) {
        $api_key = $this->get_api_key();

        if (empty($api_key)) {
            return [
                'success' => false,
                'error' => ['code' => 'NO_API_KEY', 'message' => 'Tripdar API key not configured']
            ];
        }

        $args = [
            'method' => $method,
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
                'Accept' => 'application/json',
                'Content-Type' => 'application/json',
            ],
            'timeout' => 15,
        ];

        if ($body !== null && $method !== 'GET') {
            $args['body'] = json_encode($body);
        }

        $url = TRIPDAR_API_BASE . $endpoint;
        $response = wp_remote_request($url, $args);

        if (is_wp_error($response)) {
            error_log('Tripdar API Error: ' . $response->get_error_message());
            return [
                'success' => false,
                'error' => ['code' => 'REQUEST_ERROR', 'message' => $response->get_error_message()]
            ];
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);

        // Handle rate limiting
        if ($code === 429) {
            $retry_after = wp_remote_retrieve_header($response, 'retry-after');
            error_log("Tripdar API rate limited. Retry after: {$retry_after}s");
            return [
                'success' => false,
                'error' => ['code' => 'RATE_LIMITED', 'message' => 'Rate limit exceeded']
            ];
        }

        return $data;
    }

    /**
     * Get paginated strain list with caching
     */
    public function get_strains($page = 1, $per_page = 12, $filters = []) {
        $cache_key = 'tripdar_strains_' . md5(serialize([$page, $per_page, $filters]));

        // Try cache first
        $cached = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        // Build query
        $query = http_build_query(array_merge([
            'page' => $page,
            'pageSize' => $per_page,
        ], $filters));

        // Fetch from API
        $response = $this->request("/strains?{$query}");

        if ($response && isset($response['success']) && $response['success']) {
            $cache_duration = min(self::CACHE_STRAIN_LIST, $this->get_cache_multiplier());
            set_transient($cache_key, $response, $cache_duration);
        }

        return $response;
    }

    /**
     * Get single strain with caching
     */
    public function get_strain($slug) {
        $cache_key = 'tripdar_strain_' . sanitize_key($slug);

        $cached = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        $response = $this->request("/strains/{$slug}");

        if ($response && isset($response['success']) && $response['success']) {
            $cache_duration = min(self::CACHE_STRAIN_DETAIL, $this->get_cache_multiplier());
            set_transient($cache_key, $response, $cache_duration);
        }

        return $response;
    }

    /**
     * Get strain visualization URL
     */
    public function get_visualization($slug) {
        $cache_key = 'tripdar_viz_' . sanitize_key($slug);

        $cached = get_transient($cache_key);
        if ($cached !== false) {
            // Check if URL is still valid (has at least 10 min left)
            if (isset($cached['data']['expiresAt'])) {
                $expires = strtotime($cached['data']['expiresAt']);
                if ($expires > time() + 600) {
                    return $cached;
                }
            }
            // URL expiring soon, fetch fresh
            delete_transient($cache_key);
        }

        $response = $this->request("/strains/{$slug}/visualization");

        if ($response && isset($response['success']) && $response['success']) {
            // Cache for 30 minutes (URLs expire in 60 min)
            set_transient($cache_key, $response, 1800);
        }

        return $response;
    }

    /**
     * Get quiz questions
     */
    public function get_quiz_questions() {
        $cache_key = 'tripdar_quiz_questions';

        $cached = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        $response = $this->request('/quiz');

        if ($response && isset($response['success']) && $response['success']) {
            set_transient($cache_key, $response, self::CACHE_QUIZ_QUESTIONS);
        }

        return $response;
    }

    /**
     * Submit quiz answers
     */
    public function submit_quiz($answers, $available_strains = []) {
        return $this->request('/quiz', 'POST', [
            'answers' => $answers,
            'availableStrains' => $available_strains,
        ]);
    }

    /**
     * Submit feedback rating
     */
    public function submit_feedback($strain_slug, $match_rating) {
        return $this->request('/feedback', 'POST', [
            'strainSlug' => $strain_slug,
            'matchRating' => $match_rating,
        ]);
    }

    /**
     * Get survey questions
     */
    public function get_survey_questions() {
        $cache_key = 'tripdar_survey_questions';

        $cached = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        $response = $this->request('/feedback/survey');

        if ($response && isset($response['success']) && $response['success']) {
            set_transient($cache_key, $response, self::CACHE_SURVEY_QUESTIONS);
        }

        return $response;
    }

    /**
     * Submit survey responses
     */
    public function submit_survey($strain_slug, $match_rating, $responses, $freeform_text = '') {
        return $this->request('/feedback/survey', 'POST', [
            'strainSlug' => $strain_slug,
            'matchRating' => $match_rating,
            'responses' => $responses,
            'freeformText' => $freeform_text,
        ]);
    }

    /**
     * Test API connection
     */
    public function test_connection() {
        $response = $this->get_strains(1, 1);
        return $response && isset($response['success']) && $response['success'];
    }

    /**
     * Get all strain slugs (for admin inventory selector)
     */
    public function get_all_strain_slugs() {
        $all_strains = [];
        $page = 1;
        $has_more = true;

        while ($has_more && $page <= 10) { // Safety limit
            $response = $this->get_strains($page, 20);

            if (!$response || !isset($response['success']) || !$response['success']) {
                break;
            }

            $strains = $response['data']['strains'] ?? [];
            foreach ($strains as $strain) {
                $all_strains[$strain['slug']] = $strain['name'];
            }

            $has_more = $response['data']['pagination']['hasMore'] ?? false;
            $page++;
        }

        return $all_strains;
    }
}
