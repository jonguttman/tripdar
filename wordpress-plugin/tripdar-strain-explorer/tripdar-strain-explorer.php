<?php
/**
 * Plugin Name: Tripdar Strain Explorer
 * Plugin URI: https://tripd.ar
 * Description: A mystical storybook-style strain explorer with quiz journey and feedback collection.
 * Version: 1.3.1
 * Author: Tripdar
 * Author URI: https://tripd.ar
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: tripdar-strain-explorer
 * Domain Path: /languages
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Plugin constants
define('TRIPDAR_VERSION', '1.3.1');
define('TRIPDAR_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('TRIPDAR_PLUGIN_URL', plugin_dir_url(__FILE__));
define('TRIPDAR_API_BASE', 'https://www.tripd.ar/api/v1');
define('TRIPDAR_GITHUB_USER', 'jonguttman');
define('TRIPDAR_GITHUB_REPO', 'tripdar');

/**
 * Main Plugin Class
 */
class Tripdar_Strain_Explorer {

    /**
     * Single instance
     */
    private static $instance = null;

    /**
     * API Client
     */
    public $api;

    /**
     * Get instance
     */
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor
     */
    private function __construct() {
        $this->load_dependencies();
        $this->init_hooks();
    }

    /**
     * Load required files
     */
    private function load_dependencies() {
        require_once TRIPDAR_PLUGIN_DIR . 'includes/class-api-client.php';
        require_once TRIPDAR_PLUGIN_DIR . 'includes/class-shortcodes.php';
        require_once TRIPDAR_PLUGIN_DIR . 'includes/class-github-updater.php';

        if (is_admin()) {
            require_once TRIPDAR_PLUGIN_DIR . 'admin/class-admin.php';
        }

        $this->api = new Tripdar_API_Client();

        // Initialize GitHub updater for automatic updates
        new Tripdar_GitHub_Updater(
            __FILE__,
            TRIPDAR_GITHUB_USER,
            TRIPDAR_GITHUB_REPO
        );
    }

    /**
     * Initialize hooks
     */
    private function init_hooks() {
        // Activation/deactivation
        register_activation_hook(__FILE__, [$this, 'activate']);
        register_deactivation_hook(__FILE__, [$this, 'deactivate']);

        // Enqueue assets
        add_action('wp_enqueue_scripts', [$this, 'enqueue_frontend_assets']);

        // Initialize components
        add_action('init', [$this, 'init_components']);

        // AJAX handlers - Quiz
        add_action('wp_ajax_tripdar_submit_quiz', [$this, 'handle_quiz_submit']);
        add_action('wp_ajax_nopriv_tripdar_submit_quiz', [$this, 'handle_quiz_submit']);

        // AJAX handlers - Feedback
        add_action('wp_ajax_tripdar_submit_feedback', [$this, 'handle_feedback_submit']);
        add_action('wp_ajax_nopriv_tripdar_submit_feedback', [$this, 'handle_feedback_submit']);

        // AJAX handlers - Survey
        add_action('wp_ajax_tripdar_get_survey', [$this, 'handle_get_survey']);
        add_action('wp_ajax_nopriv_tripdar_get_survey', [$this, 'handle_get_survey']);
        add_action('wp_ajax_tripdar_submit_survey', [$this, 'handle_survey_submit']);
        add_action('wp_ajax_nopriv_tripdar_submit_survey', [$this, 'handle_survey_submit']);

        // AJAX handlers - Explorer
        add_action('wp_ajax_tripdar_load_strains', [$this, 'handle_load_strains']);
        add_action('wp_ajax_nopriv_tripdar_load_strains', [$this, 'handle_load_strains']);
        add_action('wp_ajax_tripdar_get_strain', [$this, 'handle_get_strain']);
        add_action('wp_ajax_nopriv_tripdar_get_strain', [$this, 'handle_get_strain']);

        // AJAX handlers - Search
        add_action('wp_ajax_tripdar_search_strains', [$this, 'handle_search_strains']);
        add_action('wp_ajax_nopriv_tripdar_search_strains', [$this, 'handle_search_strains']);

        // AJAX handlers - Ratings
        add_action('wp_ajax_tripdar_submit_rating', [$this, 'handle_submit_rating']);
        add_action('wp_ajax_nopriv_tripdar_submit_rating', [$this, 'handle_submit_rating']);

        // AJAX handlers - Trip Reports
        add_action('wp_ajax_tripdar_submit_report', [$this, 'handle_submit_report']);
        add_action('wp_ajax_nopriv_tripdar_submit_report', [$this, 'handle_submit_report']);

        // AJAX handlers - Analytics Events
        add_action('wp_ajax_tripdar_track_event', [$this, 'handle_track_event']);
        add_action('wp_ajax_nopriv_tripdar_track_event', [$this, 'handle_track_event']);

        // AJAX handlers - Compare and Recommendations
        add_action('wp_ajax_tripdar_compare_strains', [$this, 'handle_compare_strains']);
        add_action('wp_ajax_nopriv_tripdar_compare_strains', [$this, 'handle_compare_strains']);
        add_action('wp_ajax_tripdar_get_recommendations', [$this, 'handle_get_recommendations']);
        add_action('wp_ajax_nopriv_tripdar_get_recommendations', [$this, 'handle_get_recommendations']);
    }

