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
     * Make API request (authenticated if key provided, otherwise public access)
     */
    private function request($endpoint, $method = 'GET', $body = null) {
        $api_key = $this->get_api_key();

        $args = [
            'method' => $method,
            'headers' => [
                'Accept' => 'application/json',
                'Content-Type' => 'application/json',
            ],
            'timeout' => 15,
        ];

        // Add auth header if API key is configured
        if (!empty($api_key)) {
            $args['headers']['Authorization'] = 'Bearer ' . $api_key;
        }

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
     * Search strains with fuzzy matching
     */
    public function search_strains($query, $limit = 10) {
        if (empty($query) || strlen($query) < 2) {
            return [
                'success' => true,
                'data' => ['results' => [], 'query' => $query]
            ];
        }

        $cache_key = 'tripdar_search_' . md5($query . '_' . $limit);

        // Short cache for search results (1 minute)
        $cached = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        $query_string = http_build_query([
            'q' => $query,
            'limit' => min(20, max(1, intval($limit))),
        ]);

        $response = $this->request("/strains/search?{$query_string}");

        if ($response && isset($response['success']) && $response['success']) {
            set_transient($cache_key, $response, 60); // 1 minute cache
        }

        return $response;
    }

    /**
     * Get strain lineage (family tree)
     */
    public function get_lineage($slug) {
        $cache_key = 'tripdar_lineage_' . sanitize_key($slug);

        $cached = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        $response = $this->request("/strains/{$slug}/lineage");

        if ($response && isset($response['success']) && $response['success']) {
            set_transient($cache_key, $response, 300); // 5 minute cache
        }

        return $response;
    }

    /**
     * Get full lineage tree (all strains)
     */
    public function get_lineage_tree() {
        $cache_key = 'tripdar_lineage_tree';

        $cached = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        $response = $this->request("/lineage/tree");

        if ($response && isset($response['success']) && $response['success']) {
            set_transient($cache_key, $response, 600); // 10 minute cache
        }

        return $response;
    }

    /**
     * Find lineage path between two strains
     */
    public function get_lineage_path($from_slug, $to_slug) {
        $cache_key = 'tripdar_lineage_path_' . sanitize_key($from_slug) . '_' . sanitize_key($to_slug);

        $cached = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        $query = http_build_query([
            'from' => $from_slug,
            'to' => $to_slug,
        ]);

        $response = $this->request("/lineage/path?{$query}");

        if ($response && isset($response['success']) && $response['success']) {
            set_transient($cache_key, $response, 600); // 10 minute cache
        }

        return $response;
    }

    /**
     * Get strain confidence score and tier
     */
    public function get_confidence($slug) {
        $cache_key = 'tripdar_confidence_' . sanitize_key($slug);

        $cached = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        $response = $this->request("/strains/{$slug}/confidence");

        if ($response && isset($response['success']) && $response['success']) {
            set_transient($cache_key, $response, 120); // 2 minute cache
        }

        return $response;
    }

    /**
     * Get strain dosage curve data
     */
    public function get_dosage_curve($slug) {
        $cache_key = 'tripdar_dosage_' . sanitize_key($slug);

        $cached = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        $response = $this->request("/strains/{$slug}/dosage-curve");

        if ($response && isset($response['success']) && $response['success']) {
            set_transient($cache_key, $response, 300); // 5 minute cache
        }

        return $response;
    }

    /**
     * Get strain setting insights
     */
    public function get_settings($slug) {
        $cache_key = 'tripdar_settings_' . sanitize_key($slug);

        $cached = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        $response = $this->request("/strains/{$slug}/settings");

        if ($response && isset($response['success']) && $response['success']) {
            set_transient($cache_key, $response, 300); // 5 minute cache
        }

        return $response;
    }

    /**
     * Get similar strains
     */
    public function get_similar($slug, $limit = 5) {
        $cache_key = 'tripdar_similar_' . sanitize_key($slug) . '_' . $limit;

        $cached = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        $query = http_build_query(['limit' => $limit]);
        $response = $this->request("/strains/{$slug}/similar?{$query}");

        if ($response && isset($response['success']) && $response['success']) {
            set_transient($cache_key, $response, 300); // 5 minute cache
        }

        return $response;
    }

    /**
     * Get personalized recommendations
     */
    public function get_recommendations($limit = 5) {
        // No cache - personalized per session
        $query = http_build_query(['limit' => $limit]);
        return $this->request("/recommendations?{$query}");
    }

    /**
     * Compare multiple strains
     */
    public function compare_strains($slugs) {
        if (!is_array($slugs) || count($slugs) < 2) {
            return [
                'success' => false,
                'error' => ['code' => 'INVALID_INPUT', 'message' => 'At least 2 strains required']
            ];
        }

        $cache_key = 'tripdar_compare_' . md5(implode(',', $slugs));

        $cached = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        $query = http_build_query(['strains' => implode(',', $slugs)]);
        $response = $this->request("/compare?{$query}");

        if ($response && isset($response['success']) && $response['success']) {
            set_transient($cache_key, $response, 300); // 5 minute cache
        }

        return $response;
    }

    /**
     * Get all collections
     */
    public function get_collections() {
        $cache_key = 'tripdar_collections';

        $cached = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        $response = $this->request('/collections');

        if ($response && isset($response['success']) && $response['success']) {
            set_transient($cache_key, $response, 300); // 5 minute cache
        }

        return $response;
    }

    /**
     * Get a single collection by slug
     */
    public function get_collection($slug) {
        $cache_key = 'tripdar_collection_' . sanitize_key($slug);

        $cached = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        $response = $this->request("/collections/{$slug}");

        if ($response && isset($response['success']) && $response['success']) {
            set_transient($cache_key, $response, 300); // 5 minute cache
        }

        return $response;
    }

    /**
     * Get strain ratings and reviews summary
     */
    public function get_ratings($slug) {
        $cache_key = 'tripdar_ratings_' . sanitize_key($slug);

        // Short cache for ratings (2 minutes)
        $cached = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        $response = $this->request("/strains/{$slug}/ratings");

        if ($response && isset($response['success']) && $response['success']) {
            set_transient($cache_key, $response, 120); // 2 minute cache
        }

        return $response;
    }

    /**
     * Submit a rating for a strain
     */
    public function submit_rating($slug, $rating) {
        return $this->request("/strains/{$slug}/ratings", 'POST', [
            'rating' => intval($rating),
        ]);
    }

    /**
     * Get approved reviews for a strain
     */
    public function get_reviews($slug, $page = 1, $per_page = 10) {
        $cache_key = 'tripdar_reviews_' . sanitize_key($slug) . '_' . $page . '_' . $per_page;

        // Short cache for reviews (2 minutes)
        $cached = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        $query = http_build_query([
            'page' => $page,
            'pageSize' => $per_page,
        ]);

        $response = $this->request("/strains/{$slug}/reviews?{$query}");

        if ($response && isset($response['success']) && $response['success']) {
            set_transient($cache_key, $response, 120); // 2 minute cache
        }

        return $response;
    }

    /**
     * Submit a review for a strain
     */
    public function submit_review($slug, $rating, $body, $title = null) {
        $data = [
            'rating' => intval($rating),
            'body' => $body,
        ];

        if ($title) {
            $data['title'] = $title;
        }

        return $this->request("/strains/{$slug}/reviews", 'POST', $data);
    }

    /**
     * Get approved trip reports for a strain
     */
    public function get_trip_reports($slug, $page = 1, $per_page = 10) {
        $cache_key = 'tripdar_reports_' . sanitize_key($slug) . '_' . $page . '_' . $per_page;

        // Short cache for reports (2 minutes)
        $cached = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        $query = http_build_query([
            'page' => $page,
            'pageSize' => $per_page,
        ]);

        $response = $this->request("/strains/{$slug}/reports?{$query}");

        if ($response && isset($response['success']) && $response['success']) {
            set_transient($cache_key, $response, 120); // 2 minute cache
        }

        return $response;
    }

    /**
     * Submit a trip report
     */
    public function submit_trip_report($data) {
        return $this->request('/reports', 'POST', $data);
    }

    /**
     * Record an analytics event
     */
    public function record_event($event_type, $entity_slug, $metadata = null) {
        $body = [
            'eventType' => $event_type,
            'entitySlug' => $entity_slug,
        ];

        if ($metadata) {
            $body['metadata'] = $metadata;
        }

        return $this->request('/events', 'POST', $body);
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
