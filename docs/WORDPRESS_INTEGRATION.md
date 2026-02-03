# WordPress Integration Guide for TheMushroomTop.com

## Overview

This guide covers integrating Tripdar's Partner API with WordPress. Tripdar provides strain experience data; WordPress handles display and search.

## Architecture

```
┌─────────────────────┐                    ┌──────────────────────┐
│    WordPress Site   │                    │      Tripdar API     │
│  (themushroomtop)   │                    │                      │
│                     │                    │                      │
│  ┌───────────────┐  │  GET /api/v1/*     │  ┌────────────────┐  │
│  │ WP Transient  │──┼───────────────────▶│  │ Edge Middleware│  │
│  │    Cache      │  │                    │  │ (Auth + Rate)  │  │
│  └───────────────┘  │◀───────────────────┼──└────────────────┘  │
│         │           │   JSON Response    │          │           │
│         ▼           │                    │          ▼           │
│  ┌───────────────┐  │                    │  ┌────────────────┐  │
│  │  Display UI   │  │                    │  │ Public View    │  │
│  │  (Shortcodes) │  │                    │  │ Mapping        │  │
│  └───────────────┘  │                    │  └────────────────┘  │
└─────────────────────┘                    └──────────────────────┘
```

## API Endpoints

### List Strains
```
GET https://tripd.ar/api/v1/strains?page=1&pageSize=10
Authorization: Bearer tripdar_xxxxx
```

### Get Single Strain
```
GET https://tripd.ar/api/v1/strains/{slug}
Authorization: Bearer tripdar_xxxxx
```

### Get Visualization (Signed URL)
```
GET https://tripd.ar/api/v1/strains/{slug}/visualization
Authorization: Bearer tripdar_xxxxx

Response:
{
  "signedUrl": "/api/v1/assets/verify?token=...",
  "expiresAt": "2024-01-15T12:00:00Z"
}
```

## Required: WordPress Transient Caching

**Critical**: Cache API responses to reduce load and improve UX.

### PHP Implementation

```php
<?php
/**
 * Tripdar API Client with Transient Caching
 */

class Tripdar_API {
    private $api_key;
    private $base_url = 'https://tripd.ar/api/v1';

    // Cache durations (in seconds)
    const CACHE_STRAIN_LIST = 300;    // 5 minutes
    const CACHE_STRAIN_DETAIL = 600;  // 10 minutes
    const CACHE_VISUALIZATION = 1800; // 30 minutes (but URLs expire in 60 min)

    public function __construct($api_key) {
        $this->api_key = $api_key;
    }

    /**
     * Get paginated strain list with caching
     */
    public function get_strains($page = 1, $per_page = 10, $filters = []) {
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

        if ($response && $response['success']) {
            set_transient($cache_key, $response, self::CACHE_STRAIN_LIST);
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

        if ($response && $response['success']) {
            set_transient($cache_key, $response, self::CACHE_STRAIN_DETAIL);
        }

        return $response;
    }

    /**
     * Get visualization URL (shorter cache due to URL expiry)
     */
    public function get_visualization($slug) {
        $cache_key = 'tripdar_viz_' . sanitize_key($slug);

        $cached = get_transient($cache_key);
        if ($cached !== false) {
            // Check if URL is still valid (has at least 10 min left)
            $expires = strtotime($cached['data']['expiresAt']);
            if ($expires > time() + 600) {
                return $cached;
            }
            // URL expiring soon, fetch fresh
            delete_transient($cache_key);
        }

        $response = $this->request("/strains/{$slug}/visualization");

        if ($response && $response['success']) {
            set_transient($cache_key, $response, self::CACHE_VISUALIZATION);
        }

        return $response;
    }

    /**
     * Make authenticated API request
     */
    private function request($endpoint) {
        $response = wp_remote_get($this->base_url . $endpoint, [
            'headers' => [
                'Authorization' => 'Bearer ' . $this->api_key,
                'Accept' => 'application/json',
            ],
            'timeout' => 10,
        ]);

        if (is_wp_error($response)) {
            error_log('Tripdar API Error: ' . $response->get_error_message());
            return null;
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);

        // Handle rate limiting
        if ($code === 429) {
            $retry_after = wp_remote_retrieve_header($response, 'retry-after');
            error_log("Tripdar API rate limited. Retry after: {$retry_after}s");
            return ['success' => false, 'error' => ['code' => 'RATE_LIMITED']];
        }

        return json_decode($body, true);
    }

    /**
     * Clear all Tripdar caches (useful after updates)
     */
    public static function clear_cache() {
        global $wpdb;
        $wpdb->query(
            "DELETE FROM {$wpdb->options}
             WHERE option_name LIKE '_transient_tripdar_%'
             OR option_name LIKE '_transient_timeout_tripdar_%'"
        );
    }
}
```

