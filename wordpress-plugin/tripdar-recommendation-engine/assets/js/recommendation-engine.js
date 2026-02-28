(function() {
    'use strict';

    class TripdarRecommendationEngine {
        constructor(container) {
            this.container = container;
            this.config = null;
            this.experienceLevel = null;
            this.inputPath = null;
            this.intentVector = null;
            this.sessionToken = null;
            this.results = null;
            this.selectedTiles = [];
            this.compassPosition = { x: 0, y: 0 };
            this.quizStep = 0;
            this.quizAnswers = {};

            // Cache sections
            this.sections = {
                consent: container.querySelector('.tripdar-rec__consent'),
                experience: container.querySelector('.tripdar-rec__experience'),
                paths: container.querySelector('.tripdar-rec__paths'),
                moodTiles: container.querySelector('.tripdar-rec__mood-tiles'),
                compass: container.querySelector('.tripdar-rec__compass'),
                quiz: container.querySelector('.tripdar-rec__quiz'),
                loading: container.querySelector('.tripdar-rec__loading'),
                results: container.querySelector('.tripdar-rec__results'),
                feedback: container.querySelector('.tripdar-rec__feedback'),
                deepDive: container.querySelector('.tripdar-rec__deep-dive'),
                thanks: container.querySelector('.tripdar-rec__thanks'),
            };

            this.init();
        }

        async init() {
            this.bindEvents();
            this.checkConsent();
            // Load config in background — UI is already interactive
            this.loadConfig();
        }

        // =====================================================================
        // Config Loading
        // =====================================================================

        async loadConfig() {
            try {
                const response = await this.ajax('tripdar_rec_get_config', {});
                if (response.success) {
                    this.config = response.data;
                }
            } catch (e) {
                console.error('Failed to load recommendation config:', e);
            }
        }

        // =====================================================================
        // Event Binding
        // =====================================================================

        bindEvents() {
            // Consent
            var consentBtn = this.container.querySelector('.tripdar-rec__consent-btn');
            if (consentBtn) {
                consentBtn.addEventListener('click', () => this.acceptConsent());
            }

            // Experience level
            this.container.querySelectorAll('.tripdar-rec__experience-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.experienceLevel = btn.dataset.level;
                    this.container.querySelectorAll('.tripdar-rec__experience-btn').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    setTimeout(() => this.showSection('paths'), 300);
                });
            });

            // Path selection
            this.container.querySelectorAll('.tripdar-rec__path-card').forEach(card => {
                card.addEventListener('click', () => this.selectPath(card.dataset.path));
            });

            // Mood tiles submit
            var tilesSubmit = document.getElementById('tripdar-rec-tiles-submit');
            if (tilesSubmit) {
                tilesSubmit.addEventListener('click', () => this.submitMoodTiles());
            }

            // Compass submit
            var compassSubmit = document.getElementById('tripdar-rec-compass-submit');
            if (compassSubmit) {
                compassSubmit.addEventListener('click', () => this.submitCompass());
            }

            // Compass interaction
            this.initCompass();

            // Feedback buttons
            this.container.querySelectorAll('.tripdar-rec__feedback-btn').forEach(btn => {
                btn.addEventListener('click', () => this.submitQuickFeedback(btn.dataset.rating));
            });

            // Signals submit
            var signalsSubmit = document.getElementById('tripdar-rec-signals-submit');
            if (signalsSubmit) {
                signalsSubmit.addEventListener('click', () => this.submitSignals());
            }

            // Back buttons
            this.container.querySelectorAll('.tripdar-rec__back-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    var target = btn.dataset.back;
                    this.showSection(target);
                });
            });

            // Restart buttons
            var restart = document.getElementById('tripdar-rec-restart');
            if (restart) {
                restart.addEventListener('click', () => this.restart());
            }
            var restartFinal = document.getElementById('tripdar-rec-restart-final');
            if (restartFinal) {
                restartFinal.addEventListener('click', () => this.restart());
            }
        }

        // =====================================================================
        // Consent Gate
        // =====================================================================

        checkConsent() {
            var showConsent = this.container.dataset.showConsent === 'true';
            var accepted = localStorage.getItem('tripdar_rec_consent') === 'accepted';

            if (showConsent && !accepted) {
                this.showSection('consent');
            } else {
                this.showSection('experience');
            }
        }

        acceptConsent() {
            localStorage.setItem('tripdar_rec_consent', 'accepted');
            this.showSection('experience');
        }

        // =====================================================================
        // Path Selection
        // =====================================================================

        selectPath(path) {
            this.inputPath = path;

            // Fade out non-selected cards
            this.container.querySelectorAll('.tripdar-rec__path-card').forEach(card => {
                if (card.dataset.path !== path) {
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.95)';
                }
            });

            setTimeout(() => {
                if (path === 'mood_tiles') {
                    this.renderMoodTiles();
                    this.showSection('moodTiles');
                } else if (path === 'sliders') {
                    this.showSection('compass');
                } else if (path === 'guided_quiz') {
                    this.startQuiz();
                    this.showSection('quiz');
                }
            }, 300);
        }

        // =====================================================================
        // Path A: Mood Tiles
        // =====================================================================

        renderMoodTiles() {
            var grid = document.getElementById('tripdar-rec-tiles');
            if (!grid || !this.config || !this.config.moodTiles) return;

            grid.innerHTML = '';
            this.selectedTiles = [];

            this.config.moodTiles.forEach(tile => {
                var el = document.createElement('button');
                el.className = 'tripdar-rec__tile';
                el.dataset.tileId = tile.id;
                el.innerHTML =
                    '<span class="tripdar-rec__tile-label">' + this.escapeHtml(tile.label) + '</span>' +
                    '<span class="tripdar-rec__tile-desc">' + this.escapeHtml(tile.description) + '</span>';

                el.addEventListener('click', () => this.toggleTile(el, tile));
                grid.appendChild(el);
            });
        }

        toggleTile(el, tile) {
            var idx = this.selectedTiles.findIndex(t => t.id === tile.id);
            if (idx !== -1) {
                this.selectedTiles.splice(idx, 1);
                el.classList.remove('selected');
            } else if (this.selectedTiles.length < 3) {
                this.selectedTiles.push(tile);
                el.classList.add('selected');
            }

            // Show/hide submit
            var actions = this.container.querySelector('.tripdar-rec__tiles-actions');
            if (actions) {
                actions.style.display = this.selectedTiles.length > 0 ? '' : 'none';
            }
        }

        submitMoodTiles() {
            if (this.selectedTiles.length === 0) return;

            // Blend intent vectors (average)
            var blended = {
                clarity_cognition: 0, mood_social: 0, visual_pattern: 0,
                somatic: 0, energy_direction: 0, depth_direction: 0
            };

            this.selectedTiles.forEach(tile => {
                var vec = tile.intentVector;
                for (var key in blended) {
                    blended[key] += (vec[key] || 0);
                }
            });

            var count = this.selectedTiles.length;
            for (var key in blended) {
                blended[key] = blended[key] / count;
            }

            this.intentVector = blended;
            this.submitRecommendation({
                selectedTiles: this.selectedTiles.map(t => t.id),
            });
        }

        // =====================================================================
        // Path B: Compass
        // =====================================================================

        initCompass() {
            var pad = document.getElementById('tripdar-rec-compass');
            var marker = document.getElementById('tripdar-rec-marker');
            if (!pad || !marker) return;

            var self = this;
            var dragging = false;

            function updatePosition(e) {
                var rect = pad.getBoundingClientRect();
                var clientX = e.touches ? e.touches[0].clientX : e.clientX;
                var clientY = e.touches ? e.touches[0].clientY : e.clientY;

                var x = (clientX - rect.left) / rect.width;
                var y = (clientY - rect.top) / rect.height;

                x = Math.max(0, Math.min(1, x));
                y = Math.max(0, Math.min(1, y));

                marker.style.left = (x * 100) + '%';
                marker.style.top = (y * 100) + '%';

                // Map to -1 to 1 (x = depth: left=clear, right=dreamy; y = energy: top=energetic, bottom=calm)
                self.compassPosition = {
                    x: (x * 2) - 1,  // depth_direction
                    y: -((y * 2) - 1) // energy_direction (invert: top = positive)
                };
            }

            pad.addEventListener('mousedown', function(e) { dragging = true; updatePosition(e); });
            pad.addEventListener('touchstart', function(e) { dragging = true; updatePosition(e); e.preventDefault(); });
            document.addEventListener('mousemove', function(e) { if (dragging) updatePosition(e); });
            document.addEventListener('touchmove', function(e) { if (dragging) updatePosition(e); });
            document.addEventListener('mouseup', function() { dragging = false; });
            document.addEventListener('touchend', function() { dragging = false; });
        }

        submitCompass() {
            var intensity = parseFloat(document.getElementById('tripdar-rec-intensity').value);
            var energy = this.compassPosition.y;
            var depth = this.compassPosition.x;

            this.intentVector = {
                clarity_cognition: intensity * (1 - Math.abs(depth)) * 0.5,
                mood_social: intensity * Math.max(0, energy) * 0.6,
                visual_pattern: intensity * Math.max(0, depth) * 0.7,
                somatic: intensity * 0.4,
                energy_direction: energy,
                depth_direction: depth,
            };

            this.submitRecommendation({
                compassX: depth,
                compassY: energy,
                intensity: intensity,
            });
        }

        // =====================================================================
        // Path C: Guided Quiz
        // =====================================================================

        startQuiz() {
            this.quizStep = 0;
            this.quizAnswers = {};
            this.renderQuizStep();
        }

        renderQuizStep() {
            if (!this.config || !this.config.quizSteps) return;

            var steps = this.config.quizSteps.filter(step => {
                if (step.conditional === 'experienced') {
                    return this.experienceLevel === 'experienced' || this.experienceLevel === 'very_experienced';
                }
                return true;
            });

            if (this.quizStep >= steps.length) {
                this.computeQuizVector();
                return;
            }

            var step = steps[this.quizStep];
            var bar = document.getElementById('tripdar-rec-quiz-bar');
            if (bar) {
                bar.style.width = ((this.quizStep / steps.length) * 100) + '%';
            }

            var questionEl = document.getElementById('tripdar-rec-quiz-question');
            if (!questionEl) return;

            var html = '<h2 class="tripdar-rec__quiz-title">' + this.escapeHtml(step.question) + '</h2>';
            html += '<div class="tripdar-rec__quiz-options">';

            if (step.options && step.options.length > 0) {
                step.options.forEach(option => {
                    html += '<button type="button" class="tripdar-rec__quiz-option" data-step="' +
                        this.escapeHtml(step.id) + '" data-answer="' + this.escapeHtml(option.id) +
                        '" data-tags=\'' + JSON.stringify(option.tags || []) + '\'>' +
                        this.escapeHtml(option.label) + '</button>';
                });
            }

            html += '</div>';
            questionEl.innerHTML = html;

            // Bind option clicks
            questionEl.querySelectorAll('.tripdar-rec__quiz-option').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.quizAnswers[btn.dataset.step] = {
                        id: btn.dataset.answer,
                        tags: JSON.parse(btn.dataset.tags),
                    };
                    btn.classList.add('selected');
                    setTimeout(() => {
                        this.quizStep++;
                        this.renderQuizStep();
                    }, 300);
                });
            });
        }

        computeQuizVector() {
            // Collect all tags from answers
            var allTags = [];
            for (var key in this.quizAnswers) {
                allTags = allTags.concat(this.quizAnswers[key].tags || []);
            }

            // Tag-to-intent mappings
            var tagWeights = {
                'introspective': { clarity_cognition: 0.6, depth_direction: 0.5 },
                'calm': { energy_direction: -0.7, somatic: 0.3 },
                'deep': { depth_direction: 0.7, clarity_cognition: 0.4 },
                'social': { mood_social: 0.8, energy_direction: 0.3 },
                'giggly': { mood_social: 0.7, energy_direction: 0.4 },
                'uplifting': { mood_social: 0.5, energy_direction: 0.6 },
                'playful': { mood_social: 0.6, energy_direction: 0.3 },
                'creative': { clarity_cognition: 0.5, visual_pattern: 0.4 },
                'focused': { clarity_cognition: 0.7, energy_direction: 0.2 },
                'flowing': { clarity_cognition: 0.4, visual_pattern: 0.3 },
                'grounded': { somatic: 0.6, energy_direction: -0.4 },
                'connected': { mood_social: 0.4, somatic: 0.3 },
                'sensory': { somatic: 0.7, visual_pattern: 0.3 },
                'visionary': { visual_pattern: 0.8, depth_direction: 0.6 },
                'transformative': { depth_direction: 0.8, clarity_cognition: 0.3 },
                'gentle': { energy_direction: -0.3, depth_direction: -0.3 },
                'balanced': { clarity_cognition: 0.3, mood_social: 0.3 },
                'beginner-friendly': { energy_direction: -0.2, depth_direction: -0.4 },
                'clear-headed': { clarity_cognition: 0.8, depth_direction: -0.5 },
                'lucid': { clarity_cognition: 0.7, depth_direction: -0.3 },
                'heart-opening': { mood_social: 0.6, somatic: 0.4 },
                'warm': { somatic: 0.5, mood_social: 0.3 },
                'visual': { visual_pattern: 0.8 },
                'immersive': { visual_pattern: 0.6, depth_direction: 0.5 },
                'patterning': { visual_pattern: 0.7, clarity_cognition: 0.2 },
                'body warmth': { somatic: 0.8, energy_direction: -0.4 },
                'relaxation': { somatic: 0.6, energy_direction: -0.6 },
                'philosophical': { clarity_cognition: 0.6, depth_direction: 0.4 },
                'euphoric': { mood_social: 0.5, energy_direction: 0.5 },
                'intense': { depth_direction: 0.6, visual_pattern: 0.4 },
                'powerful': { depth_direction: 0.7, somatic: 0.3 },
                'moderate': { depth_direction: 0.1 },
                'variable': { visual_pattern: 0.3, depth_direction: 0.3 },
                'adventurous': { depth_direction: 0.4, energy_direction: 0.3 },
                'fun': { mood_social: 0.7, energy_direction: 0.4 },
                'stable': { depth_direction: -0.2, energy_direction: -0.1 },
            };

            var vector = {
                clarity_cognition: 0, mood_social: 0, visual_pattern: 0,
                somatic: 0, energy_direction: 0, depth_direction: 0
            };

            var tagCount = 0;
            allTags.forEach(function(tag) {
                var lowerTag = tag.toLowerCase();
                var weights = tagWeights[lowerTag];
                if (weights) {
                    for (var dim in weights) {
                        vector[dim] += weights[dim];
                    }
                    tagCount++;
                }
            });

            // Normalize
            if (tagCount > 0) {
                for (var dim in vector) {
                    vector[dim] = Math.max(-1, Math.min(1, vector[dim] / Math.max(1, tagCount / 2)));
                }
            }

            this.intentVector = vector;
            this.submitRecommendation({ quizAnswers: this.quizAnswers });
        }

        // =====================================================================
        // Recommendation Submission
        // =====================================================================

        async submitRecommendation(rawInput) {
            this.showSection('loading');

            try {
                var response = await this.ajax('tripdar_rec_submit', {
                    experienceLevel: this.experienceLevel,
                    inputPath: this.inputPath,
                    intentVector: JSON.stringify(this.intentVector),
                    rawInput: JSON.stringify(rawInput),
                });

                if (response.success) {
                    this.sessionToken = response.data.sessionToken;
                    this.results = response.data.results;
                    this.renderResults(response.data);
                    this.showSection('results');
                } else {
                    this.showError('Unable to generate recommendations. Please try again.');
                }
            } catch (e) {
                console.error('Recommendation request failed:', e);
                this.showError('Something went wrong. Please try again.');
            }
        }

        // =====================================================================
        // Results Display
        // =====================================================================

        renderResults(data) {
            var resultsEl = document.getElementById('tripdar-rec-results');
            if (!resultsEl) return;

            var html = '';
            var results = data.results || [];

            results.forEach(function(result, index) {
                var isBest = index === 0;
                var cardClass = 'tripdar-rec__result-card' + (isBest ? ' tripdar-rec__result-card--best' : '');

                html += '<div class="' + cardClass + '" data-result-id="' + (result.id || '') + '">';

                if (isBest) {
                    html += '<div class="tripdar-rec__result-badge">Best Match</div>';
                } else {
                    html += '<div class="tripdar-rec__result-badge tripdar-rec__result-badge--alt">Also Fits</div>';
                }

                html += '<h3 class="tripdar-rec__result-name"><a href="#" class="tripdar-rec__strain-link" data-slug="' + this.escapeHtml(result.strainSlug) + '">' + this.escapeHtml(result.strainName) + '</a></h3>';

                // Match score
                if (result.matchScore !== undefined) {
                    html += '<div class="tripdar-rec__result-match">';
                    html += '<div class="tripdar-rec__match-bar"><div class="tripdar-rec__match-fill" style="width:' + result.matchScore + '%"></div></div>';
                    html += '<span class="tripdar-rec__match-pct">' + Math.round(result.matchScore) + '% match</span>';
                    html += '</div>';
                }

                // Dose info
                html += '<div class="tripdar-rec__result-dose">';
                html += '<span class="tripdar-rec__dose-level">' + this.escapeHtml(result.doseLevelName) + '</span>';
                html += '<span class="tripdar-rec__dose-range">' + result.doseLowMg + '-' + result.doseHighMg + ' mg</span>';
                html += '</div>';

                // Product info (if mapped)
                if (result.product) {
                    html += '<div class="tripdar-rec__result-product">';
                    html += '<span class="tripdar-rec__product-name">' + this.escapeHtml(result.product.name) + '</span>';
                    html += '<span class="tripdar-rec__product-units">' + this.escapeHtml(result.product.suggestedUnits) + ' ' + this.escapeHtml(result.product.format) + 's</span>';
                    if (result.product.url) {
                        html += '<a href="' + this.escapeHtml(result.product.url) + '" class="tripdar-rec__product-link" target="_blank" rel="noopener">View Product</a>';
                    }
                    html += '</div>';
                }

                // Description
                html += '<p class="tripdar-rec__result-desc">' + this.escapeHtml(result.description) + '</p>';

                // Tags
                html += '<div class="tripdar-rec__result-tags">';
                if (result.tags) {
                    html += '<span class="tripdar-rec__tag">Stability: ' + this.escapeHtml(result.tags.stability) + '</span>';
                    html += '<span class="tripdar-rec__tag">Sensitivity: ' + this.escapeHtml(result.tags.doseSensitivity) + '</span>';
                    html += '<span class="tripdar-rec__tag">Beginner: ' + this.escapeHtml(result.tags.beginnerFriendly) + '</span>';
                }
                html += '</div>';

                // Cautions
                if (result.cautions && result.cautions.length > 0) {
                    html += '<div class="tripdar-rec__result-cautions">';
                    result.cautions.forEach(function(caution) {
                        html += '<div class="tripdar-rec__caution">';
                        html += '<span class="tripdar-rec__caution-icon">&#9888;</span>';
                        html += '<span>' + this.escapeHtml(caution) + '</span>';
                        html += '</div>';
                    }.bind(this));
                    html += '</div>';
                }

                // Explore link
                html += '<a href="#" class="tripdar-rec__explore-link" data-slug="' + this.escapeHtml(result.strainSlug) + '">Explore this strain &rarr;</a>';

                // Dose card button
                if (typeof tripdarRec !== 'undefined' && tripdarRec.dosingGuideEnabled) {
                    html += '<button type="button" class="tripdar-rec__get-dose-card" data-strain-slug="' + this.escapeHtml(result.strainSlug) + '">'
                        + 'Map Your Journey'
                        + '</button>';
                }

                html += '</div>';
            }.bind(this));

            resultsEl.innerHTML = html;

            // Bind strain links (open strain explorer modal)
            this.container.querySelectorAll('.tripdar-rec__strain-link, .tripdar-rec__explore-link').forEach(function(link) {
                link.addEventListener('click', function(e) {
                    e.preventDefault();
                    var slug = link.dataset.slug;
                    if (slug) {
                        document.dispatchEvent(new CustomEvent('tripdar:view-strain', { detail: { slug: slug } }));
                    }
                });
            });

            // Bind dose card buttons
            this.container.querySelectorAll('.tripdar-rec__get-dose-card').forEach(function(btn) {
                btn.addEventListener('click', function() { this.requestDoseCard(btn); }.bind(this));
            }.bind(this));

            // Stepped path notice
            if (data.steppedPath) {
                var steppedEl = document.getElementById('tripdar-rec-stepped');
                if (steppedEl) {
                    steppedEl.textContent = data.steppedPath.message;
                    steppedEl.style.display = '';
                }
            }

            // Store result IDs for feedback
            this.resultIds = results.map(function(r) { return r.id; }).filter(Boolean);

            // Show feedback after a delay
            setTimeout(() => {
                if (this.sections.feedback) {
                    this.sections.feedback.style.display = '';
                }
            }, 2000);
        }

        // =====================================================================
        // Feedback: Tier 1
        // =====================================================================

        async submitQuickFeedback(rating) {
            if (!this.resultIds || this.resultIds.length === 0) {
                this.showSection('thanks');
                return;
            }

            // Submit for the best match result
            var resultId = this.resultIds[0];

            this.container.querySelectorAll('.tripdar-rec__feedback-btn').forEach(function(btn) {
                btn.disabled = true;
                if (btn.dataset.rating === rating) {
                    btn.classList.add('selected');
                }
            });

            try {
                var response = await this.ajax('tripdar_rec_feedback', {
                    resultId: resultId,
                    quickRating: rating,
                });

                if (response.success && response.data.showDeepDive) {
                    this.feedbackId = response.data.feedbackId;
                    this.renderDeepDive();
                    this.sections.feedback.style.display = 'none';
                    this.showSection('deepDive');
                } else {
                    this.sections.feedback.style.display = 'none';
                    this.showSection('thanks');
                }
            } catch (e) {
                console.error('Feedback submission failed:', e);
                this.sections.feedback.style.display = 'none';
                this.showSection('thanks');
            }
        }

        // =====================================================================
        // Feedback: Tier 2 Deep Dive
        // =====================================================================

        renderDeepDive() {
            var signalsEl = document.getElementById('tripdar-rec-signals');
            if (!signalsEl || !this.intentVector) return;

            // Show dimensions relevant to the user's intent
            var dimensions = [
                { id: 'clarity_cognition', label: 'Mental Clarity' },
                { id: 'mood_social', label: 'Mood & Social Connection' },
                { id: 'visual_pattern', label: 'Visual Intensity' },
                { id: 'somatic', label: 'Body Sensations' },
                { id: 'energy_direction', label: 'Energy Level' },
                { id: 'depth_direction', label: 'Depth of Experience' },
            ];

            // Filter to top 3-5 most relevant dimensions
            var relevant = dimensions.filter(function(dim) {
                return Math.abs(this.intentVector[dim.id] || 0) > 0.15;
            }.bind(this)).slice(0, 5);

            if (relevant.length < 3) {
                relevant = dimensions.slice(0, 3);
            }

            var html = '';
            relevant.forEach(function(dim) {
                html += '<div class="tripdar-rec__signal-row" data-dimension="' + dim.id + '">';
                html += '<span class="tripdar-rec__signal-label">' + this.escapeHtml(dim.label) + '</span>';
                html += '<div class="tripdar-rec__signal-options">';
                ['more', 'same', 'less'].forEach(function(dir) {
                    html += '<label class="tripdar-rec__signal-option">';
                    html += '<input type="radio" name="signal_' + dim.id + '" value="' + dir + '">';
                    html += '<span>' + dir.charAt(0).toUpperCase() + dir.slice(1) + '</span>';
                    html += '</label>';
                });
                html += '</div>';
                html += '</div>';
            }.bind(this));

            signalsEl.innerHTML = html;
        }

        async submitSignals() {
            var signals = [];
            this.container.querySelectorAll('.tripdar-rec__signal-row').forEach(function(row) {
                var dim = row.dataset.dimension;
                var checked = row.querySelector('input:checked');
                if (checked) {
                    signals.push({ dimensionId: dim, direction: checked.value });
                }
            });

            if (signals.length === 0) {
                this.showSection('thanks');
                this.sections.deepDive.style.display = 'none';
                return;
            }

            try {
                await this.ajax('tripdar_rec_signals', {
                    feedbackId: this.feedbackId,
                    signals: JSON.stringify(signals),
                });
            } catch (e) {
                console.error('Signal submission failed:', e);
            }

            this.sections.deepDive.style.display = 'none';
            this.showSection('thanks');
        }

        // =====================================================================
        // Dose Card
        // =====================================================================

        async requestDoseCard(btn) {
            var strainSlug = btn.dataset.strainSlug;
            var sessionToken = this.sessionToken || '';

            if (!strainSlug) return;

            var originalText = btn.innerHTML;
            btn.innerHTML = '<span class="tripdar-rec__loading-spinner-small"></span> Creating...';
            btn.disabled = true;

            try {
                var response = await this.ajax('tripdar_rec_dosing_guide', {
                    sessionToken: sessionToken,
                    strainSlug: strainSlug,
                });

                if (response.success && response.data && response.data.url) {
                    var url = response.data.url;
                    var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                    var forceQr = typeof tripdarRec !== 'undefined' && tripdarRec.forceQr;

                    if (isMobile && !forceQr) {
                        this.triggerDownload(url, strainSlug);
                        btn.innerHTML = '&#10003; Saved!';
                        setTimeout(function() { btn.innerHTML = originalText; btn.disabled = false; }, 3000);
                    } else {
                        this.showQrPopover(btn, url, strainSlug);
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                    }
                } else {
                    btn.innerHTML = 'Try Again';
                    btn.disabled = false;
                    setTimeout(function() { btn.innerHTML = originalText; }, 3000);
                }
            } catch (e) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }

        triggerDownload(url, strainSlug) {
            var a = document.createElement('a');
            a.href = url;
            a.download = strainSlug + '-dose-card.png';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }

        showQrPopover(btn, url, strainSlug) {
            var existing = this.container.querySelector('.tripdar-rec__qr-popover');
            if (existing) existing.remove();

            var popover = document.createElement('div');
            popover.className = 'tripdar-rec__qr-popover';
            popover.innerHTML = '<div class="tripdar-rec__qr-popover-inner">'
                + '<button type="button" class="tripdar-rec__qr-close">&times;</button>'
                + '<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url) + '" '
                + 'alt="QR Code" width="200" height="200">'
                + '<p>Scan to save your dose card</p>'
                + '<a href="' + url + '" download="' + strainSlug + '-dose-card.png" class="tripdar-rec__qr-download">Or download here</a>'
                + '</div>';

            btn.parentNode.style.position = 'relative';
            btn.parentNode.appendChild(popover);

            popover.querySelector('.tripdar-rec__qr-close').addEventListener('click', function() {
                popover.remove();
            });
        }

        // =====================================================================
        // Navigation & Utilities
        // =====================================================================

        showSection(name) {
            // Hide all sections
            for (var key in this.sections) {
                if (this.sections[key]) {
                    this.sections[key].style.display = 'none';
                }
            }

            // Show target
            if (this.sections[name]) {
                this.sections[name].style.display = '';
                this.sections[name].style.opacity = '0';
                requestAnimationFrame(() => {
                    this.sections[name].style.transition = 'opacity 0.3s ease';
                    this.sections[name].style.opacity = '1';
                });
            }
        }

        showError(message) {
            this.showSection('results');
            var resultsEl = document.getElementById('tripdar-rec-results');
            if (resultsEl) {
                resultsEl.innerHTML = '<div class="tripdar-rec__error"><p>' + this.escapeHtml(message) + '</p></div>';
            }
        }

        restart() {
            this.experienceLevel = null;
            this.inputPath = null;
            this.intentVector = null;
            this.sessionToken = null;
            this.results = null;
            this.selectedTiles = [];
            this.quizStep = 0;
            this.quizAnswers = {};
            this.feedbackId = null;
            this.resultIds = [];

            // Reset path card styles
            this.container.querySelectorAll('.tripdar-rec__path-card').forEach(function(card) {
                card.style.opacity = '';
                card.style.transform = '';
            });

            // Reset experience selection
            this.container.querySelectorAll('.tripdar-rec__experience-btn').forEach(function(btn) {
                btn.classList.remove('selected');
            });

            // Reset feedback buttons
            this.container.querySelectorAll('.tripdar-rec__feedback-btn').forEach(function(btn) {
                btn.disabled = false;
                btn.classList.remove('selected');
            });

            // Clear stepped path
            var steppedEl = document.getElementById('tripdar-rec-stepped');
            if (steppedEl) {
                steppedEl.style.display = 'none';
                steppedEl.textContent = '';
            }

            this.showSection('experience');
        }

        async ajax(action, data) {
            var params = new URLSearchParams();
            params.append('action', action);
            params.append('nonce', tripdarRec.nonce);

            for (var key in data) {
                params.append(key, data[key]);
            }

            var response = await fetch(tripdarRec.ajaxUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params,
            });

            return response.json();
        }

        escapeHtml(str) {
            if (!str) return '';
            var div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
    }

    // Make class globally accessible for inline fallback
    window.TripdarRecommendationEngine = TripdarRecommendationEngine;

    // Initialize — handle both cases: DOM ready or already loaded
    function tripdarRecInit() {
        var container = document.querySelector('.tripdar-rec');
        if (container && !container.dataset.initialized) {
            container.dataset.initialized = 'true';
            new TripdarRecommendationEngine(container);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tripdarRecInit);
    } else {
        tripdarRecInit();
    }
})();
