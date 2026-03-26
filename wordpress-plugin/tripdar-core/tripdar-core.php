<?php
/**
 * Plugin Name: Tripdar Core
 * Description: Shared library for Tripdar WordPress plugins. Provides API client, caching, and base styles.
 * Version: 1.0.0
 * Author: Tripdar
 * Text Domain: tripdar-core
 */

if (!defined('ABSPATH')) exit;

// Prevent double-loading
if (defined('TRIPDAR_CORE_VERSION')) return;

define('TRIPDAR_CORE_VERSION', '1.0.0');
define('TRIPDAR_CORE_DIR', plugin_dir_path(__FILE__));
define('TRIPDAR_CORE_URL', plugin_dir_url(__FILE__));
define('TRIPDAR_API_BASE', get_option('tripdar_api_base_url', 'https://tripdar.vercel.app/api/v1'));

// Load classes
require_once TRIPDAR_CORE_DIR . 'includes/class-cache.php';
require_once TRIPDAR_CORE_DIR . 'includes/class-api-client.php';

/**
 * Get the shared API client instance
 */
function tripdar_api_client() {
    static $client = null;
    if ($client === null) {
        $client = new Tripdar_API_Client();
    }
    return $client;
}

/**
 * Get the shared cache instance
 */
function tripdar_cache() {
    static $cache = null;
    if ($cache === null) {
        $cache = new Tripdar_Cache();
    }
    return $cache;
}

/**
 * Enqueue base styles shared across Tripdar plugins
 */
function tripdar_core_enqueue_base_styles() {
    wp_enqueue_style(
        'tripdar-base',
        TRIPDAR_CORE_URL . 'assets/css/tripdar-base.css',
        [],
        TRIPDAR_CORE_VERSION
    );
    wp_enqueue_style(
        'tripdar-fonts',
        'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Lora:ital,wght@0,400;0,500;0,600;1,400&display=swap',
        [],
        null
    );
}

/**
 * Check if tripdar-core is loaded (for dependent plugins to verify)
 */
function tripdar_core_loaded() {
    return true;
}

/**
 * Register Tripdar options as writable via WP REST API
 */
add_action('rest_api_init', function() {
    register_setting('options', 'tripdar_api_key', [
        'type'         => 'string',
        'show_in_rest' => true,
        'default'      => '',
    ]);
    register_setting('options', 'tripdar_api_base_url', [
        'type'         => 'string',
        'show_in_rest' => true,
        'default'      => 'https://tripdar.vercel.app/api/v1',
    ]);
});
