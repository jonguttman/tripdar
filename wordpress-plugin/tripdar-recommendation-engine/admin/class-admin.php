<?php
/**
 * Tripdar Recommendation Engine - Admin Class
 *
 * Registers admin menu pages, meta boxes, settings, dashboard widget,
 * and AJAX handlers for the recommendation engine admin interface.
 */

if (!defined('ABSPATH')) exit;

class Tripdar_Rec_Admin {

    private $api;

    public function __construct($api) {
        $this->api = $api;
    }

    public function register() {
        add_action('admin_menu', [$this, 'add_admin_menu'], 20);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_admin_assets']);
        add_action('wp_dashboard_setup', [$this, 'register_dashboard_widget']);

        // Admin AJAX handlers
        add_action('wp_ajax_tripdar_rec_save_strain_config', [$this, 'ajax_save_strain_config']);
        add_action('wp_ajax_tripdar_rec_load_strain_feedback', [$this, 'ajax_load_strain_feedback']);
        add_action('wp_ajax_tripdar_rec_save_settings', [$this, 'ajax_save_settings']);
        add_action('wp_ajax_tripdar_rec_load_dashboard', [$this, 'ajax_load_dashboard']);
    }

    // =========================================================================
    // Menu Registration
    // =========================================================================

    public function add_admin_menu() {
        // Add under existing Tripdar menu
        add_submenu_page(
            'tripdar-settings',
            'Recommendation Engine',
            'Recommendations',
            'manage_options',
            'tripdar-rec-strains',
            [$this, 'render_strains_page']
        );

        add_submenu_page(
            'tripdar-settings',
            'Rec Engine Settings',
            'Rec Settings',
            'manage_options',
            'tripdar-rec-settings',
            [$this, 'render_settings_page']
        );
    }

    // =========================================================================
    // Settings Registration
    // =========================================================================

    public function register_settings() {
        register_setting('tripdar_rec_settings', 'tripdar_rec_theme', [
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => 'parchment',
        ]);
        register_setting('tripdar_rec_settings', 'tripdar_rec_dosing_guide_enabled', [
            'type' => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default' => false,
        ]);
        register_setting('tripdar_rec_settings', 'tripdar_rec_store_logo', [
            'type' => 'string',
            'sanitize_callback' => 'esc_url_raw',
            'default' => '',
        ]);
        register_setting('tripdar_rec_settings', 'tripdar_rec_store_name', [
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        ]);
        register_setting('tripdar_rec_settings', 'tripdar_rec_store_address', [
            'type' => 'string',
            'sanitize_callback' => 'sanitize_textarea_field',
            'default' => '',
        ]);
        register_setting('tripdar_rec_settings', 'tripdar_rec_store_phone', [
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        ]);
        register_setting('tripdar_rec_settings', 'tripdar_rec_force_qr', [
            'type' => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default' => false,
        ]);
    }

    // =========================================================================
    // Admin Assets
    // =========================================================================