    /**
     * Plugin activation
     */
    public function activate() {
        // Set default options
        $defaults = [
            'tripdar_api_key' => '',
            'tripdar_theme' => 'light',
            'tripdar_cache_duration' => 5,
            'tripdar_strain_inventory' => [],
        ];

        foreach ($defaults as $key => $value) {
            if (get_option($key) === false) {
                add_option($key, $value);
            }
        }

        // Clear any existing caches
        $this->clear_cache();

        // Flush rewrite rules
        flush_rewrite_rules();
    }

    /**
     * Plugin deactivation
     */
    public function deactivate() {
        $this->clear_cache();
        flush_rewrite_rules();
    }

    /**
     * Initialize components
     */
    public function init_components() {
        $shortcodes = new Tripdar_Shortcodes();
        $shortcodes->register();

        if (is_admin()) {
            $admin = new Tripdar_Admin();
            $admin->register();
        }
    }

    /**
     * Enqueue frontend assets
     */
    public function enqueue_frontend_assets() {
        // Main stylesheet
        wp_enqueue_style(
            'tripdar-storybook',
            TRIPDAR_PLUGIN_URL . 'assets/css/storybook.css',
            [],
            TRIPDAR_VERSION
        );

        // Google Fonts for storybook aesthetic
        wp_enqueue_style(
            'tripdar-fonts',
            'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Lora:ital,wght@0,400;0,500;1,400&display=swap',
            [],
            null
        );

        // Explorer script
        wp_enqueue_script(
            'tripdar-explorer',
            TRIPDAR_PLUGIN_URL . 'assets/js/explorer.js',
            [],
            TRIPDAR_VERSION,
            true
        );

        // Quiz script
        wp_enqueue_script(
            'tripdar-quiz',
            TRIPDAR_PLUGIN_URL . 'assets/js/quiz.js',
            ['tripdar-explorer'],
            TRIPDAR_VERSION,
            true
        );

        // Feedback script
        wp_enqueue_script(
            'tripdar-feedback',
            TRIPDAR_PLUGIN_URL . 'assets/js/feedback.js',
            ['tripdar-explorer'],
            TRIPDAR_VERSION,
            true
        );

        // Autocomplete search script
        wp_enqueue_script(
            'tripdar-autocomplete',
            TRIPDAR_PLUGIN_URL . 'assets/js/autocomplete.js',
            ['tripdar-explorer'],
            TRIPDAR_VERSION,
            true
        );

        // Ratings script
        wp_enqueue_script(
            'tripdar-ratings',
            TRIPDAR_PLUGIN_URL . 'assets/js/ratings.js',
            ['tripdar-explorer'],
            TRIPDAR_VERSION,
            true
        );

        // Trip report form script
        wp_enqueue_script(
            'tripdar-reports',
            TRIPDAR_PLUGIN_URL . 'assets/js/report-form.js',
            ['tripdar-explorer'],
            TRIPDAR_VERSION,
            true
        );

        // Data features script (compare, recommendations, etc.)
        wp_enqueue_script(
            'tripdar-data-features',
            TRIPDAR_PLUGIN_URL . 'assets/js/data-features.js',
            ['tripdar-explorer'],
            TRIPDAR_VERSION,
            true
        );

        // Localize scripts with AJAX settings
        $ajax_settings = [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('tripdar_nonce'),
        ];

        wp_localize_script('tripdar-explorer', 'tripdarExplorer', $ajax_settings);
        wp_localize_script('tripdar-quiz', 'tripdarQuiz', $ajax_settings);
        wp_localize_script('tripdar-feedback', 'tripdarFeedback', $ajax_settings);
        wp_localize_script('tripdar-ratings', 'tripdarAjax', $ajax_settings);
        wp_localize_script('tripdar-reports', 'tripdarReports', $ajax_settings);
        wp_localize_script('tripdar-data-features', 'tripdarAjax', $ajax_settings);
    }

