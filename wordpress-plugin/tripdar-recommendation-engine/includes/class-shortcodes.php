<?php
/**
 * Tripdar Recommendation Engine - Shortcodes
 *
 * Registers [tripdar_recommendation_engine] shortcode that renders
 * the consent gate, experience selector, and three input path cards.
 * The JS controller handles all interaction after initial render.
 */

if (!defined('ABSPATH')) exit;

class Tripdar_Rec_Shortcodes {

    private $api;

    public function __construct($api) {
        $this->api = $api;
    }

    public function register() {
        add_shortcode('tripdar_recommendation_engine', [$this, 'render_engine']);
    }

    /**
     * Render the recommendation engine entry point.
     *
     * Attributes:
     *   theme       - parchment|dark|minimal (default: from settings)
     *   show_consent - true|false (default: true)
     */
    public function render_engine($atts) {
        $atts = shortcode_atts([
            'theme' => get_option('tripdar_rec_theme', 'parchment'),
            'show_consent' => 'yes',
        ], $atts);

        // Normalize show_consent to 'true'/'false' for JS
        $show_consent = in_array(strtolower($atts['show_consent']), ['yes', 'true', '1'], true) ? 'true' : 'false';

        // Load consent text from global settings
        $settings_response = $this->api->get_settings();
        $consent_text = '';
        if ($settings_response && isset($settings_response['success']) && $settings_response['success']) {
            $consent_text = $settings_response['data']['settings']['consentGateText'] ?? '';
        }

        // Determine which section to show by default (before JS takes over)
        $show_consent_gate = ($show_consent === 'true' && !empty($consent_text));

        ob_start();
        ?>
        <div class="tripdar-rec"
             data-theme="<?php echo esc_attr($atts['theme']); ?>"
             data-show-consent="<?php echo esc_attr($show_consent); ?>">

            <!-- Consent Gate -->
            <div class="tripdar-rec__consent" style="display: <?php echo $show_consent_gate ? '' : 'none'; ?>">
                <div class="tripdar-rec__consent-card">
                    <div class="tripdar-rec__consent-icon">
                        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 16v-4M12 8h.01"/>
                        </svg>
                    </div>
                    <div class="tripdar-rec__consent-text">
                        <?php echo nl2br(esc_html($consent_text)); ?>
                    </div>
                    <button type="button" class="tripdar-rec__consent-btn">
                        I Understand — Show Me Recommendations
                    </button>
                </div>
            </div>

            <!-- Experience Level Selector -->
            <div class="tripdar-rec__experience" style="display: <?php echo $show_consent_gate ? 'none' : ''; ?>">
                <h2 class="tripdar-rec__title">How experienced are you?</h2>
                <p class="tripdar-rec__subtitle">This helps us calibrate dose recommendations to your comfort level.</p>
                <div class="tripdar-rec__experience-options">
                    <button type="button" class="tripdar-rec__experience-btn" data-level="new">
                        <span class="tripdar-rec__exp-label">First Time</span>
                        <span class="tripdar-rec__exp-desc">I haven't tried this before</span>
                    </button>
                    <button type="button" class="tripdar-rec__experience-btn" data-level="few_times">
                        <span class="tripdar-rec__exp-label">A Few Times</span>
                        <span class="tripdar-rec__exp-desc">I've had a handful of experiences</span>
                    </button>
                    <button type="button" class="tripdar-rec__experience-btn" data-level="experienced">
                        <span class="tripdar-rec__exp-label">Experienced</span>
                        <span class="tripdar-rec__exp-desc">I know what to expect</span>
                    </button>
                    <button type="button" class="tripdar-rec__experience-btn" data-level="very_experienced">
                        <span class="tripdar-rec__exp-label">Very Experienced</span>
                        <span class="tripdar-rec__exp-desc">I've explored many strains and doses</span>
                    </button>
                </div>
            </div>

            <!-- Path Selection -->
            <div class="tripdar-rec__paths" style="display: none;">
                <button type="button" class="tripdar-rec__back-btn" data-back="experience">&larr; Back</button>
                <h2 class="tripdar-rec__title">How would you like to explore?</h2>
                <p class="tripdar-rec__subtitle">Choose your path — all three lead to personalized recommendations.</p>
                <div class="tripdar-rec__path-cards">
                    <button type="button" class="tripdar-rec__path-card" data-path="mood_tiles">
                        <div class="tripdar-rec__path-icon">
                            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5">
                                <rect x="3" y="3" width="7" height="7" rx="1"/>
                                <rect x="14" y="3" width="7" height="7" rx="1"/>
                                <rect x="3" y="14" width="7" height="7" rx="1"/>
                                <rect x="14" y="14" width="7" height="7" rx="1"/>
                            </svg>
                        </div>
                        <h3>Mood Tiles</h3>
                        <p>Pick 1-3 tiles that match how you want to feel</p>
                    </button>

                    <button type="button" class="tripdar-rec__path-card" data-path="sliders">
                        <div class="tripdar-rec__path-icon">
                            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5">
                                <circle cx="12" cy="12" r="9"/>
                                <line x1="12" y1="3" x2="12" y2="21"/>
                                <line x1="3" y1="12" x2="21" y2="12"/>
                                <circle cx="15" cy="9" r="2" fill="currentColor"/>
                            </svg>
                        </div>
                        <h3>Compass</h3>
                        <p>Drag a marker to find your sweet spot</p>
                    </button>

                    <button type="button" class="tripdar-rec__path-card" data-path="guided_quiz">
                        <div class="tripdar-rec__path-icon">
                            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M9 18l6-6-6-6"/>
                            </svg>
                        </div>
                        <h3>Guided Journey</h3>
                        <p>Answer a few questions and we'll find your match</p>
                    </button>
                </div>
            </div>

            <!-- Path A: Mood Tiles -->
            <div class="tripdar-rec__mood-tiles" style="display: none;">
                <button type="button" class="tripdar-rec__back-btn" data-back="paths">&larr; Back</button>
                <h2 class="tripdar-rec__title">What are you looking for?</h2>
                <p class="tripdar-rec__subtitle">Select 1-3 tiles that resonate with you.</p>
                <div class="tripdar-rec__tiles-grid" id="tripdar-rec-tiles">
                    <!-- Populated by JS from config -->
                </div>
                <div class="tripdar-rec__tiles-actions" style="display: none;">
                    <button type="button" class="tripdar-rec__submit-btn" id="tripdar-rec-tiles-submit">
                        Get My Recommendations
                    </button>
                </div>
            </div>

            <!-- Path B: Compass -->
            <div class="tripdar-rec__compass" style="display: none;">
                <button type="button" class="tripdar-rec__back-btn" data-back="paths">&larr; Back</button>
                <h2 class="tripdar-rec__title">Find Your Sweet Spot</h2>
                <p class="tripdar-rec__subtitle">Drag the marker to describe your ideal experience.</p>
                <div class="tripdar-rec__compass-container">
                    <div class="tripdar-rec__compass-pad" id="tripdar-rec-compass">
                        <div class="tripdar-rec__compass-label tripdar-rec__compass-label--top">Energetic</div>
                        <div class="tripdar-rec__compass-label tripdar-rec__compass-label--bottom">Calm</div>
                        <div class="tripdar-rec__compass-label tripdar-rec__compass-label--left">Clear</div>
                        <div class="tripdar-rec__compass-label tripdar-rec__compass-label--right">Dreamy</div>
                        <div class="tripdar-rec__compass-marker" id="tripdar-rec-marker"></div>
                        <div class="tripdar-rec__compass-crosshair"></div>
                    </div>
                    <div class="tripdar-rec__intensity-slider">
                        <label>Intensity</label>
                        <input type="range" id="tripdar-rec-intensity" min="0" max="1" step="0.1" value="0.5">
                        <div class="tripdar-rec__intensity-labels">
                            <span>Light</span>
                            <span>Moderate</span>
                            <span>Deep</span>
                        </div>
                    </div>
                </div>
                <button type="button" class="tripdar-rec__submit-btn" id="tripdar-rec-compass-submit">
                    Get My Recommendations
                </button>
            </div>

            <!-- Path C: Guided Quiz -->
            <div class="tripdar-rec__quiz" style="display: none;">
                <button type="button" class="tripdar-rec__back-btn" data-back="paths">&larr; Back</button>
                <div class="tripdar-rec__quiz-progress">
                    <div class="tripdar-rec__quiz-progress-bar" id="tripdar-rec-quiz-bar"></div>
                </div>
                <div class="tripdar-rec__quiz-question" id="tripdar-rec-quiz-question">
                    <!-- Populated by JS -->
                </div>
            </div>

            <!-- Loading -->
            <div class="tripdar-rec__loading" style="display: none;">
                <div class="tripdar-rec__loading-spinner"></div>
                <p>Finding your perfect match...</p>
            </div>

            <!-- Results -->
            <div class="tripdar-rec__results" style="display: none;">
                <h2 class="tripdar-rec__title">Your Recommendations</h2>
                <div class="tripdar-rec__stepped-path" id="tripdar-rec-stepped" style="display: none;"></div>
                <div class="tripdar-rec__results-cards" id="tripdar-rec-results">
                    <!-- Populated by JS -->
                </div>
                <div class="tripdar-rec__results-actions">
                    <button type="button" class="tripdar-rec__restart-btn" id="tripdar-rec-restart">Start Over</button>
                </div>
            </div>

            <!-- Feedback: Tier 1 Quick Rating -->
            <div class="tripdar-rec__feedback" style="display: none;">
                <div class="tripdar-rec__feedback-card">
                    <h3>How was this recommendation?</h3>
                    <div class="tripdar-rec__feedback-buttons">
                        <button type="button" class="tripdar-rec__feedback-btn" data-rating="nailed_it">
                            <span class="tripdar-rec__feedback-emoji">&#127919;</span>
                            <span>Nailed It</span>
                        </button>
                        <button type="button" class="tripdar-rec__feedback-btn" data-rating="pretty_close">
                            <span class="tripdar-rec__feedback-emoji">&#128076;</span>
                            <span>Pretty Close</span>
                        </button>
                        <button type="button" class="tripdar-rec__feedback-btn" data-rating="missed">
                            <span class="tripdar-rec__feedback-emoji">&#10060;</span>
                            <span>Off the Mark</span>
                        </button>
                    </div>
                    <div class="tripdar-rec__feedback-note" style="display: none;">
                        <textarea placeholder="Any notes? (optional)" maxlength="500"></textarea>
                    </div>
                </div>
            </div>

            <!-- Feedback: Tier 2 Deep Dive -->
            <div class="tripdar-rec__deep-dive" style="display: none;">
                <div class="tripdar-rec__deep-dive-card">
                    <h3>Help us get even closer</h3>
                    <p>Compared to what you were looking for, the actual experience was:</p>
                    <div class="tripdar-rec__signals" id="tripdar-rec-signals">
                        <!-- Populated by JS based on intent vector -->
                    </div>
                    <div class="tripdar-rec__deep-dive-dose">
                        <label>Actual dose taken (mg, optional):</label>
                        <input type="number" id="tripdar-rec-actual-dose" min="0" step="10">
                    </div>
                    <button type="button" class="tripdar-rec__submit-btn" id="tripdar-rec-signals-submit">Submit Feedback</button>
                </div>
            </div>

            <!-- Thank You -->
            <div class="tripdar-rec__thanks" style="display: none;">
                <div class="tripdar-rec__thanks-card">
                    <h3>Thank you!</h3>
                    <p>Your feedback helps improve recommendations for everyone.</p>
                    <button type="button" class="tripdar-rec__restart-btn" id="tripdar-rec-restart-final">Explore Again</button>
                </div>
            </div>
        </div>
        <script>
        (function(){
            var c = document.querySelector('.tripdar-rec');
            if (!c) return;
            function show(sel) {
                c.querySelectorAll('[class^="tripdar-rec__"]').forEach(function(el){
                    if (el.parentNode === c) el.style.display = 'none';
                });
                var t = c.querySelector(sel);
                if (t) t.style.display = '';
            }
            // Experience buttons
            c.querySelectorAll('.tripdar-rec__experience-btn').forEach(function(btn){
                btn.addEventListener('click', function(){
                    c.querySelectorAll('.tripdar-rec__experience-btn').forEach(function(b){ b.classList.remove('selected'); });
                    btn.classList.add('selected');
                    c.dataset.experienceLevel = btn.dataset.level;
                    setTimeout(function(){ show('.tripdar-rec__paths'); }, 300);
                });
            });
            // Path cards
            c.querySelectorAll('.tripdar-rec__path-card').forEach(function(card){
                card.addEventListener('click', function(){
                    c.dataset.inputPath = card.dataset.path;
                    if (card.dataset.path === 'mood_tiles') show('.tripdar-rec__mood-tiles');
                    else if (card.dataset.path === 'sliders') show('.tripdar-rec__compass');
                    else if (card.dataset.path === 'guided_quiz') show('.tripdar-rec__quiz');
                });
            });
            // Back buttons
            c.querySelectorAll('.tripdar-rec__back-btn').forEach(function(btn){
                btn.addEventListener('click', function(){
                    show('.tripdar-rec__' + btn.dataset.back);
                });
            });
            // Consent button
            var cb = c.querySelector('.tripdar-rec__consent-btn');
            if (cb) cb.addEventListener('click', function(){ show('.tripdar-rec__experience'); });
        })();
        </script>
        <?php
        return ob_get_clean();
    }
}