    public function enqueue_admin_assets($hook) {
        if (strpos($hook, 'tripdar-rec') === false) {
            return;
        }

        wp_enqueue_media();

        wp_enqueue_style(
            'tripdar-rec-admin',
            TRIPDAR_REC_URL . 'assets/css/admin.css',
            [],
            TRIPDAR_REC_VERSION
        );

        wp_enqueue_script(
            'tripdar-rec-admin',
            TRIPDAR_REC_URL . 'assets/js/admin.js',
            ['jquery'],
            TRIPDAR_REC_VERSION,
            true
        );

        wp_localize_script('tripdar-rec-admin', 'tripdarRecAdmin', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('tripdar_rec_admin'),
        ]);
    }

    // =========================================================================
    // Page Renderers
    // =========================================================================

    public function render_strains_page() {
        $response = $this->api->get_admin_strains();
        $strains = [];
        if ($response && isset($response['success']) && $response['success']) {
            $strains = $response['data']['strains'] ?? [];
        }

        include TRIPDAR_REC_DIR . 'admin/views/strain-config.php';
    }

    public function render_settings_page() {
        include TRIPDAR_REC_DIR . 'admin/views/settings.php';
    }

    // =========================================================================
    // Dashboard Widget (Phase 8)
    // =========================================================================

    public function register_dashboard_widget() {
        wp_add_dashboard_widget(
            'tripdar_rec_dashboard',
            'Tripdar Recommendation Engine',
            [$this, 'render_dashboard_widget']
        );
    }

    public function render_dashboard_widget() {
        include TRIPDAR_REC_DIR . 'admin/views/dashboard-widget.php';
    }

    // =========================================================================
    // AJAX Handlers
    // =========================================================================

    public function ajax_save_strain_config() {
        check_ajax_referer('tripdar_rec_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => 'Unauthorized']);
        }

        $slug = isset($_POST['strain_slug']) ? sanitize_text_field($_POST['strain_slug']) : '';
        if (empty($slug)) {
            wp_send_json_error(['message' => 'Missing strain slug']);
        }

        $data = [
            'productName' => isset($_POST['productName']) ? sanitize_text_field($_POST['productName']) : null,
            'productUrl' => isset($_POST['productUrl']) ? esc_url_raw($_POST['productUrl']) : null,
            'productUnitMg' => isset($_POST['productUnitMg']) ? intval($_POST['productUnitMg']) : null,
            'productFormat' => isset($_POST['productFormat']) ? sanitize_text_field($_POST['productFormat']) : null,
            'availability' => isset($_POST['availability']) ? sanitize_text_field($_POST['availability']) : 'in_stock',
            'doseSensitivityOverride' => isset($_POST['doseSensitivityOverride']) ? sanitize_text_field($_POST['doseSensitivityOverride']) : null,
        ];

        // Handle intent overrides
        if (isset($_POST['intentOverrides'])) {
            $raw = sanitize_text_field($_POST['intentOverrides']);
            $data['intentOverrides'] = json_decode(stripslashes($raw), true);
        }

        // Handle caution flags
        if (isset($_POST['cautionFlags'])) {
            $raw = sanitize_text_field($_POST['cautionFlags']);
            $data['cautionFlags'] = json_decode(stripslashes($raw), true);
        }

        $response = $this->api->update_strain_config($slug, $data);

        if ($response && isset($response['success']) && $response['success']) {
            wp_send_json_success(['message' => 'Config saved successfully']);
        } else {
            wp_send_json_error($response['error'] ?? ['message' => 'Failed to save config']);
        }
    }

    public function ajax_load_strain_feedback() {
        check_ajax_referer('tripdar_rec_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => 'Unauthorized']);
        }

        $slug = isset($_POST['strain_slug']) ? sanitize_text_field($_POST['strain_slug']) : '';
        if (empty($slug)) {
            wp_send_json_error(['message' => 'Missing strain slug']);
        }

        $response = $this->api->get_strain_feedback($slug);

        if ($response && isset($response['success']) && $response['success']) {
            wp_send_json_success($response['data']);
        } else {
            wp_send_json_error($response['error'] ?? ['message' => 'Failed to load feedback']);
        }
    }

    public function ajax_save_settings() {
        check_ajax_referer('tripdar_rec_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => 'Unauthorized']);
        }

        $settings = [];

        if (isset($_POST['feedbackThreshold'])) {
            $settings['feedbackThreshold'] = intval($_POST['feedbackThreshold']);
        }
        if (isset($_POST['maxResults'])) {
            $settings['maxResults'] = intval($_POST['maxResults']);
        }
        if (isset($_POST['showMatchPercentage'])) {
            $settings['showMatchPercentage'] = $_POST['showMatchPercentage'] === '1';
        }
        if (isset($_POST['showSteppedPath'])) {
            $settings['showSteppedPath'] = $_POST['showSteppedPath'] === '1';
        }
        if (isset($_POST['consentGateText'])) {
            $settings['consentGateText'] = sanitize_textarea_field($_POST['consentGateText']);
        }
        if (isset($_POST['feedbackPromptDelayHours'])) {
            $settings['feedbackPromptDelayHours'] = intval($_POST['feedbackPromptDelayHours']);
        }
        if (isset($_POST['enableDeepDive'])) {
            $settings['enableDeepDive'] = $_POST['enableDeepDive'] === '1';
        }
        if (isset($_POST['theme'])) {
            $settings['theme'] = sanitize_text_field($_POST['theme']);
        }

        // Save dosing guide settings (WordPress-local options)
        if (isset($_POST['dosingGuideEnabled'])) {
            update_option('tripdar_rec_dosing_guide_enabled', $_POST['dosingGuideEnabled'] === '1');
        }
        if (isset($_POST['storeLogo'])) {
            update_option('tripdar_rec_store_logo', esc_url_raw($_POST['storeLogo']));
        }
        if (isset($_POST['storeName'])) {
            update_option('tripdar_rec_store_name', sanitize_text_field($_POST['storeName']));
        }
        if (isset($_POST['storeAddress'])) {
            update_option('tripdar_rec_store_address', sanitize_textarea_field($_POST['storeAddress']));
        }
        if (isset($_POST['storePhone'])) {
            update_option('tripdar_rec_store_phone', sanitize_text_field($_POST['storePhone']));
        }
        if (isset($_POST['forceQr'])) {
            update_option('tripdar_rec_force_qr', $_POST['forceQr'] === '1');
        }

        // Only call the API if there are API-bound settings to save
        if (!empty($settings)) {
            $response = $this->api->update_settings($settings);

            if (!$response || !isset($response['success']) || !$response['success']) {
                wp_send_json_error($response['error'] ?? ['message' => 'Failed to save settings']);
            }
        }

        wp_send_json_success(['message' => 'Settings saved successfully']);
    }

    public function ajax_load_dashboard() {
        check_ajax_referer('tripdar_rec_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => 'Unauthorized']);
        }

        $response = $this->api->get_dashboard();

        if ($response && isset($response['success']) && $response['success']) {
            wp_send_json_success($response['data']);
        } else {
            wp_send_json_error($response['error'] ?? ['message' => 'Failed to load dashboard']);
        }
    }
}