    /**
     * Handle quiz submission via AJAX
     */
    public function handle_quiz_submit() {
        check_ajax_referer('tripdar_nonce', 'nonce');

        $answers_raw = isset($_POST['answers']) ? sanitize_text_field($_POST['answers']) : '{}';
        $answers = json_decode(stripslashes($answers_raw), true) ?: [];

        $available_raw = isset($_POST['available_strains']) ? sanitize_text_field($_POST['available_strains']) : '[]';
        $available_strains = json_decode(stripslashes($available_raw), true) ?: [];

        // If no available strains passed, use the configured inventory
        if (empty($available_strains)) {
            $available_strains = get_option('tripdar_available_strains', []);
        }

        $result = $this->api->submit_quiz($answers, $available_strains);

        if ($result && isset($result['success']) && $result['success']) {
            wp_send_json_success($result['data']);
        } else {
            wp_send_json_error($result['error'] ?? ['message' => 'Quiz submission failed']);
        }
    }

    /**
     * Handle feedback submission via AJAX
     */
    public function handle_feedback_submit() {
        check_ajax_referer('tripdar_nonce', 'nonce');

        $strain_slug = isset($_POST['strain_slug']) ? sanitize_text_field($_POST['strain_slug']) : '';
        $match_rating = isset($_POST['rating']) ? intval($_POST['rating']) : 3;

        $result = $this->api->submit_feedback($strain_slug, $match_rating);

        if ($result && isset($result['success']) && $result['success']) {
            wp_send_json_success($result['data']);
        } else {
            wp_send_json_error($result['error'] ?? ['message' => 'Feedback submission failed']);
        }
    }

    /**
     * Handle get survey questions via AJAX
     */
    public function handle_get_survey() {
        check_ajax_referer('tripdar_nonce', 'nonce');

        $result = $this->api->get_survey_questions();

        if ($result && isset($result['success']) && $result['success']) {
            wp_send_json_success($result['data']);
        } else {
            wp_send_json_error($result['error'] ?? ['message' => 'Failed to load survey']);
        }
    }

    /**
     * Handle survey submission via AJAX
     */
    public function handle_survey_submit() {
        check_ajax_referer('tripdar_nonce', 'nonce');

        $strain_slug = isset($_POST['strain_slug']) ? sanitize_text_field($_POST['strain_slug']) : '';
        $match_rating = isset($_POST['rating']) ? intval($_POST['rating']) : 3;

        $responses_raw = isset($_POST['responses']) ? sanitize_text_field($_POST['responses']) : '{}';
        $responses = json_decode(stripslashes($responses_raw), true) ?: [];

        $freeform = isset($_POST['freeform_text']) ? sanitize_textarea_field($_POST['freeform_text']) : '';

        $result = $this->api->submit_survey($strain_slug, $match_rating, $responses, $freeform);

        if ($result && isset($result['success']) && $result['success']) {
            wp_send_json_success($result['data']);
        } else {
            wp_send_json_error($result['error'] ?? ['message' => 'Survey submission failed']);
        }
    }

