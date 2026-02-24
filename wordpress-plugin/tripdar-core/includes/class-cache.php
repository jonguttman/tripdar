<?php
/**
 * Tripdar Cache - WordPress transient wrapper
 */

if (!defined('ABSPATH')) exit;

class Tripdar_Cache {

    const DURATION_SHORT  = 300;    // 5 minutes (strain lists)
    const DURATION_MEDIUM = 600;    // 10 minutes (strain detail)
    const DURATION_LONG   = 1800;   // 30 minutes (visualizations)
    const DURATION_HOUR   = 3600;   // 1 hour (quiz/config data)

    private $multiplier;

    public function __construct() {
        $configured = get_option('tripdar_cache_duration', 5);
        $this->multiplier = max(1, intval($configured)) / 5;
    }

    public function get($key) {
        return get_transient('tripdar_' . $key);
    }

    public function set($key, $value, $duration = self::DURATION_SHORT) {
        $adjusted = intval($duration * $this->multiplier);
        set_transient('tripdar_' . $key, $value, $adjusted);
    }

    public function delete($key) {
        delete_transient('tripdar_' . $key);
    }

    public function clear_all() {
        global $wpdb;
        $wpdb->query(
            "DELETE FROM {$wpdb->options}
             WHERE option_name LIKE '_transient_tripdar_%'
             OR option_name LIKE '_transient_timeout_tripdar_%'"
        );
    }

    public function make_key($prefix, $params = []) {
        return $prefix . '_' . md5(serialize($params));
    }
}
