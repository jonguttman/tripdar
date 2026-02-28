<?php
/**
 * Plugin Name: Tripdar Recommendation Engine
 * Plugin URI: https://tripd.ar
 * Description: Dose recommendation engine with three-layer scoring, feedback loop, and admin controls.
 * Version: 1.2.1
 * Author: Tripdar
 * Author URI: https://tripd.ar
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: tripdar-recommendation-engine
 * Domain Path: /languages
 */

if (!defined('ABSPATH')) {
    exit;
}

define('TRIPDAR_REC_VERSION', '1.2.1');
define('TRIPDAR_REC_DIR', plugin_dir_path(__FILE__));
define('TRIPDAR_REC_URL', plugin_dir_url(__FILE__));

class Tripdar_Recommendation_Engine {

    private static $instance = null;
    public $api;

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        $this->load_dependencies();
        $this->init_hooks();
    }

    private function load_dependencies() {
        require_once TRIPDAR_REC_DIR . 'includes/class-api-client.php';
        require_once TRIPDAR_REC_DIR . 'includes/class-shortcodes.php';

        if (is_admin()) {
            require_once TRIPDAR_REC_DIR . 'admin/class-admin.php';
        }

        $this->api = new Tripdar_Rec_API_Client();
    }

    private function init_hooks() {
        register_activation_hook(__FILE__, [$this, 'activate']);
        register_deactivation_hook(__FILE__, [$this, 'deactivate']);

        add_action('init', [$this, 'init_components']);
        add_action('wp_enqueue_scripts', [$this, 'enqueue_frontend_assets']);

        // AJAX handlers (public — both logged in and not)
        add_action('wp_ajax_tripdar_rec_get_config', [$this, 'handle_get_config']);
        add_action('wp_ajax_nopriv_tripdar_rec_get_config', [$this, 'handle_get_config']);

        add_action('wp_ajax_tripdar_rec_submit', [$this, 'handle_submit_recommendation']);
        add_action('wp_ajax_nopriv_tripdar_rec_submit', [$this, 'handle_submit_recommendation']);

        add_action('wp_ajax_tripdar_rec_feedback', [$this, 'handle_submit_feedback']);
        add_action('wp_ajax_nopriv_tripdar_rec_feedback', [$this, 'handle_submit_feedback']);

        add_action('wp_ajax_tripdar_rec_signals', [$this, 'handle_submit_signals']);
        add_action('wp_ajax_nopriv_tripdar_rec_signals', [$this, 'handle_submit_signals']);

        add_action('wp_ajax_tripdar_rec_dosing_guide', [$this, 'handle_create_dosing_guide']);
        add_action('wp_ajax_nopriv_tripdar_rec_dosing_guide', [$this, 'handle_create_dosing_guide']);
    }

    public function activate() {
        $defaults = [
            'tripdar_rec_consent_accepted' => false,
            'tripdar_rec_theme' => 'parchment',
        ];

        foreach ($defaults as $key => $value) {
            if (get_option($key) === false) {
                add_option($key, $value);
            }
        }

        flush_rewrite_rules();
    }

    public function deactivate() {
        flush_rewrite_rules();
    }

    public function init_components() {
        $shortcodes = new Tripdar_Rec_Shortcodes($this->api);
        $shortcodes->register();

        if (is_admin()) {
            $admin = new Tripdar_Rec_Admin($this->api);
            $admin->register();
        }
    }

    public function enqueue_frontend_assets() {
        tripdar_core_enqueue_base_styles();

        wp_enqueue_style(
            'tripdar-recommendation-engine',
            TRIPDAR_REC_URL . 'assets/css/recommendation-engine.css',
            ['tripdar-base'],
            TRIPDAR_REC_VERSION
        );

        wp_enqueue_script(
            'tripdar-recommendation-engine',
            TRIPDAR_REC_URL . 'assets/js/recommendation-engine.js',
            [],
            TRIPDAR_REC_VERSION,
            true
        );

        wp_localize_script('tripdar-recommendation-engine', 'tripdarRec', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('tripdar_rec_nonce'),
            'dosingGuideEnabled' => (bool) get_option('tripdar_rec_dosing_guide_enabled', false),
            'forceQr' => (bool) get_option('tripdar_rec_force_qr', false),
        ]);
    }

    // =========================================================================
    // AJAX Handlers
    // =========================================================================

    public function handle_get_config() {
        check_ajax_referer('tripdar_rec_nonce', 'nonce');

        $response = $this->api->get_config();

        if ($response && isset($response['success']) && $response['success']) {
            wp_send_json_success($response['data']);
        } else {
            wp_send_json_error($response['error'] ?? ['message' => 'Failed to load config']);
        }
    }

    public function handle_submit_recommendation() {
        check_ajax_referer('tripdar_rec_nonce', 'nonce');

        $experience_level = isset($_POST['experienceLevel']) ? sanitize_text_field($_POST['experienceLevel']) : '';
        $input_path = isset($_POST['inputPath']) ? sanitize_text_field($_POST['inputPath']) : '';
        $intent_vector_raw = isset($_POST['intentVector']) ? sanitize_text_field($_POST['intentVector']) : '{}';
        $raw_input_raw = isset($_POST['rawInput']) ? sanitize_text_field($_POST['rawInput']) : '{}';

        $intent_vector = json_decode(stripslashes($intent_vector_raw), true) ?: [];
        $raw_input = json_decode(stripslashes($raw_input_raw), true) ?: [];

        $response = $this->api->get_recommendations([
            'experienceLevel' => $experience_level,
            'inputPath' => $input_path,
            'intentVector' => $intent_vector,
            'rawInput' => $raw_input,
        ]);

        if ($response && isset($response['success']) && $response['success']) {
            wp_send_json_success($response['data']);
        } else {
            wp_send_json_error($response['error'] ?? ['message' => 'Recommendation request failed']);
        }
    }

    public function handle_submit_feedback() {
        check_ajax_referer('tripdar_rec_nonce', 'nonce');

        $result_id = isset($_POST['resultId']) ? sanitize_text_field($_POST['resultId']) : '';
        $quick_rating = isset($_POST['quickRating']) ? sanitize_text_field($_POST['quickRating']) : '';
        $actual_dose = isset($_POST['actualDoseMg']) ? intval($_POST['actualDoseMg']) : null;
        $note = isset($_POST['note']) ? sanitize_textarea_field($_POST['note']) : '';

        $body = [
            'resultId' => $result_id,
            'quickRating' => $quick_rating,
        ];
        if ($actual_dose) $body['actualDoseMg'] = $actual_dose;
        if (!empty($note)) $body['note'] = $note;

        $response = $this->api->submit_feedback($body);

        if ($response && isset($response['success']) && $response['success']) {
            wp_send_json_success($response['data']);
        } else {
            wp_send_json_error($response['error'] ?? ['message' => 'Feedback submission failed']);
        }
    }

    public function handle_submit_signals() {
        check_ajax_referer('tripdar_rec_nonce', 'nonce');

        $feedback_id = isset($_POST['feedbackId']) ? sanitize_text_field($_POST['feedbackId']) : '';
        $signals_raw = isset($_POST['signals']) ? sanitize_text_field($_POST['signals']) : '[]';
        $signals = json_decode(stripslashes($signals_raw), true) ?: [];

        $response = $this->api->submit_signals([
            'feedbackId' => $feedback_id,
            'signals' => $signals,
        ]);

        if ($response && isset($response['success']) && $response['success']) {
            wp_send_json_success($response['data']);
        } else {
            wp_send_json_error($response['error'] ?? ['message' => 'Signal submission failed']);
        }
    }

    public function handle_create_dosing_guide() {
        check_ajax_referer('tripdar_rec_nonce', 'nonce');

        $session_token = isset($_POST['sessionToken']) ? sanitize_text_field($_POST['sessionToken']) : '';
        $strain_slug = isset($_POST['strainSlug']) ? sanitize_text_field($_POST['strainSlug']) : '';

        if (empty($strain_slug)) {
            wp_send_json_error(['message' => 'Missing strain slug']);
        }

        $retailer_branding = [
            'logoUrl' => get_option('tripdar_rec_store_logo', ''),
            'storeName' => get_option('tripdar_rec_store_name', ''),
            'address' => get_option('tripdar_rec_store_address', ''),
            'phone' => get_option('tripdar_rec_store_phone', ''),
        ];

        $response = $this->api->create_dosing_guide($session_token, $strain_slug, $retailer_branding);

        if ($response && isset($response['success']) && $response['success']) {
            wp_send_json_success($response['data']);
        } else {
            wp_send_json_error($response['error'] ?? ['message' => 'Failed to create dosing guide']);
        }
    }
}

function tripdar_recommendation_engine() {
    return Tripdar_Recommendation_Engine::get_instance();
}

// Defer initialization until all plugins are loaded (ensures tripdar-core is available)
add_action('plugins_loaded', function() {
    if (!function_exists('tripdar_core_loaded')) {
        add_action('admin_notices', function() {
            echo '<div class="notice notice-error"><p><strong>Tripdar Recommendation Engine</strong> requires the <strong>Tripdar Core</strong> plugin to be installed and activated.</p></div>';
        });
        return;
    }
    tripdar_recommendation_engine();
});
