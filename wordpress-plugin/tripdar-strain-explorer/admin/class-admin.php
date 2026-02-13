<?php
/**
 * Tripdar Admin Settings
 *
 * Handles the admin interface for plugin configuration.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Tripdar_Admin {

    private $api_client;

    public function __construct() {
        $this->api_client = new Tripdar_API_Client();
    }

    /**
     * Register admin hooks
     */
    public function register() {
        add_action('admin_menu', [$this, 'add_admin_menu']);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_admin_assets']);
        add_action('wp_ajax_tripdar_test_connection', [$this, 'ajax_test_connection']);
        add_action('wp_ajax_tripdar_refresh_strains', [$this, 'ajax_refresh_strains']);
    }

    /**
     * Add admin menu pages
     */
    public function add_admin_menu() {
        add_menu_page(
            'Tripdar Strain Explorer',
            'Tripdar',
            'manage_options',
            'tripdar-settings',
            [$this, 'render_settings_page'],
            'dashicons-carrot',
            30
        );

        add_submenu_page(
            'tripdar-settings',
            'Settings',
            'Settings',
            'manage_options',
            'tripdar-settings',
            [$this, 'render_settings_page']
        );

        add_submenu_page(
            'tripdar-settings',
            'Strain Inventory',
            'Strain Inventory',
            'manage_options',
            'tripdar-inventory',
            [$this, 'render_inventory_page']
        );

        add_submenu_page(
            'tripdar-settings',
            'Quiz Questions',
            'Quiz Questions',
            'manage_options',
            'tripdar-questions',
            [$this, 'render_questions_page']
        );
    }

    /**
     * Register plugin settings
     */
    public function register_settings() {
        // API Settings
        register_setting('tripdar_settings', 'tripdar_api_key', [
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
        ]);

        register_setting('tripdar_settings', 'tripdar_cache_duration', [
            'type' => 'integer',
            'sanitize_callback' => 'absint',
            'default' => 5,
        ]);

        // Strain Inventory
        register_setting('tripdar_inventory', 'tripdar_available_strains', [
            'type' => 'array',
            'sanitize_callback' => [$this, 'sanitize_strain_array'],
            'default' => [],
        ]);

        // Add settings sections
        add_settings_section(
            'tripdar_api_section',
            'API Configuration',
            [$this, 'render_api_section'],
            'tripdar-settings'
        );

        add_settings_field(
            'tripdar_api_key',
            'API Key',
            [$this, 'render_api_key_field'],
            'tripdar-settings',
            'tripdar_api_section'
        );

        add_settings_field(
            'tripdar_cache_duration',
            'Cache Duration',
            [$this, 'render_cache_field'],
            'tripdar-settings',
            'tripdar_api_section'
        );
    }

    /**
     * Sanitize strain array
     */
    public function sanitize_strain_array($input) {
        if (!is_array($input)) {
            return [];
        }
        return array_map('sanitize_key', $input);
    }

    /**
     * Enqueue admin assets
     */
    public function enqueue_admin_assets($hook) {
        if (strpos($hook, 'tripdar') === false) {
            return;
        }

        wp_enqueue_style(
            'tripdar-admin',
            TRIPDAR_PLUGIN_URL . 'assets/css/admin.css',
            [],
            TRIPDAR_VERSION
        );

        wp_enqueue_script(
            'tripdar-admin',
            TRIPDAR_PLUGIN_URL . 'assets/js/admin.js',
            ['jquery'],
            TRIPDAR_VERSION,
            true
        );

        wp_localize_script('tripdar-admin', 'tripdarAdmin', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('tripdar_admin'),
        ]);
    }

    /**
     * Render API section description
     */
    public function render_api_section() {
        echo '<p>Configure your connection to the Tripdar API. You can obtain an API key from your Tripdar partner dashboard.</p>';
    }

    /**
     * Render API key field
     */
    public function render_api_key_field() {
        $api_key = get_option('tripdar_api_key', '');
        $masked = !empty($api_key) ? substr($api_key, 0, 12) . '...' . substr($api_key, -4) : '';
        ?>
        <div class="tripdar-api-key-field">
            <input type="password"
                   id="tripdar_api_key"
                   name="tripdar_api_key"
                   value="<?php echo esc_attr($api_key); ?>"
                   class="regular-text"
                   placeholder="tripdar_xxxx...">
            <?php if (!empty($api_key)): ?>
            <span class="tripdar-api-key-masked">Current: <?php echo esc_html($masked); ?></span>
            <?php endif; ?>
            <button type="button" class="button tripdar-test-connection">
                Test Connection
            </button>
            <span class="tripdar-connection-status"></span>
        </div>
        <p class="description">
            Enter your Tripdar partner API key. This key authenticates your site with the Tripdar API.
        </p>
        <?php
    }

    /**
     * Render cache duration field
     */
    public function render_cache_field() {
        $duration = get_option('tripdar_cache_duration', 5);
        ?>
        <select name="tripdar_cache_duration" id="tripdar_cache_duration">
            <option value="1" <?php selected($duration, 1); ?>>1 minute (development)</option>
            <option value="5" <?php selected($duration, 5); ?>>5 minutes (recommended)</option>
            <option value="15" <?php selected($duration, 15); ?>>15 minutes</option>
            <option value="30" <?php selected($duration, 30); ?>>30 minutes</option>
            <option value="60" <?php selected($duration, 60); ?>>1 hour</option>
        </select>
        <p class="description">
            How long to cache API responses locally. Shorter times mean fresher data but more API calls.
        </p>
        <?php
    }

    /**
     * Render settings page
     */
    public function render_settings_page() {
        if (!current_user_can('manage_options')) {
            return;
        }

        if (isset($_GET['settings-updated'])) {
            add_settings_error('tripdar_messages', 'tripdar_message', 'Settings saved.', 'updated');
        }
        ?>
        <div class="wrap tripdar-admin">
            <h1><?php echo esc_html(get_admin_page_title()); ?></h1>

            <?php settings_errors('tripdar_messages'); ?>

            <div class="tripdar-admin__header">
                <div class="tripdar-admin__logo">
                    <svg viewBox="0 0 60 60" width="48" height="48">
                        <ellipse cx="30" cy="45" rx="6" ry="10" fill="#8b5cf6" opacity="0.6"/>
                        <ellipse cx="30" cy="28" rx="18" ry="14" fill="#8b5cf6"/>
                        <circle cx="24" cy="24" r="3" fill="white" opacity="0.3"/>
                        <circle cx="34" cy="30" r="2" fill="white" opacity="0.3"/>
                    </svg>
                </div>
                <div class="tripdar-admin__info">
                    <h2>Tripdar Strain Explorer</h2>
                    <p>Version <?php echo esc_html(TRIPDAR_VERSION); ?></p>
                </div>
            </div>

            <form action="options.php" method="post">
                <?php
                settings_fields('tripdar_settings');
                do_settings_sections('tripdar-settings');
                submit_button('Save Settings');
                ?>
            </form>

            <div class="tripdar-admin__shortcodes">
                <h3>Available Shortcodes</h3>
                <table class="widefat">
                    <thead>
                        <tr>
                            <th>Shortcode</th>
                            <th>Description</th>
                            <th>Example</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><code>[tripdar_explorer]</code></td>
                            <td>Full strain explorer with filters and pagination</td>
                            <td><code>[tripdar_explorer per_page="12"]</code></td>
                        </tr>
                        <tr>
                            <td><code>[tripdar_library]</code></td>
                            <td>Simple strain grid without filters</td>
                            <td><code>[tripdar_library columns="4"]</code></td>
                        </tr>
                        <tr>
                            <td><code>[tripdar_quiz]</code></td>
                            <td>Mystical strain finder quiz</td>
                            <td><code>[tripdar_quiz title="Find Your Strain"]</code></td>
                        </tr>
                        <tr>
                            <td><code>[tripdar_strain]</code></td>
                            <td>Single strain detail view</td>
                            <td><code>[tripdar_strain slug="golden-teacher"]</code></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        <?php
    }

    /**
     * Render inventory management page
     */
    public function render_inventory_page() {
        if (!current_user_can('manage_options')) {
            return;
        }

        // Handle form submission
        if (isset($_POST['tripdar_save_inventory']) && check_admin_referer('tripdar_inventory_nonce')) {
            $selected = isset($_POST['tripdar_strains']) ? array_map('sanitize_key', $_POST['tripdar_strains']) : [];
            update_option('tripdar_available_strains', $selected);
            add_settings_error('tripdar_messages', 'tripdar_message', 'Inventory updated.', 'updated');
        }

        // Get all strains from API
        $all_strains = $this->api_client->get_all_strain_slugs();
        $selected_strains = get_option('tripdar_available_strains', []);
        ?>
        <div class="wrap tripdar-admin">
            <h1>Strain Inventory</h1>

            <?php settings_errors('tripdar_messages'); ?>

            <p>Select which strains are available at your location. Only selected strains will appear in the explorer and quiz recommendations.</p>

            <?php if (empty($all_strains)): ?>
            <div class="notice notice-warning">
                <p>Unable to fetch strains from Tripdar API. Please check your API key in <a href="<?php echo admin_url('admin.php?page=tripdar-settings'); ?>">Settings</a>.</p>
            </div>
            <?php else: ?>

            <form method="post" class="tripdar-inventory-form">
                <?php wp_nonce_field('tripdar_inventory_nonce'); ?>

                <div class="tripdar-inventory__actions">
                    <button type="button" class="button tripdar-select-all">Select All</button>
                    <button type="button" class="button tripdar-select-none">Select None</button>
                    <button type="button" class="button tripdar-refresh-strains">
                        <span class="dashicons dashicons-update"></span> Refresh List
                    </button>
                    <span class="tripdar-inventory__count">
                        <strong><?php echo count($selected_strains); ?></strong> of <?php echo count($all_strains); ?> strains selected
                    </span>
                </div>

                <div class="tripdar-inventory__grid">
                    <?php foreach ($all_strains as $slug => $name): ?>
                    <label class="tripdar-inventory__item <?php echo in_array($slug, $selected_strains) ? 'selected' : ''; ?>">
                        <input type="checkbox"
                               name="tripdar_strains[]"
                               value="<?php echo esc_attr($slug); ?>"
                               <?php checked(in_array($slug, $selected_strains)); ?>>
                        <span class="tripdar-inventory__checkbox"></span>
                        <span class="tripdar-inventory__name"><?php echo esc_html($name); ?></span>
                    </label>
                    <?php endforeach; ?>
                </div>

                <p class="submit">
                    <input type="submit" name="tripdar_save_inventory" class="button button-primary" value="Save Inventory">
                </p>
            </form>

            <?php endif; ?>
        </div>
        <?php
    }

    /**
     * Render quiz questions management page
     */
    public function render_questions_page() {
        if (!current_user_can('manage_options')) {
            return;
        }

        // Get current quiz questions from API
        $response = $this->api_client->get_quiz_questions();
        $questions = ($response && isset($response['data']['questions'])) ? $response['data']['questions'] : [];
        ?>
        <div class="wrap tripdar-admin">
            <h1>Quiz Questions</h1>

            <div class="notice notice-info">
                <p>Quiz questions are managed centrally through Tripdar to ensure consistency across all partner sites.
                   Contact Tripdar support if you need custom questions for your site.</p>
            </div>

            <?php if (!empty($questions)): ?>
            <div class="tripdar-questions__preview">
                <h3>Current Quiz Questions</h3>

                <?php foreach ($questions as $index => $question): ?>
                <div class="tripdar-question-card">
                    <div class="tripdar-question-card__header">
                        <span class="tripdar-question-card__number"><?php echo $index + 1; ?></span>
                        <h4 class="tripdar-question-card__text"><?php echo esc_html($question['question']); ?></h4>
                    </div>
                    <div class="tripdar-question-card__answers">
                        <?php foreach ($question['answers'] as $answer): ?>
                        <div class="tripdar-answer-preview">
                            <strong><?php echo esc_html($answer['label']); ?></strong>
                            <?php if (!empty($answer['description'])): ?>
                            <span class="tripdar-answer-preview__desc"><?php echo esc_html($answer['description']); ?></span>
                            <?php endif; ?>
                            <span class="tripdar-answer-preview__tags">
                                <?php echo esc_html(implode(', ', $answer['tags'])); ?>
                            </span>
                        </div>
                        <?php endforeach; ?>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
            <?php else: ?>
            <div class="notice notice-warning">
                <p>Unable to load quiz questions. Please check your API connection.</p>
            </div>
            <?php endif; ?>
        </div>
        <?php
    }

    /**
     * AJAX: Test API connection
     */
    public function ajax_test_connection() {
        check_ajax_referer('tripdar_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => 'Unauthorized']);
        }

        $success = $this->api_client->test_connection();

        if ($success) {
            wp_send_json_success(['message' => 'Connection successful!']);
        } else {
            wp_send_json_error(['message' => 'Connection failed. Check your API key.']);
        }
    }

    /**
     * AJAX: Refresh strain list
     */
    public function ajax_refresh_strains() {
        check_ajax_referer('tripdar_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => 'Unauthorized']);
        }

        // Clear strain cache
        global $wpdb;
        $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_tripdar_strains_%'");
        $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_timeout_tripdar_strains_%'");

        // Fetch fresh
        $strains = $this->api_client->get_all_strain_slugs();

        if (!empty($strains)) {
            wp_send_json_success([
                'message' => 'Strain list refreshed.',
                'count' => count($strains),
            ]);
        } else {
            wp_send_json_error(['message' => 'Failed to fetch strains.']);
        }
    }
}
