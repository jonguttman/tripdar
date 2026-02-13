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
                            <option value="introspective">Introspective</option>
                            <option value="euphoric">Euphoric</option>
                            <option value="visual">Visual</option>
                            <option value="creative">Creative</option>
                            <option value="grounding">Grounding</option>
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
                    <h2 class="tripdar-strain-detail__name"><?php echo esc_html($strain['name']); ?></h2>

                    <div class="tripdar-strain-detail__tags">
                        <?php if (!empty($strain['vibes']) && is_array($strain['vibes'])): ?>
                            <?php foreach ($strain['vibes'] as $vibe): ?>
                            <span class="tripdar-tag tripdar-tag--vibe"><?php echo esc_html($vibe); ?></span>
                            <?php endforeach; ?>
                        <?php endif; ?>
                        <span class="tripdar-tag tripdar-tag--potency tripdar-tag--<?php echo esc_attr($strain['potencyTier']); ?>">
                            <?php echo esc_html($strain['potency']); ?>
                        </span>
                        <?php if ($strain['beginnerFriendly'] === 'yes'): ?>
                        <span class="tripdar-tag tripdar-tag--beginner">Beginner Friendly</span>
                        <?php endif; ?>
                    </div>
                </div>
            </div>

            <div class="tripdar-strain-detail__body">
                <div class="tripdar-strain-detail__section">
                    <h3 class="tripdar-section-title">The Journey</h3>
                    <p class="tripdar-strain-detail__description"><?php echo esc_html($strain['description']); ?></p>
                </div>

                <div class="tripdar-strain-detail__attributes">
                    <div class="tripdar-attribute">
                        <span class="tripdar-attribute__label">Visual Intensity</span>
                        <span class="tripdar-attribute__value"><?php echo esc_html($strain['visual']); ?></span>
                    </div>
                    <div class="tripdar-attribute">
                        <span class="tripdar-attribute__label">Stability</span>
                        <span class="tripdar-attribute__value"><?php echo esc_html($strain['stability']); ?></span>
                    </div>
                </div>
            </div>

            <?php if ($show_feedback): ?>
            <div class="tripdar-strain-detail__feedback">
                <?php echo $this->render_feedback_widget($strain['slug']); ?>
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
                <h3 class="tripdar-strain-card__name"><?php echo esc_html($strain['name']); ?></h3>
                <div class="tripdar-strain-card__vibes">
                    <?php if (!empty($strain['vibes']) && is_array($strain['vibes'])): ?>
                        <?php foreach (array_slice($strain['vibes'], 0, 2) as $vibe): ?>
                        <span class="tripdar-vibe-tag"><?php echo esc_html($vibe); ?></span>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </div>
                <?php if ($variant !== 'compact'): ?>
                <p class="tripdar-strain-card__excerpt">
                    <?php echo esc_html(wp_trim_words($strain['description'], 15)); ?>
                </p>
                <?php endif; ?>
                <button class="tripdar-btn tripdar-btn--ghost tripdar-strain-card__explore">
                    Explore
                </button>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Render feedback widget
     */
    private function render_feedback_widget($strain_slug) {
        ob_start();
        ?>
        <div class="tripdar-feedback" data-strain-slug="<?php echo esc_attr($strain_slug); ?>">
            <div class="tripdar-feedback__prompt">
                <h4 class="tripdar-feedback__title">Share Your Experience</h4>
                <p class="tripdar-feedback__subtitle">Does this description match your journey with <?php echo esc_html(ucwords(str_replace('-', ' ', $strain_slug))); ?>?</p>
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
