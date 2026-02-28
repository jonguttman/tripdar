<?php
/**
 * Tripdar Recommendation Engine API Client
 *
 * Extends the core API client with recommendation-specific methods.
 */

if (!defined('ABSPATH')) exit;

class Tripdar_Rec_API_Client extends Tripdar_API_Client {

    const CACHE_CONFIG = 3600; // 1 hour

    /**
     * Get recommendation config (mood tiles, quiz steps, sliders, etc.)
     */
    public function get_config() {
        return $this->request('/recommend/config', 'GET', null, self::CACHE_CONFIG);
    }

    /**
     * Submit recommendation request
     */
    public function get_recommendations($body) {
        return $this->post('/recommend', $body);
    }

    /**
     * Submit quick feedback rating
     */
    public function submit_feedback($body) {
        return $this->post('/recommend/feedback', $body);
    }

    /**
     * Submit deep-dive signals
     */
    public function submit_signals($body) {
        return $this->post('/recommend/feedback/signals', $body);
    }

    // =========================================================================
    // Admin API Methods
    // =========================================================================

    /**
     * Get all strains with recommendation data
     */
    public function get_admin_strains() {
        return $this->request('/admin/recommend/strains', 'GET', null, 300);
    }

    /**
     * Update a strain's recommendation config
     */
    public function update_strain_config($slug, $data) {
        return $this->put("/admin/recommend/strains/{$slug}/config", $data);
    }

    /**
     * Get feedback data for a strain
     */
    public function get_strain_feedback($slug) {
        return $this->request("/admin/recommend/strains/{$slug}/feedback", 'GET', null, 60);
    }

    /**
     * Get dashboard data
     */
    public function get_dashboard() {
        return $this->request('/admin/recommend/dashboard', 'GET', null, 60);
    }

    /**
     * Get global settings
     */
    public function get_settings() {
        return $this->request('/admin/recommend/settings', 'GET', null, 300);
    }

    /**
     * Update global settings
     */
    public function update_settings($data) {
        return $this->put('/admin/recommend/settings', $data);
    }

    /**
     * Create a dosing guide for a strain recommendation
     */
    public function create_dosing_guide($session_token, $strain_slug, $retailer_branding) {
        $body = [
            'strainSlug' => $strain_slug,
            'retailerBranding' => $retailer_branding,
        ];
        if (!empty($session_token)) {
            $body['sessionToken'] = $session_token;
        }
        return $this->post('/dosing-guide/create', $body);
    }
}
