<?php
/**
 * Tripdar Shortcodes
 *
 * Handles all shortcode rendering for the plugin.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Tripdar_Shortcodes {

    private $api_client;

    public function __construct() {
        $this->api_client = new Tripdar_API_Client();
    }

    /**
     * Register all shortcodes
     */
    public function register() {
        add_shortcode('tripdar_explorer', [$this, 'render_explorer']);
        add_shortcode('tripdar_library', [$this, 'render_library']);
        add_shortcode('tripdar_quiz', [$this, 'render_quiz']);
        add_shortcode('tripdar_strain', [$this, 'render_single_strain']);
        add_shortcode('tripdar_search', [$this, 'render_search']);
        add_shortcode('tripdar_lineage', [$this, 'render_lineage']);
        add_shortcode('tripdar_collection', [$this, 'render_collection']);
        add_shortcode('tripdar_collections', [$this, 'render_collections_list']);
        add_shortcode('tripdar_reviews', [$this, 'render_reviews']);
        add_shortcode('tripdar_reports', [$this, 'render_trip_reports']);
        add_shortcode('tripdar_report_form', [$this, 'render_report_form']);
        // New data value shortcodes
        add_shortcode('tripdar_compare', [$this, 'render_compare']);
        add_shortcode('tripdar_recommendations', [$this, 'render_recommendations']);
        add_shortcode('tripdar_similar', [$this, 'render_similar']);
        add_shortcode('tripdar_dosage_curve', [$this, 'render_dosage_curve']);
        add_shortcode('tripdar_lineage_tree', [$this, 'render_lineage_tree']);
    }

    /**
     * [tripdar_search] - Strain search with autocomplete
     */
    public function render_search($atts) {
        $atts = shortcode_atts([
            'placeholder' => 'Search strains...',
            'limit' => 10,
            'show_details' => 'true',
        ], $atts);

        $show_details = filter_var($atts['show_details'], FILTER_VALIDATE_BOOLEAN);

        ob_start();
        ?>
        <div class="tripdar-search" data-limit="<?php echo esc_attr($atts['limit']); ?>">
            <div class="tripdar-search__input-wrapper">
                <input type="text"
                       class="tripdar-search__input"
                       placeholder="<?php echo esc_attr($atts['placeholder']); ?>"
                       autocomplete="off"
                       data-tripdar-search>
                <span class="tripdar-search__icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="M21 21l-4.35-4.35"></path>
                    </svg>
                </span>
                <span class="tripdar-search__loading" style="display: none;">
                    <svg width="20" height="20" viewBox="0 0 24 24" class="tripdar-spinner">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="31.4" stroke-linecap="round">
                            <animateTransform attributeName="transform" type="rotate" dur="1s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
                        </circle>
                    </svg>
                </span>
            </div>
            <div class="tripdar-search__results" style="display: none;">
                <!-- Results populated by JS -->
            </div>
            <?php if ($show_details): ?>
            <div class="tripdar-search__detail" style="display: none;">
                <!-- Selected strain detail populated by JS -->
            </div>
            <?php endif; ?>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * [tripdar_lineage] - Display strain family tree
     */
    public function render_lineage($atts) {
        $atts = shortcode_atts([
            'slug' => '',
            'show_children' => 'true',
            'max_depth' => 3,
        ], $atts);

        if (empty($atts['slug'])) {
            return '<p class="tripdar-error">Please specify a strain slug.</p>';
        }

        $response = $this->api_client->get_lineage($atts['slug']);

        if (!$response || !isset($response['success']) || !$response['success']) {
            return '<p class="tripdar-error">Could not load strain lineage.</p>';
        }

        $lineage = $response['data']['lineage'];
        $show_children = filter_var($atts['show_children'], FILTER_VALIDATE_BOOLEAN);

        ob_start();
        ?>
        <div class="tripdar-lineage">
            <h3 class="tripdar-lineage__title">
                Family Tree: <?php echo esc_html($lineage['name']); ?>
            </h3>

            <?php if (!empty($lineage['lineageNotes'])): ?>
            <p class="tripdar-lineage__notes">
                <?php echo esc_html($lineage['lineageNotes']); ?>
            </p>
            <?php endif; ?>

            <div class="tripdar-lineage__tree">
                <?php $this->render_lineage_node($lineage, 0, intval($atts['max_depth'])); ?>
            </div>

            <?php if ($show_children && !empty($lineage['children'])): ?>
            <div class="tripdar-lineage__children">
                <h4 class="tripdar-lineage__children-title">Derived Strains</h4>
                <ul class="tripdar-lineage__children-list">
                    <?php foreach ($lineage['children'] as $childId): ?>
                    <li><?php echo esc_html(ucwords(str_replace('-', ' ', $childId))); ?></li>
                    <?php endforeach; ?>
                </ul>
            </div>
            <?php endif; ?>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Recursively render a lineage node
     */
    private function render_lineage_node($node, $depth, $maxDepth) {
        if ($depth > $maxDepth) return;

        $indent = str_repeat('  ', $depth);
        $potency_class = $this->get_potency_class($node['potency']);
        ?>
        <div class="tripdar-lineage__node tripdar-lineage__node--depth-<?php echo $depth; ?>">
            <div class="tripdar-lineage__node-content">
                <span class="tripdar-lineage__node-name"><?php echo esc_html($node['name']); ?></span>
                <span class="tripdar-lineage__node-meta">
                    <span class="tripdar-lineage__potency tripdar-lineage__potency--<?php echo esc_attr($potency_class); ?>">
                        <?php echo esc_html($node['potency']); ?>
                    </span>
                </span>
            </div>
            <?php if (!empty($node['parents'])): ?>
            <div class="tripdar-lineage__parents">
                <?php foreach ($node['parents'] as $parent): ?>
                    <?php $this->render_lineage_node($parent, $depth + 1, $maxDepth); ?>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>
        </div>
        <?php
    }

    /**
     * Get CSS class for potency level
     */
    private function get_potency_class($potency) {
        $potency_lower = strtolower($potency);
        if (strpos($potency_lower, 'very high') !== false || strpos($potency_lower, 'high') !== false) {
            return 'intense';
        } elseif (strpos($potency_lower, 'low') !== false) {
            return 'gentle';
        }
        return 'moderate';
    }

    /**
     * [tripdar_collection slug="..."] - Display a single curated collection
     */
    public function render_collection($atts) {
        $atts = shortcode_atts([
            'slug' => '',
            'columns' => 3,
            'show_description' => 'true',
        ], $atts);

        if (empty($atts['slug'])) {
            return '<p class="tripdar-error">Please specify a collection slug.</p>';
        }

        $response = $this->api_client->get_collection($atts['slug']);

        if (!$response || !isset($response['success']) || !$response['success']) {
            return '<p class="tripdar-error">Could not load collection.</p>';
        }

        $collection = $response['data']['collection'];
        $strains = $response['data']['strains'] ?? [];
        $show_description = filter_var($atts['show_description'], FILTER_VALIDATE_BOOLEAN);

        ob_start();
        ?>
        <div class="tripdar-collection">
            <div class="tripdar-collection__header">
                <?php if (!empty($collection['coverImage'])): ?>
                <div class="tripdar-collection__cover">
                    <img src="<?php echo esc_url($collection['coverImage']); ?>"
                         alt="<?php echo esc_attr($collection['name']); ?>">
                </div>
                <?php endif; ?>
                <div class="tripdar-collection__info">
                    <h2 class="tripdar-collection__title"><?php echo esc_html($collection['name']); ?></h2>
                    <?php if ($show_description && !empty($collection['description'])): ?>
                    <p class="tripdar-collection__description"><?php echo esc_html($collection['description']); ?></p>
                    <?php endif; ?>
                    <div class="tripdar-collection__meta">
                        <span class="tripdar-collection__count"><?php echo count($strains); ?> strains</span>
                        <?php if (!empty($collection['tags'])): ?>
                        <div class="tripdar-collection__tags">
                            <?php foreach ($collection['tags'] as $tag): ?>
                            <span class="tripdar-tag"><?php echo esc_html($tag); ?></span>
                            <?php endforeach; ?>
                        </div>
                        <?php endif; ?>
                    </div>
                </div>
            </div>

            <?php if (!empty($strains)): ?>
            <div class="tripdar-collection__grid tripdar-collection__grid--cols-<?php echo esc_attr($atts['columns']); ?>">
                <?php foreach ($strains as $strain): ?>
                    <?php echo $this->render_strain_card($this->normalize_strain($strain)); ?>
                <?php endforeach; ?>
            </div>
            <?php else: ?>
            <p class="tripdar-collection__empty">This collection is empty.</p>
            <?php endif; ?>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * [tripdar_collections] - Display a list of all collections
     */
    public function render_collections_list($atts) {
        $atts = shortcode_atts([
            'featured_only' => 'false',
            'columns' => 3,
        ], $atts);

        $response = $this->api_client->get_collections();

        if (!$response || !isset($response['success']) || !$response['success']) {
            return '<p class="tripdar-error">Could not load collections.</p>';
        }

        $collections = $response['data']['collections'] ?? [];
        $featured_only = filter_var($atts['featured_only'], FILTER_VALIDATE_BOOLEAN);

        // Filter to featured only if requested
        if ($featured_only) {
            $collections = array_filter($collections, function($c) {
                return !empty($c['featured']);
            });
        }

        if (empty($collections)) {
            return '<p class="tripdar-collection__empty">No collections available.</p>';
        }

        ob_start();
        ?>
        <div class="tripdar-collections-list tripdar-collections-list--cols-<?php echo esc_attr($atts['columns']); ?>">
            <?php foreach ($collections as $collection): ?>
            <a href="?collection=<?php echo esc_attr($collection['slug']); ?>" class="tripdar-collection-card">
                <?php if (!empty($collection['coverImage'])): ?>
                <div class="tripdar-collection-card__image">
                    <img src="<?php echo esc_url($collection['coverImage']); ?>"
                         alt="<?php echo esc_attr($collection['name']); ?>">
                </div>
                <?php else: ?>
                <div class="tripdar-collection-card__placeholder">
                    <svg viewBox="0 0 60 60" class="tripdar-placeholder-icon">
                        <rect x="10" y="10" width="40" height="40" rx="4" fill="currentColor" opacity="0.3"/>
                        <rect x="18" y="18" width="10" height="10" rx="2" fill="currentColor"/>
                        <rect x="32" y="18" width="10" height="10" rx="2" fill="currentColor"/>
                        <rect x="18" y="32" width="10" height="10" rx="2" fill="currentColor"/>
                        <rect x="32" y="32" width="10" height="10" rx="2" fill="currentColor"/>
                    </svg>
                </div>
                <?php endif; ?>
                <div class="tripdar-collection-card__content">
                    <h3 class="tripdar-collection-card__title"><?php echo esc_html($collection['name']); ?></h3>
                    <?php if (!empty($collection['description'])): ?>
                    <p class="tripdar-collection-card__description">
                        <?php echo esc_html(wp_trim_words($collection['description'], 15)); ?>
                    </p>
                    <?php endif; ?>
                    <span class="tripdar-collection-card__count">
                        <?php echo count($collection['strains'] ?? []); ?> strains
                    </span>
                    <?php if (!empty($collection['featured'])): ?>
                    <span class="tripdar-collection-card__featured">Featured</span>
                    <?php endif; ?>
                </div>
            </a>
            <?php endforeach; ?>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * [tripdar_reviews slug="..."] - Display ratings and reviews for a strain
     */
    public function render_reviews($atts) {
        $atts = shortcode_atts([
            'slug' => '',
            'show_form' => 'true',
            'per_page' => 10,
        ], $atts);

        if (empty($atts['slug'])) {
            return '<p class="tripdar-error">Please specify a strain slug.</p>';
        }

        $response = $this->api_client->get_ratings($atts['slug']);
        $show_form = filter_var($atts['show_form'], FILTER_VALIDATE_BOOLEAN);

        $aggregation = null;
        $reviews = [];
        if ($response && isset($response['success']) && $response['success']) {
            $aggregation = $response['data']['aggregation'] ?? null;
            $reviews = $response['data']['recentReviews'] ?? [];
        }

        $strain_name = ucwords(str_replace('-', ' ', $atts['slug']));

        ob_start();
        ?>
        <div class="tripdar-reviews" data-strain-slug="<?php echo esc_attr($atts['slug']); ?>">
            <!-- Ratings Summary -->
            <div class="tripdar-reviews__summary">
                <h3 class="tripdar-reviews__title">Community Ratings</h3>
                <?php if ($aggregation && $aggregation['totalRatings'] > 0): ?>
                <div class="tripdar-reviews__stats">
                    <div class="tripdar-reviews__average">
                        <span class="tripdar-reviews__score"><?php echo number_format($aggregation['averageRating'], 1); ?></span>
                        <span class="tripdar-reviews__stars"><?php echo $this->render_stars($aggregation['averageRating']); ?></span>
                    </div>
                    <span class="tripdar-reviews__count"><?php echo $aggregation['totalRatings']; ?> ratings</span>
                    <div class="tripdar-reviews__distribution">
                        <?php for ($i = 5; $i >= 1; $i--):
                            $count = $aggregation['distribution'][$i] ?? 0;
                            $percent = $aggregation['totalRatings'] > 0 ? ($count / $aggregation['totalRatings']) * 100 : 0;
                        ?>
                        <div class="tripdar-reviews__bar-row">
                            <span class="tripdar-reviews__bar-label"><?php echo $i; ?> star</span>
                            <div class="tripdar-reviews__bar">
                                <div class="tripdar-reviews__bar-fill" style="width: <?php echo $percent; ?>%"></div>
                            </div>
                            <span class="tripdar-reviews__bar-count"><?php echo $count; ?></span>
                        </div>
                        <?php endfor; ?>
                    </div>
                </div>
                <?php else: ?>
                <p class="tripdar-reviews__no-ratings">No ratings yet. Be the first to rate <?php echo esc_html($strain_name); ?>!</p>
                <?php endif; ?>
            </div>

            <?php if ($show_form): ?>
            <!-- Rating Form -->
            <div class="tripdar-reviews__form">
                <h4 class="tripdar-reviews__form-title">Rate this strain</h4>
                <div class="tripdar-reviews__star-input" data-rating="0">
                    <?php for ($i = 1; $i <= 5; $i++): ?>
                    <button type="button" class="tripdar-reviews__star" data-value="<?php echo $i; ?>">
                        <svg viewBox="0 0 24 24" width="32" height="32">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="none" stroke="currentColor" stroke-width="2"/>
                        </svg>
                    </button>
                    <?php endfor; ?>
                </div>
                <button class="tripdar-btn tripdar-btn--primary tripdar-reviews__submit-rating" disabled>
                    Submit Rating
                </button>
                <div class="tripdar-reviews__form-message" style="display: none;"></div>
            </div>
            <?php endif; ?>

            <!-- Reviews List -->
            <?php if (!empty($reviews)): ?>
            <div class="tripdar-reviews__list">
                <h4 class="tripdar-reviews__list-title">Recent Reviews</h4>
                <?php foreach ($reviews as $review): ?>
                <div class="tripdar-reviews__review">
                    <div class="tripdar-reviews__review-header">
                        <span class="tripdar-reviews__review-stars"><?php echo $this->render_stars($review['rating']); ?></span>
                        <span class="tripdar-reviews__review-date">
                            <?php echo date('M j, Y', strtotime($review['createdAt'])); ?>
                        </span>
                    </div>
                    <?php if (!empty($review['title'])): ?>
                    <h5 class="tripdar-reviews__review-title"><?php echo esc_html($review['title']); ?></h5>
                    <?php endif; ?>
                    <p class="tripdar-reviews__review-body"><?php echo esc_html($review['body']); ?></p>
                </div>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Render star rating display
     */
    private function render_stars($rating) {
        $full = floor($rating);
        $half = ($rating - $full) >= 0.5 ? 1 : 0;
        $empty = 5 - $full - $half;

        $output = str_repeat('★', $full);
        if ($half) {
            $output .= '½';
        }
        $output .= str_repeat('☆', $empty);

        return $output;
    }

    /**
     * [tripdar_reports slug="..."] - Display approved trip reports for a strain
     */
    public function render_trip_reports($atts) {
        $atts = shortcode_atts([
            'slug' => '',
            'per_page' => 5,
        ], $atts);

        if (empty($atts['slug'])) {
            return '<p class="tripdar-error">Please specify a strain slug.</p>';
        }

        $response = $this->api_client->get_trip_reports($atts['slug'], 1, intval($atts['per_page']));

        if (!$response || !isset($response['success']) || !$response['success']) {
            return '<p class="tripdar-error">Could not load trip reports.</p>';
        }

        $reports = $response['data']['reports'] ?? [];
        $total = $response['data']['total'] ?? 0;
        $strain_name = ucwords(str_replace('-', ' ', $atts['slug']));

        ob_start();
        ?>
        <div class="tripdar-trip-reports" data-strain-slug="<?php echo esc_attr($atts['slug']); ?>">
            <h3 class="tripdar-trip-reports__title">TripTales for <?php echo esc_html($strain_name); ?></h3>

            <?php if (empty($reports)): ?>
            <p class="tripdar-trip-reports__empty">
                No TripTales yet. Be the first to share your experience!
            </p>
            <?php else: ?>
            <p class="tripdar-trip-reports__count"><?php echo $total; ?> experience<?php echo $total === 1 ? '' : 's'; ?> shared</p>

            <div class="tripdar-trip-reports__list">
                <?php foreach ($reports as $report): ?>
                <article class="tripdar-trip-report">
                    <header class="tripdar-trip-report__header">
                        <h4 class="tripdar-trip-report__title"><?php echo esc_html($report['title']); ?></h4>
                        <div class="tripdar-trip-report__meta">
                            <span class="tripdar-trip-report__dose tripdar-trip-report__dose--<?php echo esc_attr(strtolower($report['doseCategory'])); ?>">
                                <?php echo esc_html($report['doseCategory']); ?> (<?php echo esc_html($report['doseAmount']); ?>)
                            </span>
                            <span class="tripdar-trip-report__setting"><?php echo esc_html(ucfirst($report['setting'])); ?></span>
                            <?php if (!empty($report['peakIntensity'])): ?>
                            <span class="tripdar-trip-report__intensity">Peak: <?php echo $report['peakIntensity']; ?>/10</span>
                            <?php endif; ?>
                            <?php if (!empty($report['duration'])): ?>
                            <span class="tripdar-trip-report__duration"><?php echo esc_html($report['duration']); ?></span>
                            <?php endif; ?>
                        </div>
                    </header>

                    <?php if (!empty($report['intention'])): ?>
                    <p class="tripdar-trip-report__intention">
                        <strong>Intention:</strong> <?php echo esc_html($report['intention']); ?>
                    </p>
                    <?php endif; ?>

                    <div class="tripdar-trip-report__body">
                        <?php echo nl2br(esc_html($report['body'])); ?>
                    </div>

                    <footer class="tripdar-trip-report__footer">
                        <span class="tripdar-trip-report__date">
                            <?php echo date('M j, Y', strtotime($report['createdAt'])); ?>
                        </span>
                    </footer>
                </article>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * [tripdar_report_form slug="..."] - Trip report submission form
     */
    public function render_report_form($atts) {
        $atts = shortcode_atts([
            'slug' => '',
        ], $atts);

        if (empty($atts['slug'])) {
            return '<p class="tripdar-error">Please specify a strain slug.</p>';
        }

        $strain_name = ucwords(str_replace('-', ' ', $atts['slug']));
        $dose_categories = ['MICRODOSE', 'LOW', 'MODERATE', 'HIGH', 'HEROIC'];
        $settings = ['nature', 'home', 'ceremony', 'social', 'solo', 'therapeutic', 'creative', 'other'];

        ob_start();
        ?>
        <div class="tripdar-report-form" data-strain-slug="<?php echo esc_attr($atts['slug']); ?>">
            <h3 class="tripdar-report-form__title">Share Your Experience with <?php echo esc_html($strain_name); ?></h3>
            <p class="tripdar-report-form__intro">Help others by sharing your TripTale. All submissions are reviewed before publishing.</p>

            <form class="tripdar-report-form__form">
                <div class="tripdar-report-form__row">
                    <div class="tripdar-report-form__field">
                        <label class="tripdar-report-form__label">Dose Category *</label>
                        <select name="doseCategory" class="tripdar-report-form__select" required>
                            <option value="">Select...</option>
                            <?php foreach ($dose_categories as $cat): ?>
                            <option value="<?php echo esc_attr($cat); ?>"><?php echo esc_html(ucfirst(strtolower($cat))); ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="tripdar-report-form__field">
                        <label class="tripdar-report-form__label">Dose Amount *</label>
                        <input type="text" name="doseAmount" class="tripdar-report-form__input" placeholder="e.g., 2.5g" required>
                    </div>
                </div>

                <div class="tripdar-report-form__row">
                    <div class="tripdar-report-form__field">
                        <label class="tripdar-report-form__label">Setting *</label>
                        <select name="setting" class="tripdar-report-form__select" required>
                            <option value="">Select...</option>
                            <?php foreach ($settings as $setting): ?>
                            <option value="<?php echo esc_attr($setting); ?>"><?php echo esc_html(ucfirst($setting)); ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="tripdar-report-form__field">
                        <label class="tripdar-report-form__label">Duration</label>
                        <input type="text" name="duration" class="tripdar-report-form__input" placeholder="e.g., 4-6 hours">
                    </div>
                </div>

                <div class="tripdar-report-form__field">
                    <label class="tripdar-report-form__label">Peak Intensity (1-10)</label>
                    <input type="number" name="peakIntensity" class="tripdar-report-form__input" min="1" max="10" placeholder="5">
                </div>

                <div class="tripdar-report-form__field">
                    <label class="tripdar-report-form__label">Intention (optional)</label>
                    <input type="text" name="intention" class="tripdar-report-form__input" placeholder="What were you hoping to achieve?">
                </div>

                <div class="tripdar-report-form__field">
                    <label class="tripdar-report-form__label">Title *</label>
                    <input type="text" name="title" class="tripdar-report-form__input" placeholder="Give your experience a title" required>
                </div>

                <div class="tripdar-report-form__field">
                    <label class="tripdar-report-form__label">Your Experience * (min 50 characters)</label>
                    <textarea name="body" class="tripdar-report-form__textarea" rows="8" placeholder="Describe your experience in detail..." required></textarea>
                    <span class="tripdar-report-form__charcount">0 / 50 minimum</span>
                </div>

                <button type="submit" class="tripdar-btn tripdar-btn--primary tripdar-report-form__submit">
                    Submit TripTale
                </button>

                <div class="tripdar-report-form__message" style="display: none;"></div>
            </form>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Normalize strain data from API format to template format
     */
    private function normalize_strain($strain) {
        if (!is_array($strain)) {
            return $strain;
        }

        // Get vibes (API returns 'vibes', normalize to array)
        $vibes = [];
        if (isset($strain['vibes']) && is_array($strain['vibes'])) {
            $vibes = $strain['vibes'];
        } elseif (isset($strain['vibe']) && is_array($strain['vibe'])) {
            $vibes = $strain['vibe'];
        }

        // Get characteristics
        $chars = isset($strain['characteristics']) ? $strain['characteristics'] : [];

        // Map potency tier to display text
        $potency_map = [
            'very-high' => 'Very High',
            'high' => 'High',
            'moderate' => 'Moderate',
            'low' => 'Low',
            'variable' => 'Variable',
        ];
        $potency_tier = isset($chars['potencyTier']) ? $chars['potencyTier'] : 'moderate';
        $potency = isset($potency_map[$potency_tier]) ? $potency_map[$potency_tier] : ucfirst($potency_tier);

        // Map visual intensity
        $visual_map = [
            'very-high' => 'Very High',
            'high' => 'High',
            'medium' => 'Medium',
            'low' => 'Low',
        ];
        $visual_tier = isset($chars['visualIntensity']) ? $chars['visualIntensity'] : 'medium';
        $visual = isset($visual_map[$visual_tier]) ? $visual_map[$visual_tier] : ucfirst($visual_tier);

        // Map stability
        $stability_tier = isset($chars['experienceStability']) ? $chars['experienceStability'] : 'medium';
        $stability = ucfirst($stability_tier);

        // Map beginner suitable
        $beginner = isset($chars['beginnerSuitable']) ? $chars['beginnerSuitable'] : 'maybe';

        // Dose sensitivity
        $dose_sensitivity = isset($chars['doseSensitivity']) ? $chars['doseSensitivity'] : '';

        // Experience profile
        $exp = isset($strain['experienceProfile']) ? $strain['experienceProfile'] : [];
        $experience_profile = [
            'onsetTime' => isset($exp['onsetTime']) ? $exp['onsetTime'] : null,
            'typicalDuration' => isset($exp['typicalDuration']) ? $exp['typicalDuration'] : null,
            'bodyHeadBalance' => isset($exp['bodyHeadBalance']) ? $exp['bodyHeadBalance'] : null,
            'emotionalCharacter' => isset($exp['emotionalCharacter']) && is_array($exp['emotionalCharacter']) ? $exp['emotionalCharacter'] : [],
            'comeUpIntensity' => isset($exp['comeUpIntensity']) ? $exp['comeUpIntensity'] : null,
            'peakCharacter' => isset($exp['peakCharacter']) ? $exp['peakCharacter'] : null,
        ];

        // Lineage
        $lin = isset($strain['lineage']) ? $strain['lineage'] : [];
        $lineage = [
            'parentStrains' => isset($lin['parentStrains']) && is_array($lin['parentStrains']) ? $lin['parentStrains'] : [],
            'lineageNotes' => isset($lin['lineageNotes']) ? $lin['lineageNotes'] : null,
            'generation' => isset($lin['generation']) ? $lin['generation'] : null,
        ];

        return [
            'slug' => isset($strain['slug']) ? $strain['slug'] : '',
            'name' => isset($strain['name']) ? $strain['name'] : '',
            'description' => isset($strain['description']) ? $strain['description'] : '',
            'vibes' => $vibes,
            'potency' => $potency,
            'potencyTier' => $potency_tier,
            'visual' => $visual,
            'stability' => $stability,
            'beginnerFriendly' => $beginner,
            'doseSensitivity' => $dose_sensitivity,
            'experienceProfile' => $experience_profile,
            'lineage' => $lineage,
            'species' => isset($strain['species']) ? $strain['species'] : 'Psilocybe cubensis',
            'origin' => isset($strain['origin']) ? $strain['origin'] : '',
            'confidenceTier' => isset($strain['confidenceTier']) ? $strain['confidenceTier'] : '',
            'visualizationUrl' => isset($strain['visualizationRef']) ? $strain['visualizationRef'] : (isset($strain['visualizationUrl']) ? $strain['visualizationUrl'] : ''),
        ];
    }

    /**
     * [tripdar_explorer] - Full strain explorer with filters
     */
    public function render_explorer($atts) {
        $atts = shortcode_atts([
            'per_page' => 12,
            'show_filters' => 'true',
        ], $atts);

        // Get available strains from settings
        $available_strains = get_option('tripdar_available_strains', []);

        // Fetch strains
        $filters = [];
        if (!empty($available_strains)) {
            $filters['slugs'] = implode(',', $available_strains);
        }

        $response = $this->api_client->get_strains(1, intval($atts['per_page']), $filters);

        if (!$response || !isset($response['success']) || !$response['success']) {
            return $this->render_error('Unable to load strains. Please try again later.');
        }

        $strains = $response['data']['strains'] ?? [];
        $pagination = $response['data']['pagination'] ?? [];

        // Fetch ALL strains to count vibes across the entire catalog (not just first page)
        $all_strains_response = $this->api_client->get_strains(1, 100, $filters);
        $all_strains = ($all_strains_response && isset($all_strains_response['success']) && $all_strains_response['success'])
            ? ($all_strains_response['data']['strains'] ?? [])
            : $strains;

        // Extract all vibes and count frequency for filter dropdown
        $vibe_counts = [];
        foreach ($all_strains as $strain) {
            $normalized = $this->normalize_strain($strain);
            if (!empty($normalized['vibes']) && is_array($normalized['vibes'])) {
                foreach ($normalized['vibes'] as $vibe) {
                    $vibe_lower = strtolower($vibe);
                    $vibe_counts[$vibe_lower] = ($vibe_counts[$vibe_lower] ?? 0) + 1;
                }
            }
        }
        // Filter to vibes that appear in 3+ strains and sort alphabetically
        $popular_vibes = array_keys(array_filter($vibe_counts, function($count) { return $count >= 3; }));
        sort($popular_vibes);

        // Debug: If no vibes found, fallback to default set
        if (empty($popular_vibes)) {
            $popular_vibes = ['social', 'euphoric', 'playful', 'mystical', 'intense', 'immersive', 'clear', 'cinematic', 'bright'];
        }

        ob_start();
        ?>
        <div class="tripdar-explorer" data-per-page="<?php echo esc_attr($atts['per_page']); ?>">
            <?php if ($atts['show_filters'] === 'true'): ?>
            <div class="tripdar-explorer__header">
                <div class="tripdar-explorer__filters">
                    <div class="tripdar-filter-group">
                        <label class="tripdar-filter-label">Vibe</label>
                        <select class="tripdar-filter-select" data-filter="vibe">
                            <option value="">All Vibes</option>
                            <?php foreach ($popular_vibes as $vibe): ?>
                            <option value="<?php echo esc_attr($vibe); ?>"><?php echo esc_html(ucfirst($vibe)); ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="tripdar-filter-group">
                        <label class="tripdar-filter-label">Intensity</label>
                        <select class="tripdar-filter-select" data-filter="potency">
                            <option value="">All Levels</option>
                            <option value="gentle">Gentle</option>
                            <option value="moderate">Moderate</option>
                            <option value="intense">Intense</option>
                        </select>
                    </div>
                    <div class="tripdar-filter-group">
                        <label class="tripdar-filter-label">Experience</label>
                        <select class="tripdar-filter-select" data-filter="beginner">
                            <option value="">All Levels</option>
                            <option value="beginner">Beginner Friendly</option>
                            <option value="experienced">Experienced</option>
                        </select>
                    </div>
                </div>
                <?php endif; ?>
            </div>

            <div class="tripdar-explorer__grid">
                <?php foreach ($strains as $strain): ?>
                    <?php echo $this->render_strain_card($this->normalize_strain($strain)); ?>
                <?php endforeach; ?>
            </div>

            <?php if (!empty($pagination) && isset($pagination['hasMore']) && $pagination['hasMore']): ?>
            <div class="tripdar-explorer__pagination">
                <button class="tripdar-btn tripdar-btn--load-more"
                        data-page="2"
                        data-total-pages="<?php echo esc_attr($pagination['totalPages']); ?>">
                    Discover More Strains
                </button>
            </div>
            <?php endif; ?>

            <div class="tripdar-explorer__loading" style="display: none;">
                <div class="tripdar-loading-spinner"></div>
                <span>Loading strains...</span>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * [tripdar_library] - Simple strain grid without filters
     */
    public function render_library($atts) {
        $atts = shortcode_atts([
            'per_page' => 20,
            'columns' => 4,
        ], $atts);

        $available_strains = get_option('tripdar_available_strains', []);

        $filters = [];
        if (!empty($available_strains)) {
            $filters['slugs'] = implode(',', $available_strains);
        }

        $response = $this->api_client->get_strains(1, intval($atts['per_page']), $filters);

        if (!$response || !isset($response['success']) || !$response['success']) {
            return $this->render_error('Unable to load strain library.');
        }

        $strains = $response['data']['strains'] ?? [];

        ob_start();
        ?>
        <div class="tripdar-library tripdar-library--cols-<?php echo esc_attr($atts['columns']); ?>">
            <?php foreach ($strains as $strain): ?>
                <?php echo $this->render_strain_card($this->normalize_strain($strain), 'compact'); ?>
            <?php endforeach; ?>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * [tripdar_quiz] - Mystical strain finder quiz
     */
    public function render_quiz($atts) {
        $atts = shortcode_atts([
            'title' => 'Discover Your Strain',
            'show_alternatives' => 'true',
        ], $atts);

        // Fetch quiz questions
        $response = $this->api_client->get_quiz_questions();

        if (!$response || !isset($response['success']) || !$response['success']) {
            return $this->render_error('Unable to load the strain finder. Please try again later.');
        }

        $questions = $response['data']['questions'] ?? [];
        $available_strains = get_option('tripdar_available_strains', []);

        ob_start();
        ?>
        <div class="tripdar-quiz"
             data-available-strains="<?php echo esc_attr(json_encode($available_strains)); ?>"
             data-show-alternatives="<?php echo esc_attr($atts['show_alternatives']); ?>">

            <!-- Welcome Screen -->
            <div class="tripdar-quiz__screen tripdar-quiz__screen--welcome active">
                <div class="tripdar-quiz__illustration">
                    <svg viewBox="0 0 120 120" class="tripdar-crystal-ball">
                        <defs>
                            <radialGradient id="crystal-glow" cx="50%" cy="50%" r="50%">
                                <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.6"/>
                                <stop offset="100%" stop-color="#6d28d9" stop-opacity="0.2"/>
                            </radialGradient>
                        </defs>
                        <circle cx="60" cy="55" r="40" fill="url(#crystal-glow)" stroke="#a78bfa" stroke-width="2"/>
                        <ellipse cx="60" cy="100" rx="25" ry="8" fill="#6d28d9" opacity="0.3"/>
                        <path d="M45 45 Q50 35, 55 45" stroke="white" stroke-width="2" fill="none" opacity="0.5"/>
                    </svg>
                </div>
                <h2 class="tripdar-quiz__title"><?php echo esc_html($atts['title']); ?></h2>
                <p class="tripdar-quiz__intro">
                    Answer a few questions and discover the strain that resonates with your journey.
                </p>
                <button class="tripdar-btn tripdar-btn--primary tripdar-quiz__start">
                    Begin Your Journey
                </button>
            </div>

            <!-- Questions Container -->
            <div class="tripdar-quiz__questions" style="display: none;">
                <?php foreach ($questions as $index => $question): ?>
                <div class="tripdar-quiz__screen tripdar-quiz__screen--question"
                     data-question-id="<?php echo esc_attr($question['id']); ?>"
                     data-question-index="<?php echo esc_attr($index); ?>">
                    <div class="tripdar-quiz__progress">
                        <div class="tripdar-quiz__progress-bar">
                            <div class="tripdar-quiz__progress-fill" style="width: <?php echo (($index + 1) / count($questions)) * 100; ?>%"></div>
                        </div>
                        <span class="tripdar-quiz__progress-text"><?php echo $index + 1; ?> of <?php echo count($questions); ?></span>
                    </div>

                    <h3 class="tripdar-quiz__question-text"><?php echo esc_html($question['question']); ?></h3>

                    <div class="tripdar-quiz__answers">
                        <?php foreach ($question['answers'] as $answer): ?>
                        <button class="tripdar-quiz__answer" data-answer-id="<?php echo esc_attr($answer['id']); ?>">
                            <span class="tripdar-quiz__answer-label"><?php echo esc_html($answer['label']); ?></span>
                            <?php if (!empty($answer['description'])): ?>
                            <span class="tripdar-quiz__answer-desc"><?php echo esc_html($answer['description']); ?></span>
                            <?php endif; ?>
                        </button>
                        <?php endforeach; ?>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>

            <!-- Loading Screen -->
            <div class="tripdar-quiz__screen tripdar-quiz__screen--loading" style="display: none;">
                <div class="tripdar-quiz__divination">
                    <div class="tripdar-divination-orb"></div>
                    <p class="tripdar-quiz__loading-text">Finding your match...</p>
                </div>
            </div>

            <!-- Result Screen -->
            <div class="tripdar-quiz__screen tripdar-quiz__screen--result" style="display: none;">
                <div class="tripdar-quiz__result-content">
                    <!-- Populated via JavaScript -->
                </div>
            </div>

            <!-- No Match Screen -->
            <div class="tripdar-quiz__screen tripdar-quiz__screen--no-match" style="display: none;">
                <div class="tripdar-quiz__illustration">
                    <svg viewBox="0 0 80 80" class="tripdar-empty-tome">
                        <rect x="15" y="10" width="50" height="60" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>
                        <line x1="25" y1="25" x2="55" y2="25" stroke="currentColor" stroke-width="1" opacity="0.5"/>
                        <line x1="25" y1="35" x2="55" y2="35" stroke="currentColor" stroke-width="1" opacity="0.5"/>
                        <line x1="25" y1="45" x2="45" y2="45" stroke="currentColor" stroke-width="1" opacity="0.5"/>
                    </svg>
                </div>
                <h3 class="tripdar-quiz__no-match-title">No Matches Found</h3>
                <p class="tripdar-quiz__no-match-text">
                    No strains currently available match your journey. Check back soon as new strains are added to the collection.
                </p>
                <button class="tripdar-btn tripdar-btn--secondary tripdar-quiz__restart">
                    Try Again
                </button>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * [tripdar_strain slug="golden-teacher"] - Single strain display
     */
    public function render_single_strain($atts) {
        $atts = shortcode_atts([
            'slug' => '',
            'show_feedback' => 'true',
        ], $atts);

        if (empty($atts['slug'])) {
            return $this->render_error('Please specify a strain slug.');
        }

        $response = $this->api_client->get_strain($atts['slug']);

        if (!$response || !isset($response['success']) || !$response['success']) {
            return $this->render_error('Strain not found.');
        }

        $raw_strain = $response['data']['strain'] ?? null;
        if (!$raw_strain) {
            return $this->render_error('Strain data unavailable.');
        }

        $strain = $this->normalize_strain($raw_strain);

        // Get visualization
        $viz = $this->api_client->get_visualization($atts['slug']);
        $image_url = '';
        if ($viz && isset($viz['data'])) {
            $image_url = $viz['data']['visualizationUrl'] ?? $viz['data']['url'] ?? '';
        }

        ob_start();
        echo $this->render_strain_detail_html($strain, $image_url, $atts['show_feedback'] === 'true');
        return ob_get_clean();
    }

    /**
     * Public method to render strain card (for AJAX)
     */
    public function render_strain_card_public($strain, $variant = 'default') {
        return $this->render_strain_card($this->normalize_strain($strain), $variant);
    }

    /**
     * Public method to render strain detail (for AJAX modal)
     */
    public function render_strain_detail_public($strain, $image_url = '') {
        return $this->render_strain_detail_html($this->normalize_strain($strain), $image_url, true);
    }

    /**
     * Render strain detail HTML
     */
    private function render_strain_detail_html($strain, $image_url = '', $show_feedback = true) {
        $has_experience = $this->has_experience_data($strain['experienceProfile']);
        $has_lineage = $this->has_lineage_data($strain['lineage']);

        ob_start();
        ?>
        <div class="tripdar-strain-detail" data-strain-slug="<?php echo esc_attr($strain['slug']); ?>">
            <div class="tripdar-strain-detail__header">
                <?php if ($image_url): ?>
                <div class="tripdar-strain-detail__image">
                    <img src="<?php echo esc_url($image_url); ?>" alt="<?php echo esc_attr($strain['name']); ?>">
                </div>
                <?php endif; ?>

                <div class="tripdar-strain-detail__info">
                    <h2 class="tripdar-strain-detail__name"><?php echo esc_html($strain['name']); ?><?php echo $this->render_confidence_badge($strain['confidenceTier']); ?></h2>

                    <div class="tripdar-strain-detail__tags">
                        <?php if (!empty($strain['vibes']) && is_array($strain['vibes'])): ?>
                            <?php
                            $vibe_descriptions = $this->get_vibe_descriptions();
                            foreach ($strain['vibes'] as $vibe):
                                $description = isset($vibe_descriptions[$vibe]) ? $vibe_descriptions[$vibe] : '';
                            ?>
                            <span class="tripdar-tag tripdar-tag--vibe" data-tooltip="<?php echo esc_attr($description); ?>"><?php echo esc_html($vibe); ?></span>
                            <?php endforeach; ?>
                        <?php endif; ?>
                        <span class="tripdar-tag tripdar-tag--potency tripdar-tag--<?php echo esc_attr($strain['potencyTier']); ?>">
                            <?php echo esc_html($strain['potency']); ?>
                        </span>
                        <?php if ($strain['beginnerFriendly'] === 'yes'): ?>
                        <span class="tripdar-tag tripdar-tag--beginner">Beginner Friendly</span>
                        <?php endif; ?>
                        <?php echo $this->render_dose_sensitivity_tag($strain['doseSensitivity']); ?>
                    </div>
                </div>
            </div>

            <!-- Tab Navigation -->
            <div class="tripdar-detail-tabs">
                <button class="tripdar-detail-tabs__tab active" data-tab="overview">Overview</button>
                <button class="tripdar-detail-tabs__tab" data-tab="experience">Experience</button>
                <?php if ($has_lineage): ?>
                <button class="tripdar-detail-tabs__tab" data-tab="lineage">Lineage</button>
                <?php endif; ?>
            </div>

            <!-- Tab: Overview -->
            <div class="tripdar-detail-tabs__panel active" data-panel="overview">
                <div class="tripdar-strain-detail__body">
                    <div class="tripdar-strain-detail__section">
                        <h3 class="tripdar-section-title">The Journey</h3>
                        <p class="tripdar-strain-detail__description"><?php echo esc_html($strain['description']); ?></p>
                    </div>

                    <div class="tripdar-visual-scales">
                        <?php echo $this->render_visual_scale('Trip Consistency', $strain['stability']); ?>
                        <?php echo $this->render_visual_scale('Visual Intensity', $strain['visual']); ?>
                        <?php if (!empty($strain['doseSensitivity'])): ?>
                        <?php echo $this->render_visual_scale('Dose Sensitivity', ucfirst($strain['doseSensitivity'])); ?>
                        <?php endif; ?>
                    </div>
                </div>
            </div>

            <!-- Tab: Experience Profile -->
            <div class="tripdar-detail-tabs__panel" data-panel="experience">
                <div class="tripdar-strain-detail__body">
                    <div class="tripdar-strain-detail__section">
                        <h3 class="tripdar-section-title">Experience Profile</h3>
                        <?php echo $this->render_experience_profile($strain['experienceProfile']); ?>
                    </div>
                </div>
            </div>

            <?php if ($has_lineage): ?>
            <!-- Tab: Lineage -->
            <div class="tripdar-detail-tabs__panel" data-panel="lineage">
                <div class="tripdar-strain-detail__body">
                    <div class="tripdar-strain-detail__section">
                        <h3 class="tripdar-section-title">Lineage</h3>
                        <?php echo $this->render_lineage_section($strain['lineage']); ?>
                    </div>
                </div>
            </div>
            <?php endif; ?>

            <?php if ($show_feedback): ?>
            <div class="tripdar-strain-detail__feedback">
                <?php echo $this->render_feedback_widget($strain['slug'], $strain['name'] ?? ''); ?>
            </div>
            <?php endif; ?>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Render a strain card
     */
    private function render_strain_card($strain, $variant = 'default') {
        // Use visualization URL from strain data (included in list response)
        $image_url = $strain['visualizationUrl'] ?? '';

        ob_start();
        ?>
        <div class="tripdar-strain-card tripdar-strain-card--<?php echo esc_attr($variant); ?>"
             data-slug="<?php echo esc_attr($strain['slug']); ?>">
            <div class="tripdar-strain-card__image-wrapper">
                <?php if ($image_url): ?>
                <img class="tripdar-strain-card__image"
                     src="<?php echo esc_url($image_url); ?>"
                     alt="<?php echo esc_attr($strain['name']); ?>"
                     loading="lazy">
                <?php else: ?>
                <div class="tripdar-strain-card__placeholder">
                    <svg viewBox="0 0 60 60" class="tripdar-placeholder-icon">
                        <ellipse cx="30" cy="45" rx="6" ry="10" fill="currentColor" opacity="0.5"/>
                        <ellipse cx="30" cy="28" rx="18" ry="14" fill="currentColor"/>
                    </svg>
                </div>
                <?php endif; ?>
                <div class="tripdar-strain-card__overlay">
                    <span class="tripdar-strain-card__potency tripdar-potency--<?php echo esc_attr($strain['potencyTier']); ?>">
                        <?php echo esc_html($strain['potency']); ?>
                    </span>
                </div>
            </div>
            <div class="tripdar-strain-card__content">
                <h3 class="tripdar-strain-card__name"><?php echo esc_html($strain['name']); ?><?php echo $this->render_confidence_badge($strain['confidenceTier']); ?></h3>
                <div class="tripdar-strain-card__vibes">
                    <?php if (!empty($strain['vibes']) && is_array($strain['vibes'])): ?>
                        <?php
                        $vibe_descriptions = $this->get_vibe_descriptions();
                        foreach (array_slice($strain['vibes'], 0, 2) as $vibe):
                            $description = isset($vibe_descriptions[$vibe]) ? $vibe_descriptions[$vibe] : '';
                        ?>
                        <span class="tripdar-vibe-tag" data-tooltip="<?php echo esc_attr($description); ?>"><?php echo esc_html($vibe); ?></span>
                        <?php endforeach; ?>
                    <?php endif; ?>
                    <?php echo $this->render_dose_sensitivity_tag($strain['doseSensitivity']); ?>
                </div>
                <?php if ($variant !== 'compact'): ?>
                <div class="tripdar-strain-card__scales">
                    <?php echo $this->render_mini_scale('Visual', $strain['visual']); ?>
                    <?php echo $this->render_mini_scale('Consistency', $strain['stability']); ?>
                </div>
                <?php endif; ?>
                <div class="tripdar-strain-card__actions">
                    <button class="tripdar-btn tripdar-btn--ghost tripdar-strain-card__explore">
                        Explore
                    </button>
                    <?php if ($this->has_lineage_data($strain['lineage'])): ?>
                    <span class="tripdar-strain-card__lineage-link">View Lineage</span>
                    <?php endif; ?>
                    <button class="tripdar-tried-btn" data-slug="<?php echo esc_attr($strain['slug']); ?>">
                        <span class="tripdar-tried-btn__icon">&#10003;</span>
                        <span class="tripdar-tried-btn__text">I've tried this</span>
                    </button>
                </div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Render feedback widget
     */
    private function render_feedback_widget($strain_slug, $strain_name = '') {
        if (empty($strain_name)) {
            $strain_name = ucwords(str_replace('-', ' ', $strain_slug));
        }
        ob_start();
        ?>
        <div class="tripdar-feedback" data-strain-slug="<?php echo esc_attr($strain_slug); ?>" data-strain-name="<?php echo esc_attr($strain_name); ?>">
            <div class="tripdar-feedback__prompt">
                <h4 class="tripdar-feedback__title">Share Your Experience</h4>
                <p class="tripdar-feedback__subtitle">Does this description match your journey with <?php echo esc_html($strain_name); ?>?</p>
            </div>

            <div class="tripdar-feedback__rating">
                <div class="tripdar-rating-slider">
                    <input type="range"
                           class="tripdar-rating-slider__input"
                           min="1"
                           max="5"
                           value="3"
                           step="1">
                    <div class="tripdar-rating-slider__labels">
                        <span class="tripdar-rating-label" data-value="1">Not at all</span>
                        <span class="tripdar-rating-label" data-value="3">Somewhat</span>
                        <span class="tripdar-rating-label" data-value="5">Spot on</span>
                    </div>
                </div>
                <button class="tripdar-btn tripdar-btn--primary tripdar-feedback__submit">
                    Submit Feedback
                </button>
            </div>

            <div class="tripdar-feedback__thanks" style="display: none;">
                <p class="tripdar-feedback__thanks-text">Thank you for sharing your experience!</p>
            </div>

            <div class="tripdar-feedback__survey-prompt" style="display: none;">
                <p class="tripdar-feedback__survey-text">
                    Your experience differs from our data. Help us improve by sharing more details?
                </p>
                <button class="tripdar-btn tripdar-btn--secondary tripdar-feedback__survey-start">
                    Share Feedback (45 seconds)
                </button>
                <button class="tripdar-btn tripdar-btn--ghost tripdar-feedback__survey-skip">
                    Maybe Later
                </button>
            </div>

            <div class="tripdar-feedback__survey" style="display: none;">
                <!-- Survey loaded via JavaScript -->
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Render a visual scale bar for a given attribute
     */
    private function render_visual_scale($label, $value) {
        $level = $this->get_scale_level($value);
        $is_variable = ($level === -1);
        $fill_percent = $is_variable ? 50 : ($level / 5) * 100;

        if ($is_variable) {
            $color_class = 'variable';
        } elseif ($level >= 4) {
            $color_class = 'high';
        } elseif ($level >= 3) {
            $color_class = 'medium';
        } else {
            $color_class = 'low';
        }

        ob_start();
        ?>
        <div class="tripdar-scale">
            <div class="tripdar-scale__header">
                <span class="tripdar-scale__label"><?php echo esc_html($label); ?></span>
                <span class="tripdar-scale__value"><?php echo esc_html($value); ?></span>
            </div>
            <div class="tripdar-scale__track">
                <div class="tripdar-scale__fill tripdar-scale__fill--<?php echo esc_attr($color_class); ?>"
                     style="width: <?php echo $fill_percent; ?>%"></div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Get numeric scale level from text value
     */
    private function get_scale_level($value) {
        $v = strtolower(preg_replace('/[^a-z]/i', '', $value));
        if (strpos($v, 'veryhigh') !== false) return 5;
        if (strpos($v, 'high') !== false) return 4;
        if (strpos($v, 'mediumhigh') !== false) return 3.5;
        if (strpos($v, 'medium') !== false) return 3;
        if (strpos($v, 'lowmedium') !== false) return 2.5;
        if (strpos($v, 'low') !== false) return 2;
        if (strpos($v, 'variable') !== false) return -1;
        return 3;
    }

    // =========================================================================
    // NEW DATA VALUE SHORTCODES
    // =========================================================================

    /**
     * [tripdar_compare] - Strain comparison tool
     *
     * Usage: [tripdar_compare] or [tripdar_compare strains="golden-teacher,penis-envy"]
     */
    public function render_compare($atts) {
        $atts = shortcode_atts([
            'strains' => '', // Comma-separated pre-selected strains
            'max' => 5,
        ], $atts);

        // Get all strains for the selector
        $response = $this->api_client->get_strains(1, 50);
        $all_strains = [];
        if ($response && isset($response['success']) && $response['success']) {
            $all_strains = $response['data']['strains'] ?? [];
        }

        // Pre-selected strains
        $preselected = array_filter(array_map('trim', explode(',', $atts['strains'])));

        ob_start();
        ?>
        <div class="tripdar-compare" data-max="<?php echo esc_attr($atts['max']); ?>">
            <div class="tripdar-compare__header">
                <h3 class="tripdar-compare__title">Compare Strains</h3>
                <p class="tripdar-compare__subtitle">Select 2-5 strains to compare side by side</p>
            </div>

            <div class="tripdar-compare__selector">
                <div class="tripdar-compare__selected">
                    <?php foreach ($preselected as $slug): ?>
                    <span class="tripdar-compare__chip" data-slug="<?php echo esc_attr($slug); ?>">
                        <?php echo esc_html(ucwords(str_replace('-', ' ', $slug))); ?>
                        <button class="tripdar-compare__chip-remove">&times;</button>
                    </span>
                    <?php endforeach; ?>
                </div>
                <select class="tripdar-compare__dropdown">
                    <option value="">Add a strain...</option>
                    <?php foreach ($all_strains as $strain): ?>
                    <option value="<?php echo esc_attr($strain['slug']); ?>"
                            <?php echo in_array($strain['slug'], $preselected) ? 'disabled' : ''; ?>>
                        <?php echo esc_html($strain['name']); ?>
                    </option>
                    <?php endforeach; ?>
                </select>
                <button class="tripdar-btn tripdar-btn--primary tripdar-compare__run" <?php echo count($preselected) < 2 ? 'disabled' : ''; ?>>
                    Compare Selected
                </button>
            </div>

            <div class="tripdar-compare__loading" style="display: none;">
                <div class="tripdar-loading-spinner"></div>
                <span>Comparing strains...</span>
            </div>

            <div class="tripdar-compare__results" style="display: none;">
                <!-- Populated via JavaScript -->
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * [tripdar_recommendations] - Personalized strain recommendations
     */
    public function render_recommendations($atts) {
        $atts = shortcode_atts([
            'limit' => 5,
            'title' => 'Recommended For You',
        ], $atts);

        ob_start();
        ?>
        <div class="tripdar-recommendations" data-limit="<?php echo esc_attr($atts['limit']); ?>">
            <div class="tripdar-recommendations__header">
                <h3 class="tripdar-recommendations__title"><?php echo esc_html($atts['title']); ?></h3>
                <p class="tripdar-recommendations__subtitle">Based on strains you've tried and rated</p>
            </div>

            <div class="tripdar-recommendations__content">
                <div class="tripdar-recommendations__loading">
                    <div class="tripdar-loading-spinner"></div>
                    <span>Finding your recommendations...</span>
                </div>

                <div class="tripdar-recommendations__list" style="display: none;">
                    <!-- Populated via JavaScript -->
                </div>

                <div class="tripdar-recommendations__empty" style="display: none;">
                    <div class="tripdar-recommendations__empty-icon">
                        <svg viewBox="0 0 60 60" width="60" height="60">
                            <circle cx="30" cy="30" r="25" fill="none" stroke="currentColor" stroke-width="2" opacity="0.5"/>
                            <path d="M30 20 L30 35 M30 40 L30 42" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </div>
                    <p class="tripdar-recommendations__empty-text">
                        Mark some strains as "I've tried this" to get personalized recommendations!
                    </p>
                </div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * [tripdar_similar slug="..."] - Similar strains widget
     */
    public function render_similar($atts) {
        $atts = shortcode_atts([
            'slug' => '',
            'limit' => 4,
            'title' => 'Similar Strains',
        ], $atts);

        if (empty($atts['slug'])) {
            return '<p class="tripdar-error">Please specify a strain slug.</p>';
        }

        $response = $this->api_client->get_similar($atts['slug'], intval($atts['limit']));

        if (!$response || !isset($response['success']) || !$response['success']) {
            return ''; // Silently fail - similar strains are optional
        }

        $similar = $response['data']['similar'] ?? [];

        if (empty($similar)) {
            return ''; // No similar strains found
        }

        $strain_name = ucwords(str_replace('-', ' ', $atts['slug']));

        ob_start();
        ?>
        <div class="tripdar-similar">
            <h4 class="tripdar-similar__title"><?php echo esc_html($atts['title']); ?></h4>
            <p class="tripdar-similar__subtitle">If you like <?php echo esc_html($strain_name); ?>, you might also enjoy:</p>

            <div class="tripdar-similar__grid">
                <?php foreach ($similar as $strain): ?>
                <div class="tripdar-similar__card" data-slug="<?php echo esc_attr($strain['slug']); ?>">
                    <div class="tripdar-similar__card-content">
                        <h5 class="tripdar-similar__card-name"><?php echo esc_html($strain['name']); ?></h5>
                        <div class="tripdar-similar__card-meta">
                            <span class="tripdar-similar__score" title="Similarity Score">
                                <?php echo round($strain['score'] * 100); ?>% match
                            </span>
                            <?php if (!empty($strain['reason'])): ?>
                            <span class="tripdar-similar__reason"><?php echo esc_html($strain['reason']); ?></span>
                            <?php endif; ?>
                        </div>
                    </div>
                    <button class="tripdar-btn tripdar-btn--ghost tripdar-similar__explore">View</button>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * [tripdar_dosage_curve slug="..."] - Dosage curve visualization
     */
    public function render_dosage_curve($atts) {
        $atts = shortcode_atts([
            'slug' => '',
            'show_legend' => 'true',
        ], $atts);

        if (empty($atts['slug'])) {
            return '<p class="tripdar-error">Please specify a strain slug.</p>';
        }

        $response = $this->api_client->get_dosage_curve($atts['slug']);

        if (!$response || !isset($response['success']) || !$response['success']) {
            return ''; // Silently fail if no data
        }

        $curve = $response['data'] ?? [];
        $data_points = $curve['dataPoints'] ?? [];
        $show_legend = filter_var($atts['show_legend'], FILTER_VALIDATE_BOOLEAN);

        if (empty($data_points)) {
            return ''; // No dosage data available
        }

        $strain_name = ucwords(str_replace('-', ' ', $atts['slug']));

        // Dose category display names
        $dose_labels = [
            'MICRODOSE' => 'Microdose',
            'LOW' => 'Low',
            'MODERATE' => 'Moderate',
            'HIGH' => 'High',
            'HEROIC' => 'Heroic',
        ];

        ob_start();
        ?>
        <div class="tripdar-dosage-curve">
            <h4 class="tripdar-dosage-curve__title">Intensity by Dose</h4>
            <p class="tripdar-dosage-curve__subtitle">
                Community-reported peak intensity for <?php echo esc_html($strain_name); ?>
            </p>

            <div class="tripdar-dosage-curve__chart">
                <?php foreach ($data_points as $point):
                    $category = $point['doseCategory'];
                    $avg = $point['avgPeakIntensity'] ?? 0;
                    $min = $point['minPeakIntensity'] ?? 0;
                    $max = $point['maxPeakIntensity'] ?? 0;
                    $count = $point['reportCount'] ?? 0;
                    $height_pct = ($avg / 10) * 100;
                    $range_bottom = ($min / 10) * 100;
                    $range_top = ($max / 10) * 100;
                ?>
                <div class="tripdar-dosage-curve__bar-group">
                    <div class="tripdar-dosage-curve__bar-wrapper">
                        <div class="tripdar-dosage-curve__range"
                             style="bottom: <?php echo $range_bottom; ?>%; height: <?php echo ($range_top - $range_bottom); ?>%;">
                        </div>
                        <div class="tripdar-dosage-curve__bar tripdar-dosage-curve__bar--<?php echo esc_attr(strtolower($category)); ?>"
                             style="height: <?php echo $height_pct; ?>%;"
                             title="Avg: <?php echo number_format($avg, 1); ?>/10 (<?php echo $count; ?> reports)">
                        </div>
                    </div>
                    <span class="tripdar-dosage-curve__label">
                        <?php echo esc_html($dose_labels[$category] ?? $category); ?>
                    </span>
                    <span class="tripdar-dosage-curve__value"><?php echo number_format($avg, 1); ?></span>
                </div>
                <?php endforeach; ?>
            </div>

            <?php if ($show_legend): ?>
            <div class="tripdar-dosage-curve__legend">
                <span class="tripdar-dosage-curve__legend-item">
                    <span class="tripdar-dosage-curve__legend-bar"></span>
                    Average intensity
                </span>
                <span class="tripdar-dosage-curve__legend-item">
                    <span class="tripdar-dosage-curve__legend-range"></span>
                    Range (min-max)
                </span>
            </div>
            <?php endif; ?>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * [tripdar_lineage_tree] - Full interactive lineage tree
     */
    public function render_lineage_tree($atts) {
        $atts = shortcode_atts([
            'highlight' => '', // Strain to highlight in tree
        ], $atts);

        $response = $this->api_client->get_lineage_tree();

        if (!$response || !isset($response['success']) || !$response['success']) {
            return $this->render_error('Could not load lineage tree.');
        }

        $tree = $response['data'] ?? [];
        $roots = $tree['roots'] ?? [];
        $all_nodes = $tree['nodes'] ?? [];
        $highlight = $atts['highlight'];

        ob_start();
        ?>
        <div class="tripdar-lineage-tree" data-highlight="<?php echo esc_attr($highlight); ?>">
            <div class="tripdar-lineage-tree__header">
                <h3 class="tripdar-lineage-tree__title">Strain Family Tree</h3>
                <p class="tripdar-lineage-tree__subtitle">Explore genetic relationships between strains</p>
            </div>

            <div class="tripdar-lineage-tree__controls">
                <input type="text"
                       class="tripdar-lineage-tree__search"
                       placeholder="Search strains..."
                       autocomplete="off">
                <div class="tripdar-lineage-tree__legend">
                    <span class="tripdar-lineage-tree__legend-item tripdar-lineage-tree__legend-item--gen0">Wild Type</span>
                    <span class="tripdar-lineage-tree__legend-item tripdar-lineage-tree__legend-item--gen1">1st Gen</span>
                    <span class="tripdar-lineage-tree__legend-item tripdar-lineage-tree__legend-item--gen2">2nd Gen</span>
                </div>
            </div>

            <div class="tripdar-lineage-tree__container">
                <?php foreach ($roots as $rootId):
                    $root = $all_nodes[$rootId] ?? null;
                    if ($root):
                        $this->render_tree_node($root, $all_nodes, 0, $highlight);
                    endif;
                endforeach; ?>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Recursively render tree node
     */
    private function render_tree_node($node, $all_nodes, $depth, $highlight = '') {
        $is_highlighted = ($node['id'] === $highlight);
        $gen_class = 'gen' . ($node['generation'] ?? 0);
        ?>
        <div class="tripdar-tree-node tripdar-tree-node--<?php echo esc_attr($gen_class); ?> <?php echo $is_highlighted ? 'tripdar-tree-node--highlighted' : ''; ?>"
             data-strain="<?php echo esc_attr($node['id']); ?>">
            <div class="tripdar-tree-node__content">
                <span class="tripdar-tree-node__name"><?php echo esc_html($node['name']); ?></span>
                <span class="tripdar-tree-node__potency tripdar-potency--<?php echo esc_attr($this->get_potency_class($node['potency'] ?? 'Moderate')); ?>">
                    <?php echo esc_html($node['potency'] ?? ''); ?>
                </span>
            </div>
            <?php if (!empty($node['children'])): ?>
            <div class="tripdar-tree-node__children">
                <?php foreach ($node['children'] as $childId):
                    $child = $all_nodes[$childId] ?? null;
                    if ($child):
                        $this->render_tree_node($child, $all_nodes, $depth + 1, $highlight);
                    endif;
                endforeach; ?>
            </div>
            <?php endif; ?>
        </div>
        <?php
    }

    /**
     * Render confidence badge
     */
    public function render_confidence_badge($slug_or_tier) {
        // If a tier string is passed directly, use it; otherwise fetch from API
        if (is_string($slug_or_tier) && in_array($slug_or_tier, ['high-confidence', 'established', 'developing', 'emerging'])) {
            $tier = $slug_or_tier;
        } else {
            // Legacy: Try to fetch from API
            $response = $this->api_client->get_confidence($slug_or_tier);
            if (!$response || !isset($response['success']) || !$response['success']) {
                return ''; // No confidence data
            }
            $data = $response['data'] ?? [];
            $tier = $data['verifiedTier'] ?? 'emerging';
        }

        // Only show badge for established or high-confidence (hide emerging and developing)
        if ($tier === 'emerging' || $tier === 'developing') {
            return '';
        }

        $tier_tooltips = [
            'high-confidence' => 'Well-researched strain with extensive community data and consistent reports',
            'established' => 'Solid data from multiple sources — effects are well-documented',
        ];

        // SVG shield icon — filled for high-confidence, half for established
        $shield_svg = '';
        if ($tier === 'high-confidence') {
            $shield_svg = '<svg class="tripdar-confidence__svg" viewBox="0 0 16 18" fill="none" xmlns="http://www.w3.org/2000/svg">'
                . '<path d="M8 1L2 4v5c0 4 2.5 6.5 6 8 3.5-1.5 6-4 6-8V4L8 1z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>'
                . '<path d="M5.5 9L7 10.5L10.5 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>'
                . '</svg>';
        } else {
            $shield_svg = '<svg class="tripdar-confidence__svg" viewBox="0 0 16 18" fill="none" xmlns="http://www.w3.org/2000/svg">'
                . '<path d="M8 1L2 4v5c0 4 2.5 6.5 6 8 3.5-1.5 6-4 6-8V4L8 1z" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>'
                . '<path d="M5.5 9L7 10.5L10.5 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>'
                . '</svg>';
        }

        ob_start();
        ?>
        <span class="tripdar-confidence tripdar-confidence--<?php echo esc_attr($tier); ?>"
             data-tooltip="<?php echo esc_attr($tier_tooltips[$tier] ?? ''); ?>">
            <?php echo $shield_svg; ?>
        </span>
        <?php
        return ob_get_clean();
    }

    /**
     * Render a compact mini-scale bar for strain cards
     */
    private function render_mini_scale($label, $value) {
        $level = $this->get_scale_level($value);
        $is_variable = ($level === -1);
        $fill_percent = $is_variable ? 50 : ($level / 5) * 100;

        if ($is_variable) {
            $color_class = 'variable';
        } elseif ($level >= 4) {
            $color_class = 'high';
        } elseif ($level >= 3) {
            $color_class = 'medium';
        } else {
            $color_class = 'low';
        }

        ob_start();
        ?>
        <div class="tripdar-mini-scale" title="<?php echo esc_attr($label . ': ' . $value); ?>">
            <span class="tripdar-mini-scale__label"><?php echo esc_html($label); ?></span>
            <div class="tripdar-mini-scale__track">
                <div class="tripdar-mini-scale__fill tripdar-scale__fill--<?php echo esc_attr($color_class); ?>"
                     style="width: <?php echo $fill_percent; ?>%"></div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Render dose sensitivity tag for strain cards
     */
    private function render_dose_sensitivity_tag($value) {
        if (empty($value)) return '';

        $labels = [
            'gentle' => 'Gentle Curve',
            'moderate' => 'Moderate Curve',
            'steep' => 'Steep Curve',
        ];

        $label = isset($labels[$value]) ? $labels[$value] : ucfirst($value);

        ob_start();
        ?>
        <span class="tripdar-dose-tag tripdar-dose-tag--<?php echo esc_attr($value); ?>"><?php echo esc_html($label); ?></span>
        <?php
        return ob_get_clean();
    }

    /**
     * Check if strain has experience profile data
     */
    private function has_experience_data($profile) {
        if (empty($profile) || !is_array($profile)) return false;
        return !empty($profile['onsetTime'])
            || !empty($profile['typicalDuration'])
            || !empty($profile['bodyHeadBalance'])
            || !empty($profile['emotionalCharacter'])
            || !empty($profile['comeUpIntensity'])
            || !empty($profile['peakCharacter']);
    }

    /**
     * Check if strain has lineage data
     */
    private function has_lineage_data($lineage) {
        if (empty($lineage) || !is_array($lineage)) return false;
        return !empty($lineage['parentStrains'])
            || !empty($lineage['lineageNotes'])
            || (!is_null($lineage['generation']) && $lineage['generation'] > 0);
    }

    /**
     * Render experience profile tab content
     */
    private function render_experience_profile($profile) {
        if (!$this->has_experience_data($profile)) {
            ob_start();
            ?>
            <div class="tripdar-experience-empty">
                <p>Experience data still being collected for this strain.</p>
            </div>
            <?php
            return ob_get_clean();
        }

        $attributes = [];
        if (!empty($profile['onsetTime'])) {
            $attributes[] = ['label' => 'Onset Time', 'value' => $profile['onsetTime'], 'icon' => '&#9203;'];
        }
        if (!empty($profile['typicalDuration'])) {
            $attributes[] = ['label' => 'Duration', 'value' => $profile['typicalDuration'], 'icon' => '&#9202;'];
        }
        if (!empty($profile['comeUpIntensity'])) {
            $attributes[] = ['label' => 'Come-Up', 'value' => $profile['comeUpIntensity'], 'icon' => '&#9650;'];
        }
        if (!empty($profile['peakCharacter'])) {
            $attributes[] = ['label' => 'Peak Character', 'value' => $profile['peakCharacter'], 'icon' => '&#9733;'];
        }

        ob_start();
        ?>
        <div class="tripdar-experience-grid">
            <?php foreach ($attributes as $attr): ?>
            <div class="tripdar-experience-card">
                <span class="tripdar-experience-card__icon"><?php echo $attr['icon']; ?></span>
                <span class="tripdar-experience-card__label"><?php echo esc_html($attr['label']); ?></span>
                <span class="tripdar-experience-card__value"><?php echo esc_html($attr['value']); ?></span>
            </div>
            <?php endforeach; ?>
        </div>

        <?php if (!empty($profile['bodyHeadBalance'])): ?>
            <?php echo $this->render_balance_spectrum($profile['bodyHeadBalance']); ?>
        <?php endif; ?>

        <?php if (!empty($profile['emotionalCharacter'])): ?>
        <div class="tripdar-experience-emotions">
            <span class="tripdar-experience-emotions__label">Emotional Character</span>
            <div class="tripdar-experience-emotions__tags">
                <?php
                $emotion_descriptions = $this->get_emotion_descriptions();
                foreach ($profile['emotionalCharacter'] as $emotion):
                    $desc = isset($emotion_descriptions[$emotion]) ? $emotion_descriptions[$emotion] : '';
                ?>
                <span class="tripdar-tag tripdar-tag--vibe" data-tooltip="<?php echo esc_attr($desc); ?>"><?php echo esc_html($emotion); ?></span>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>
        <?php
        return ob_get_clean();
    }

    /**
     * Render body/head balance spectrum bar
     */
    private function render_balance_spectrum($value) {
        $positions = [
            'body-heavy' => 10,
            'body-leaning' => 25,
            'balanced' => 50,
            'head-leaning' => 75,
            'head-heavy' => 85,
            'head-dominant' => 95,
        ];

        $position = isset($positions[$value]) ? $positions[$value] : 50;
        $display = ucwords(str_replace('-', ' ', $value));

        ob_start();
        ?>
        <div class="tripdar-balance-spectrum">
            <span class="tripdar-balance-spectrum__label">Body / Head Balance</span>
            <div class="tripdar-balance-spectrum__bar">
                <span class="tripdar-balance-spectrum__end">Body</span>
                <div class="tripdar-balance-spectrum__track">
                    <div class="tripdar-balance-spectrum__marker" style="left: <?php echo $position; ?>%"
                         title="<?php echo esc_attr($display); ?>"></div>
                </div>
                <span class="tripdar-balance-spectrum__end">Head</span>
            </div>
            <span class="tripdar-balance-spectrum__value"><?php echo esc_html($display); ?></span>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Render lineage section for detail modal
     */
    private function render_lineage_section($lineage) {
        if (!$this->has_lineage_data($lineage)) {
            return '';
        }

        ob_start();
        ?>
        <div class="tripdar-detail-lineage">
            <?php if (!is_null($lineage['generation'])): ?>
            <div class="tripdar-detail-lineage__generation">
                <?php
                $gen = intval($lineage['generation']);
                if ($gen === 0) {
                    $gen_label = 'Wild Type';
                } else {
                    $suffixes = [1 => 'st', 2 => 'nd', 3 => 'rd'];
                    $suffix = isset($suffixes[$gen]) ? $suffixes[$gen] : 'th';
                    $gen_label = $gen . $suffix . ' Generation';
                }
                ?>
                <span class="tripdar-generation-badge"><?php echo esc_html($gen_label); ?></span>
            </div>
            <?php endif; ?>

            <?php if (!empty($lineage['parentStrains'])): ?>
            <div class="tripdar-detail-lineage__parents">
                <span class="tripdar-detail-lineage__parents-label">Parent Strains</span>
                <div class="tripdar-detail-lineage__parents-tags">
                    <?php foreach ($lineage['parentStrains'] as $parent_slug): ?>
                    <button class="tripdar-parent-tag" data-slug="<?php echo esc_attr($parent_slug); ?>">
                        <?php echo esc_html(ucwords(str_replace('-', ' ', $parent_slug))); ?>
                    </button>
                    <?php endforeach; ?>
                </div>
            </div>
            <?php endif; ?>

            <?php if (!empty($lineage['lineageNotes'])): ?>
            <blockquote class="tripdar-detail-lineage__notes">
                <?php echo esc_html($lineage['lineageNotes']); ?>
            </blockquote>
            <?php endif; ?>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Get vibe descriptions for tooltips
     */
    private function get_vibe_descriptions() {
        return [
            // Emotional / mood
            'warm' => 'Comforting, emotionally gentle — great for cozy indoor sessions',
            'bright' => 'Try journaling or creative art while riding the uplifting mood',
            'euphoric' => 'Let the joy wash over you — perfect with your favorite music',
            'emotional' => 'Deep feelings and emotional processing — have tissues nearby',
            'emotionally deep' => 'Intense emotional exploration — best with a trusted sitter',
            'emotionally lifting' => 'Gently elevates mood — pair with a sunset walk',
            'easygoing' => 'Relaxed and beginner-friendly — ideal for a first experience',
            'gentle' => 'Soft and approachable — try light yoga or stretching',
            'giggly' => 'Expect waves of laughter — best enjoyed with friends',
            'cozy' => 'Curl up with blankets and ambient music',
            'celebratory' => 'Festive, joyful energy — great for gatherings',
            'confident' => 'Steady self-assurance — try creative projects or journaling',

            // Introspective / spiritual
            'reflective' => 'Try journaling or meditation while in this headspace',
            'inward' => 'Encourages internal focus — solo sessions with eye mask recommended',
            'introspective' => 'Deep self-reflection — write down your insights',
            'contemplative' => 'Quiet thinking and philosophical exploration',
            'mystical' => 'Facilitates profound spiritual experiences',
            'spiritual' => 'Try breathwork or meditation for deeper connection',
            'lightly spiritual' => 'A gentle touch of the sacred — try being in nature',
            'profound' => 'Life-changing insights — set clear intentions beforehand',
            'transformative' => 'Catalyzes personal growth — integration journaling after',
            'deep' => 'Goes beyond the surface — set aside uninterrupted time',

            // Mental / cognitive
            'clear' => 'Mental clarity and lucid thought — great for creative work',
            'lucid' => 'Sharp awareness throughout — good for reflective walks',
            'heady' => 'Strong cerebral effects — try puzzles or deep conversation',
            'crisp' => 'Clean and precise mental effects',
            'clean' => 'No mental fog — great for first-timers wanting clarity',

            // Visual / sensory
            'visual' => 'Rich visual effects — try looking at nature or art',
            'bright visuals' => 'Vivid colors and patterns — visit a garden or gallery',
            'cinematic' => 'Movie-like visual sequences — dim the lights and enjoy',
            'colorful' => 'Enhanced color perception — surround yourself with art',
            'luminous' => 'Glowing, radiant visual quality',
            'reality-bending' => 'Strong visual and perceptual distortions',
            'reality-melting' => 'Intense dissolution of normal perception — have a sitter',
            'trippy' => 'Classic psychedelic visuals — kaleidoscopic patterns and trails',

            // Energy / physical
            'grounded' => 'Helps you feel centered — try walking barefoot outside',
            'embodied' => 'Strong body awareness — try dance or movement',
            'energized' => 'Active and alert — perfect for hiking or exploring',
            'energizing' => 'Gets you moving — try a nature walk or creative project',
            'electric' => 'Buzzing, charged energy throughout the body',
            'kinetic' => 'Urge to move and dance — put on your best playlist',
            'zippy' => 'Quick, buzzy energy — great for active adventures',
            'lively' => 'Vibrant and animated — enjoy with upbeat music',
            'buoyant' => 'Light and floating sensation — try being near water',
            'airy' => 'Weightless, breezy feeling — best enjoyed outdoors',
            'tidal' => 'Comes in waves — ride each wave and breathe through it',
            'heavy' => 'Strong body load — have a comfortable place to rest',

            // Social / interpersonal
            'social' => 'Enhances connection — great for deep conversations with friends',
            'social-glow' => 'Warm social radiance — enjoy with close companions',
            'playful' => 'Fun and lighthearted — try games or creative play',
            'whimsical' => 'Childlike wonder — explore a garden or make art',

            // Nature / environment
            'nature-friendly' => 'Head to a park, forest, or garden for best results',
            'outdoorsy' => 'Made for the outdoors — try a trail or lakeside spot',
            'earthy' => 'Raw, organic character — feels connected to the land',
            'tropical' => 'Warm, lush vibes — pair with tropical music',
            'rustic' => 'Simple, unrefined character — feels old-world authentic',

            // Intensity / character
            'intense' => 'Strong, powerful effects — start with a lower dose',
            'powerful' => 'High impact — respect the dose and set intentions',
            'bold' => 'Strong and assertive character — not for the faint of heart',
            'explosive' => 'Rapid, intense onset — buckle up and breathe',
            'loud' => 'Overwhelmingly present effects — have a calm space ready',
            'raw' => 'Unfiltered, primal psychedelic experience',
            'primal' => 'Connects to something ancient and instinctual',

            // Creative / imaginative
            'creative' => 'Try painting, writing, or playing music',
            'dreamy' => 'Soft, dreamlike quality — try lying down with headphones',
            'immersive' => 'Deeply absorbing — let yourself be carried by the experience',
            'visionary' => 'Expansive visions and imagery — keep a journal handy',
            'mythic' => 'Archetypal, story-like experiences — feels like a hero\'s journey',
            'alien' => 'Strange, otherworldly territory — stay grounded with a sitter',

            // Expansive / cosmic
            'cosmic' => 'Connection to the universe — try stargazing',
            'expansive' => 'Sense of vastness and openness — best in open spaces',
            'boundary-dissolving' => 'Ego boundaries soften — have a trusted guide nearby',

            // Classic / familiar
            'classic' => 'Reliable, well-known effects — a great baseline experience',
            'simple' => 'Straightforward and uncomplicated',
            'refined' => 'Polished, sophisticated character',
            'elegant' => 'Graceful and balanced effects',
            'luxurious' => 'Rich, indulgent quality — treat yourself to comfort',

            // Misc
            'adventurous' => 'Explore new places or try something you\'ve never done',
            'curious' => 'Heightened wonder — investigate textures, sounds, nature',
            'forward' => 'Momentum and drive — channel it into creative output',
            'crystalline' => 'Ultra-clear, gem-like precision in the experience',
            'music-friendly' => 'Put on headphones — music becomes transcendent',
        ];
    }

    /**
     * Get descriptions for emotional character tags
     */
    private function get_emotion_descriptions() {
        return [
            // Core emotions
            'peaceful' => 'A sense of calm and inner stillness',
            'joyful' => 'Feelings of happiness, delight, and contentment',
            'euphoric' => 'Intense waves of bliss and elation',
            'blissful' => 'Deep, sustained sense of happiness and well-being',
            'serene' => 'Quiet tranquility and emotional smoothness',
            'content' => 'Settled satisfaction without needing anything more',
            'grateful' => 'Heightened appreciation for life and connection',
            'loving' => 'Warmth, compassion, and emotional openness toward others',
            'compassionate' => 'Deep empathy and tenderness toward all beings',
            'tender' => 'Soft emotional sensitivity and gentle vulnerability',
            'nostalgic' => 'Bittersweet memories and longing for the past',
            'melancholic' => 'Gentle sadness with a reflective, beautiful quality',
            'cathartic' => 'Emotional release and cleansing — tears may flow',
            'vulnerable' => 'Emotional openness and lowered defenses',
            'raw' => 'Unfiltered emotional intensity without polish',
            'sensitive' => 'Heightened emotional awareness and receptivity',

            // Awe / wonder
            'awe' => 'Overwhelming sense of wonder at the vastness of existence',
            'wonder' => 'Childlike amazement and curiosity about everything',
            'reverent' => 'Deep respect and humility before something greater',
            'humbled' => 'Feeling small in a meaningful, grounding way',
            'mystical' => 'Connection to something sacred and beyond ordinary experience',
            'transcendent' => 'Rising above everyday concerns into expanded awareness',

            // Energy / mood
            'warm' => 'Emotionally comforting and nurturing',
            'bright' => 'Emotionally light, optimistic, and cheerful',
            'gentle' => 'Soft, easy emotional tone without sharp edges',
            'uplifting' => 'Elevates mood and emotional energy',
            'soothing' => 'Calming emotional quality that eases tension',
            'grounded' => 'Emotionally stable and connected to the present',
            'centered' => 'Balanced emotional state with clear inner focus',
            'steady' => 'Consistent emotional tone without dramatic swings',
            'resilient' => 'Emotional strength and ability to process difficulty',

            // Depth / introspection
            'introspective' => 'Turned inward for self-examination and reflection',
            'reflective' => 'Contemplative emotional quality that encourages insight',
            'contemplative' => 'Quiet, thoughtful emotional tone',
            'profound' => 'Emotionally deep and meaningful',
            'deep' => 'Goes beneath the surface into core feelings',
            'philosophical' => 'Emotion-driven questioning of life and meaning',

            // Social / relational
            'empathetic' => 'Strong ability to feel what others feel',
            'connected' => 'Sense of deep bond with others and the world',
            'open' => 'Emotionally available and receptive',
            'trusting' => 'Feeling safe and willing to be vulnerable',
            'playful' => 'Lighthearted, fun emotional energy',
            'giggly' => 'Bubbly, laughter-prone emotional state',
            'social' => 'Drawn toward connection and shared experience',
            'intimate' => 'Emotionally close and deeply personal',

            // Intensity descriptors
            'intense' => 'Strong, powerful emotional impact',
            'overwhelming' => 'Emotions that feel larger than oneself',
            'subtle' => 'Gentle, understated emotional quality',
            'electric' => 'Buzzing, charged emotional energy',
            'fiery' => 'Passionate, burning emotional intensity',
            'fluid' => 'Emotions shift and flow smoothly',
            'expansive' => 'Emotions feel boundless and wide-open',
        ];
    }

    /**
     * Render error message
     */
    private function render_error($message) {
        ob_start();
        ?>
        <div class="tripdar-error">
            <div class="tripdar-error__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <circle cx="12" cy="16" r="1" fill="currentColor"/>
                </svg>
            </div>
            <p class="tripdar-error__message"><?php echo esc_html($message); ?></p>
        </div>
        <?php
        return ob_get_clean();
    }
}