    /**
     * Handle load strains via AJAX
     */
    public function handle_load_strains() {
        check_ajax_referer('tripdar_nonce', 'nonce');

        $page = isset($_POST['page']) ? intval($_POST['page']) : 1;
        $per_page = isset($_POST['per_page']) ? intval($_POST['per_page']) : 12;

        $filters_raw = isset($_POST['filters']) ? sanitize_text_field($_POST['filters']) : '{}';
        $filters = json_decode(stripslashes($filters_raw), true) ?: [];

        // Add available strains filter
        $available_strains = get_option('tripdar_available_strains', []);
        if (!empty($available_strains)) {
            $filters['slugs'] = implode(',', $available_strains);
        }

        $result = $this->api->get_strains($page, $per_page, $filters);

        if ($result && isset($result['success']) && $result['success']) {
            $strains = $result['data']['strains'] ?? [];
            $pagination = $result['data']['pagination'] ?? [];

            // Render strain cards HTML
            ob_start();
            $shortcodes = new Tripdar_Shortcodes();
            foreach ($strains as $strain) {
                echo $shortcodes->render_strain_card_public($strain);
            }
            $html = ob_get_clean();

            wp_send_json_success([
                'html' => $html,
                'hasMore' => $pagination['hasMore'] ?? false,
                'totalPages' => $pagination['totalPages'] ?? 1,
            ]);
        } else {
            wp_send_json_error($result['error'] ?? ['message' => 'Failed to load strains']);
        }
    }

    /**
     * Handle get single strain via AJAX
     */
    public function handle_get_strain() {
        check_ajax_referer('tripdar_nonce', 'nonce');

        $slug = isset($_POST['slug']) ? sanitize_text_field($_POST['slug']) : '';

        if (empty($slug)) {
            wp_send_json_error(['message' => 'Strain slug required']);
        }

        $result = $this->api->get_strain($slug);

        if ($result && isset($result['success']) && $result['success']) {
            $strain = $result['data']['strain'] ?? null;

            if (!$strain) {
                wp_send_json_error(['message' => 'Strain not found']);
            }

            // Get visualization
            $viz = $this->api->get_visualization($slug);
            $image_url = '';
            if ($viz && isset($viz['data'])) {
                $image_url = $viz['data']['visualizationUrl'] ?? $viz['data']['url'] ?? '';
            }

            // Render strain detail HTML
            ob_start();
            $shortcodes = new Tripdar_Shortcodes();
            echo $shortcodes->render_strain_detail_public($strain, $image_url);
            $html = ob_get_clean();

            wp_send_json_success(['html' => $html]);
        } else {
            wp_send_json_error($result['error'] ?? ['message' => 'Failed to load strain']);
        }
    }

    /**
     * Handle strain search via AJAX
     */
    public function handle_search_strains() {
        check_ajax_referer('tripdar_nonce', 'nonce');

        $query = isset($_POST['query']) ? sanitize_text_field($_POST['query']) : '';
        $limit = isset($_POST['limit']) ? intval($_POST['limit']) : 10;

        if (strlen($query) < 2) {
            wp_send_json_success(['results' => []]);
            return;
        }

        $result = $this->api->search_strains($query, $limit);

        if ($result && isset($result['success']) && $result['success']) {
            wp_send_json_success($result['data']);
        } else {
            wp_send_json_error($result['error'] ?? ['message' => 'Search failed']);
        }
    }

    /**
     * AJAX handler for rating submission
     */
    public function handle_submit_rating() {
        check_ajax_referer('tripdar_nonce', 'nonce');

        $slug = isset($_POST['slug']) ? sanitize_text_field($_POST['slug']) : '';
        $rating = isset($_POST['rating']) ? intval($_POST['rating']) : 0;

        if (empty($slug)) {
            wp_send_json_error('Missing strain slug');
            return;
        }

        if ($rating < 1 || $rating > 5) {
            wp_send_json_error('Rating must be between 1 and 5');
            return;
        }

        $result = $this->api->submit_rating($slug, $rating);

        if ($result && isset($result['success']) && $result['success']) {
            wp_send_json_success($result['data']);
        } else {
            $error_msg = isset($result['error']['message']) ? $result['error']['message'] : 'Failed to submit rating';
            wp_send_json_error($error_msg);
        }
    }