### Shortcode Examples

```php
<?php
/**
 * Strain List Shortcode
 * Usage: [tripdar_strains per_page="12" potency="high"]
 */
function tripdar_strains_shortcode($atts) {
    $atts = shortcode_atts([
        'page' => 1,
        'per_page' => 12,
        'potency' => '',
        'beginner' => '',
    ], $atts);

    $api = new Tripdar_API(TRIPDAR_API_KEY);

    $filters = array_filter([
        'potency' => $atts['potency'],
        'beginner' => $atts['beginner'],
    ]);

    $result = $api->get_strains($atts['page'], $atts['per_page'], $filters);

    if (!$result || !$result['success']) {
        return '<p>Unable to load strains. Please try again later.</p>';
    }

    ob_start();
    ?>
    <div class="tripdar-strain-grid">
        <?php foreach ($result['data']['strains'] as $strain): ?>
            <div class="tripdar-strain-card">
                <h3><?php echo esc_html($strain['name']); ?></h3>
                <div class="potency-badge potency-<?php echo esc_attr($strain['characteristics']['potencyTier']); ?>">
                    <?php echo esc_html(ucfirst($strain['characteristics']['potencyTier'])); ?>
                </div>
                <p class="vibes">
                    <?php echo esc_html(implode(', ', $strain['vibes'])); ?>
                </p>
                <a href="<?php echo esc_url(get_permalink() . '?strain=' . $strain['slug']); ?>">
                    View Details
                </a>
            </div>
        <?php endforeach; ?>
    </div>
    <p class="tripdar-attribution">
        Data provided by <a href="https://tripd.ar">Tripdar</a> v<?php echo esc_html($result['data']['meta']['version']); ?>
    </p>
    <?php
    return ob_get_clean();
}
add_shortcode('tripdar_strains', 'tripdar_strains_shortcode');
```

## Caching Strategy Summary

| Data Type | Cache Duration | Reason |
|-----------|----------------|--------|
| Strain List | 5 minutes | Balances freshness with performance |
| Strain Detail | 10 minutes | Individual pages can cache longer |
| Visualization URL | 30 minutes | URLs expire in 60 min; refresh early |
| Search Results | 2 minutes | Users expect fresh search results |

## Rate Limiting

Your API key allows **120 requests/minute**. With proper caching:
- Strain list: ~1 request/5 min per unique filter combo
- Strain detail: ~1 request/10 min per strain
- Visualizations: ~1 request/30 min per strain

**Without caching**, you could exhaust your rate limit with just 2 concurrent users browsing.

## Error Handling

```php
// Always handle API failures gracefully
$result = $api->get_strains();

if (!$result) {
    // Network error - show cached content or fallback
    return $this->get_fallback_content();
}

if (!$result['success']) {
    switch ($result['error']['code']) {
        case 'RATE_LIMITED':
            // Wait and retry, or show cached content
            break;
        case 'INVALID_API_KEY':
            // Alert admin, show maintenance message
            break;
        default:
            // Generic error handling
    }
}
```

## Security Checklist

- [ ] API key stored in `wp-config.php`, not in database
- [ ] API key never exposed in frontend JavaScript
- [ ] HTTPS enforced on all API calls
- [ ] User input sanitized before passing to API
- [ ] Error messages don't leak API details

## Attribution Requirements

All displays of Tripdar data must include attribution:

```html
<p class="tripdar-attribution">
    Experience data by <a href="https://tripd.ar">Tripdar</a>
</p>
```

## Support

- API Documentation: https://tripd.ar/docs/api
- Integration Issues: [Contact form on tripd.ar]
- Rate Limit Increases: Request via partner portal
