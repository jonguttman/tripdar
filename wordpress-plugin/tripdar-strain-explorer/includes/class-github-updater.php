<?php
/**
 * GitHub Plugin Updater
 *
 * Checks GitHub releases for new versions and enables one-click updates
 * through the WordPress admin panel.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Tripdar_GitHub_Updater {

    private $slug;
    private $plugin_file;
    private $github_repo;
    private $github_user;
    private $current_version;
    private $plugin_name;
    private $cache_key;
    private $cache_expiry = 43200; // 12 hours

    /**
     * Initialize the updater
     */
    public function __construct($plugin_file, $github_user, $github_repo) {
        $this->plugin_file = $plugin_file;
        $this->slug = plugin_basename($plugin_file);
        $this->github_user = $github_user;
        $this->github_repo = $github_repo;
        $this->cache_key = 'tripdar_github_update_' . md5($this->slug);

        // Get current version from plugin header
        if (!function_exists('get_plugin_data')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        $plugin_data = get_plugin_data($plugin_file);
        $this->current_version = $plugin_data['Version'];
        $this->plugin_name = $plugin_data['Name'];

        // Hook into WordPress update system
        add_filter('pre_set_site_transient_update_plugins', [$this, 'check_for_update']);
        add_filter('plugins_api', [$this, 'plugin_info'], 10, 3);
        add_filter('upgrader_post_install', [$this, 'after_install'], 10, 3);

        // Add "Check for updates" link
        add_filter('plugin_action_links_' . $this->slug, [$this, 'add_action_links']);
    }

    /**
     * Check GitHub for updates
     */
    public function check_for_update($transient) {
        if (empty($transient->checked)) {
            return $transient;
        }

        $remote_data = $this->get_remote_data();

        if ($remote_data && version_compare($this->current_version, $remote_data->version, '<')) {
            $transient->response[$this->slug] = (object) [
                'slug' => dirname($this->slug),
                'plugin' => $this->slug,
                'new_version' => $remote_data->version,
                'url' => $remote_data->url,
                'package' => $remote_data->download_url,
                'icons' => [],
                'banners' => [],
                'tested' => '6.4',
                'requires_php' => '7.4',
            ];
        }

        return $transient;
    }

    /**
     * Provide plugin info for the WordPress plugin details popup
     */
    public function plugin_info($result, $action, $args) {
        if ($action !== 'plugin_information') {
            return $result;
        }

        if (!isset($args->slug) || $args->slug !== dirname($this->slug)) {
            return $result;
        }

        $remote_data = $this->get_remote_data();

        if (!$remote_data) {
            return $result;
        }

        return (object) [
            'name' => $this->plugin_name,
            'slug' => dirname($this->slug),
            'version' => $remote_data->version,
            'author' => '<a href="https://tripd.ar">Tripdar</a>',
            'homepage' => 'https://tripd.ar',
            'requires' => '5.8',
            'tested' => '6.4',
            'requires_php' => '7.4',
            'downloaded' => 0,
            'last_updated' => $remote_data->published_at,
            'sections' => [
                'description' => 'A mystical storybook-style strain explorer with quiz journey and feedback collection.',
                'changelog' => $remote_data->changelog,
            ],
            'download_link' => $remote_data->download_url,
        ];
    }

    /**
     * Rename the plugin folder after install (GitHub zips have branch/tag suffix)
     */
    public function after_install($response, $hook_extra, $result) {
        global $wp_filesystem;

        // Only process our plugin
        if (!isset($hook_extra['plugin']) || $hook_extra['plugin'] !== $this->slug) {
            return $result;
        }

        $install_dir = plugin_dir_path($this->plugin_file);
        $wp_filesystem->move($result['destination'], $install_dir);
        $result['destination'] = $install_dir;

        // Reactivate if it was active
        if (is_plugin_active($this->slug)) {
            activate_plugin($this->slug);
        }

        return $result;
    }

    /**
     * Add action links to the plugins page
     */
    public function add_action_links($links) {
        $check_link = '<a href="' . admin_url('update-core.php?force-check=1') . '">Check for updates</a>';
        array_unshift($links, $check_link);
        return $links;
    }

    /**
     * Get release data from GitHub
     */
    private function get_remote_data() {
        // Check cache first
        $cached = get_transient($this->cache_key);
        if ($cached !== false) {
            return $cached;
        }

        // Fetch from GitHub API
        $url = sprintf(
            'https://api.github.com/repos/%s/%s/releases/latest',
            $this->github_user,
            $this->github_repo
        );

        $response = wp_remote_get($url, [
            'headers' => [
                'Accept' => 'application/vnd.github.v3+json',
                'User-Agent' => 'WordPress/' . get_bloginfo('version'),
            ],
            'timeout' => 10,
        ]);

        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            return false;
        }

        $release = json_decode(wp_remote_retrieve_body($response));

        if (!$release || !isset($release->tag_name)) {
            return false;
        }

        // Parse version from tag (remove 'v' prefix if present)
        $version = ltrim($release->tag_name, 'v');

        // Find the zip asset or use the zipball
        $download_url = $release->zipball_url;
        if (!empty($release->assets)) {
            foreach ($release->assets as $asset) {
                if (strpos($asset->name, '.zip') !== false) {
                    $download_url = $asset->browser_download_url;
                    break;
                }
            }
        }

        $data = (object) [
            'version' => $version,
            'url' => $release->html_url,
            'download_url' => $download_url,
            'changelog' => $this->parse_changelog($release->body),
            'published_at' => $release->published_at,
        ];

        // Cache for 12 hours
        set_transient($this->cache_key, $data, $this->cache_expiry);

        return $data;
    }

    /**
     * Parse changelog from release body (markdown)
     */
    private function parse_changelog($body) {
        if (empty($body)) {
            return '<p>See GitHub release for details.</p>';
        }

        // Basic markdown to HTML conversion
        $html = esc_html($body);
        $html = nl2br($html);
        $html = preg_replace('/\*\*(.+?)\*\*/', '<strong>$1</strong>', $html);
        $html = preg_replace('/\*(.+?)\*/', '<em>$1</em>', $html);
        $html = preg_replace('/^- (.+)$/m', '<li>$1</li>', $html);
        $html = preg_replace('/(<li>.*<\/li>)/s', '<ul>$1</ul>', $html);

        return $html;
    }

    /**
     * Clear the update cache (useful for forcing a check)
     */
    public function clear_cache() {
        delete_transient($this->cache_key);
    }
}
