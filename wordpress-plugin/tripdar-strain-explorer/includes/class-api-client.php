<?php
/**
 * Tripdar Strain API Client
 *
 * Extends the core API client with strain-explorer-specific methods.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Tripdar_Strain_API_Client extends Tripdar_API_Client {

    const CACHE_STRAIN_LIST = 300;    // 5 minutes
    const CACHE_STRAIN_DETAIL = 600;  // 10 minutes
    const CACHE_QUIZ_QUESTIONS = 3600; // 1 hour
    const CACHE_SURVEY_QUESTIONS = 3600; // 1 hour

    /**
     * Get paginated strain list with caching
     */
    public function get_strains($page = 1, $per_page = 12, $filters = []) {
        $query = http_build_query(array_merge([
            'page' => $page,
            'pageSize' => $per_page,
        ], $filters));
        return $this->request("/strains?{$query}", 'GET', null, self::CACHE_STRAIN_LIST);
    }

    /**
     * Get single strain with caching
     */
    public function get_strain($slug) {
        return $this->request("/strains/{$slug}", 'GET', null, self::CACHE_STRAIN_DETAIL);
    }

    /**
     * Get strain visualization URL
     */
    public function get_visualization($slug) {
        $cache_key = 'viz_' . sanitize_key($slug);
        $cached = $this->cache->get($cache_key);
        if ($cached !== false) {
            if (isset($cached['data']['expiresAt'])) {
                $expires = strtotime($cached['data']['expiresAt']);
                if ($expires > time() + 600) {
                    return $cached;
                }
            }
            $this->cache->delete($cache_key);
        }
        $response = $this->request("/strains/{$slug}/visualization");
        if ($response && isset($response['success']) && $response['success']) {
            $this->cache->set($cache_key, $response, 1800);
        }
        return $response;
    }

    /**
     * Get quiz questions
     */
    public function get_quiz_questions() {
        return $this->request('/quiz', 'GET', null, self::CACHE_QUIZ_QUESTIONS);
    }

    /**
     * Submit quiz answers
     */
    public function submit_quiz($answers, $available_strains = []) {
        return $this->post('/quiz', [
            'answers' => $answers,
            'availableStrains' => $available_strains,
        ]);
    }

    /**
     * Submit feedback rating
     */
    public function submit_feedback($strain_slug, $match_rating) {
        return $this->post('/feedback', [
            'strainSlug' => $strain_slug,
            'matchRating' => $match_rating,
        ]);
    }

    /**
     * Get survey questions
     */
    public function get_survey_questions() {
        return $this->request('/feedback/survey', 'GET', null, self::CACHE_SURVEY_QUESTIONS);
    }

    /**
     * Submit survey responses
     */
    public function submit_survey($strain_slug, $match_rating, $responses, $freeform_text = '') {
        return $this->post('/feedback/survey', [
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
        $query_string = http_build_query([
            'q' => $query,
            'limit' => min(20, max(1, intval($limit))),
        ]);
        return $this->request("/strains/search?{$query_string}", 'GET', null, 60);
    }

    /**
     * Get strain lineage (family tree)
     */
    public function get_lineage($slug) {
        return $this->request("/strains/{$slug}/lineage", 'GET', null, 300);
    }

    /**
     * Get full lineage tree (all strains)
     */
    public function get_lineage_tree() {
        return $this->request("/lineage/tree", 'GET', null, 600);
    }

    /**
     * Find lineage path between two strains
     */
    public function get_lineage_path($from_slug, $to_slug) {
        $query = http_build_query(['from' => $from_slug, 'to' => $to_slug]);
        return $this->request("/lineage/path?{$query}", 'GET', null, 600);
    }

    /**
     * Get strain confidence score and tier
     */
    public function get_confidence($slug) {
        return $this->request("/strains/{$slug}/confidence", 'GET', null, 120);
    }

    /**
     * Get strain dosage curve data
     */
    public function get_dosage_curve($slug) {
        return $this->request("/strains/{$slug}/dosage-curve", 'GET', null, 300);
    }

    /**
     * Get strain setting insights
     */
    public function get_settings($slug) {
        return $this->request("/strains/{$slug}/settings", 'GET', null, 300);
    }

    /**
     * Get similar strains
     */
    public function get_similar($slug, $limit = 5) {
        $query = http_build_query(['limit' => $limit]);
        return $this->request("/strains/{$slug}/similar?{$query}", 'GET', null, 300);
    }

    /**
     * Get similar strains with explanations (for progressive engagement)
     */
    public function get_similar_strains($slug, $limit = 3) {
        return $this->get_similar($slug, $limit);
    }

    /**
     * Get personalized recommendations
     */
    public function get_recommendations($limit = 5) {
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
        $query = http_build_query(['strains' => implode(',', $slugs)]);
        return $this->request("/compare?{$query}", 'GET', null, 300);
    }

    /**
     * Get all collections
     */
    public function get_collections() {
        return $this->request('/collections', 'GET', null, 300);
    }

    /**
     * Get a single collection by slug
     */
    public function get_collection($slug) {
        return $this->request("/collections/{$slug}", 'GET', null, 300);
    }

    /**
     * Get strain ratings and reviews summary
     */
    public function get_ratings($slug) {
        return $this->request("/strains/{$slug}/ratings", 'GET', null, 120);
    }

    /**
     * Submit a rating for a strain
     */
    public function submit_rating($slug, $rating) {
        return $this->post("/strains/{$slug}/ratings", ['rating' => intval($rating)]);
    }

    /**
     * Get approved reviews for a strain
     */
    public function get_reviews($slug, $page = 1, $per_page = 10) {
        $query = http_build_query(['page' => $page, 'pageSize' => $per_page]);
        return $this->request("/strains/{$slug}/reviews?{$query}", 'GET', null, 120);
    }

    /**
     * Submit a review for a strain
     */
    public function submit_review($slug, $rating, $body, $title = null) {
        $data = ['rating' => intval($rating), 'body' => $body];
        if ($title) {
            $data['title'] = $title;
        }
        return $this->post("/strains/{$slug}/reviews", $data);
    }

    /**
     * Get approved trip reports for a strain
     */
    public function get_trip_reports($slug, $page = 1, $per_page = 10) {
        $query = http_build_query(['page' => $page, 'pageSize' => $per_page]);
        return $this->request("/strains/{$slug}/reports?{$query}", 'GET', null, 120);
    }

    /**
     * Submit a trip report
     */
    public function submit_trip_report($data) {
        return $this->post('/reports', $data);
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
        return $this->post('/events', $body);
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