    /**
     * AJAX handler for trip report submission
     */
    public function handle_submit_report() {
        check_ajax_referer('tripdar_nonce', 'nonce');

        $data_json = isset($_POST['data']) ? stripslashes($_POST['data']) : '';

        if (empty($data_json)) {
            wp_send_json_error('Missing report data');
            return;
        }

        $data = json_decode($data_json, true);

        if (!$data || !isset($data['strainSlug'])) {
            wp_send_json_error('Invalid report data');
            return;
        }

        // Validate required fields
        $required = ['doseCategory', 'doseAmount', 'setting', 'title', 'body'];
        foreach ($required as $field) {
            if (empty($data[$field])) {
                wp_send_json_error("Missing required field: {$field}");
                return;
            }
        }

        // Validate body length
        if (strlen($data['body']) < 50) {
            wp_send_json_error('Report body must be at least 50 characters');
            return;
        }

        $result = $this->api->submit_trip_report($data);

        if ($result && isset($result['success']) && $result['success']) {
            wp_send_json_success($result['data']);
        } else {
            $error_msg = isset($result['error']['message']) ? $result['error']['message'] : 'Failed to submit report';
            wp_send_json_error($error_msg);
        }
    }

    /**
     * AJAX handler for analytics event tracking
     */
    public function handle_track_event() {
        check_ajax_referer('tripdar_nonce', 'nonce');

        $event_type = isset($_POST['event_type']) ? sanitize_text_field($_POST['event_type']) : '';
        $entity_slug = isset($_POST['entity_slug']) ? sanitize_text_field($_POST['entity_slug']) : '';

        $allowed_types = ['strain_view', 'strain_tried'];
        if (!in_array($event_type, $allowed_types, true)) {
            wp_send_json_error('Invalid event type');
            return;
        }

        if (empty($entity_slug)) {
            wp_send_json_error('Missing entity slug');
            return;
        }

        $result = $this->api->record_event($event_type, $entity_slug);

        if ($result && isset($result['success']) && $result['success']) {
            wp_send_json_success(['recorded' => true]);
        } else {
            // Silently succeed for tracking - don't break UX over analytics
            wp_send_json_success(['recorded' => false]);
        }
    }

    /**
     * AJAX handler for strain comparison
     */
    public function handle_compare_strains() {
        check_ajax_referer('tripdar_nonce', 'nonce');

        $strains_raw = isset($_POST['strains']) ? sanitize_text_field($_POST['strains']) : '';
        $slugs = array_filter(array_map('trim', explode(',', $strains_raw)));

        if (count($slugs) < 2 || count($slugs) > 5) {
            wp_send_json_error('Please select 2-5 strains to compare');
            return;
        }

        $result = $this->api->compare_strains($slugs);

        if ($result && isset($result['success']) && $result['success']) {
            wp_send_json_success($result['data']);
        } else {
            $error_msg = isset($result['error']['message']) ? $result['error']['message'] : 'Failed to compare strains';
            wp_send_json_error($error_msg);
        }
    }

    /**
     * AJAX handler for recommendations
     */
    public function handle_get_recommendations() {
        check_ajax_referer('tripdar_nonce', 'nonce');

        $limit = isset($_POST['limit']) ? intval($_POST['limit']) : 5;
        $limit = max(1, min(10, $limit));

        $result = $this->api->get_recommendations($limit);

        if ($result && isset($result['success']) && $result['success']) {
            wp_send_json_success($result['data']);
        } else {
            // Return empty array rather than error - no recommendations is normal
            wp_send_json_success(['recommendations' => []]);
        }
    }

    /**
     * Clear all plugin caches
     */
    public function clear_cache() {
        global $wpdb;
        $wpdb->query(
            "DELETE FROM {$wpdb->options}
             WHERE option_name LIKE '_transient_tripdar_%'
             OR option_name LIKE '_transient_timeout_tripdar_%'"
        );
    }
}

/**
 * Initialize the plugin
 */
function tripdar_strain_explorer() {
    return Tripdar_Strain_Explorer::get_instance();
}

// Start the plugin
tripdar_strain_explorer();
