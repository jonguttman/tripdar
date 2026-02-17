/**
 * Tripdar Feedback System
 *
 * Handles rating slider and survey interactions.
 */

(function() {
    'use strict';

    class TripdarFeedback {
        constructor(container) {
            this.container = container;
            this.strainSlug = container.dataset.strainSlug;
            this.currentRating = 3;
            this.surveyResponses = {};
            this.surveyQuestions = [];
            this.ratedStrains = this.loadRatedStrains();
            this.hasRated = this.hasUserRated();

            this.elements = {
                ratingSlider: container.querySelector('.tripdar-rating-slider__input'),
                submitBtn: container.querySelector('.tripdar-feedback__submit'),
                ratingSection: container.querySelector('.tripdar-feedback__rating'),
                thanksSection: container.querySelector('.tripdar-feedback__thanks'),
                surveyPrompt: container.querySelector('.tripdar-feedback__survey-prompt'),
                surveySection: container.querySelector('.tripdar-feedback__survey'),
                surveyStartBtn: container.querySelector('.tripdar-feedback__survey-start'),
                surveySkipBtn: container.querySelector('.tripdar-feedback__survey-skip')
            };

            this.init();
        }

        init() {
            // Check if user has already rated this strain
            if (this.hasRated) {
                this.showPostRatingView().catch(err => {
                    console.error('Error showing post-rating view:', err);
                    // Fallback to showing rating widget if there's an error
                    this.showRatingWidget();
                });
            } else {
                this.showRatingWidget();
            }
        }

        showRatingWidget() {
            // Rating slider
            if (this.elements.ratingSlider) {
                this.elements.ratingSlider.addEventListener('input', (e) => {
                    this.currentRating = parseInt(e.target.value, 10);
                    this.updateSliderLabel();
                });
            }

            // Submit rating
            if (this.elements.submitBtn) {
                this.elements.submitBtn.addEventListener('click', () => this.submitRating());
            }

            // Survey buttons
            if (this.elements.surveyStartBtn) {
                this.elements.surveyStartBtn.addEventListener('click', () => this.startSurvey());
            }

            if (this.elements.surveySkipBtn) {
                this.elements.surveySkipBtn.addEventListener('click', () => this.skipSurvey());
            }
        }

        loadRatedStrains() {
            try {
                if (typeof localStorage === 'undefined') {
                    console.warn('localStorage not available, rating tracking disabled');
                    return {};
                }
                const data = localStorage.getItem('tripdar_rated_strains');
                return data ? JSON.parse(data) : {};
            } catch (e) {
                console.error('Failed to load rated strains from localStorage:', e);
                return {};
            }
        }

        hasUserRated() {
            try {
                return this.strainSlug in this.ratedStrains;
            } catch (e) {
                console.error('Error checking rated status:', e);
                return false;
            }
        }

        saveRating(rating) {
            try {
                if (typeof localStorage === 'undefined') {
                    console.warn('localStorage not available, cannot save rating');
                    return;
                }
                this.ratedStrains[this.strainSlug] = rating;
                localStorage.setItem('tripdar_rated_strains', JSON.stringify(this.ratedStrains));
            } catch (e) {
                console.error('Failed to save rating to localStorage:', e);
            }
        }

        updateSliderLabel() {
            const labels = this.container.querySelectorAll('.tripdar-rating-label');
            labels.forEach(label => {
                const value = parseInt(label.dataset.value, 10);
                label.style.fontWeight = value === this.currentRating ? '600' : '400';
                label.style.color = value === this.currentRating ? '#2c1810' : '#8b7355';
            });
        }

        async submitRating() {
            this.elements.submitBtn.disabled = true;
            this.elements.submitBtn.textContent = 'Submitting...';

            try {
                const response = await fetch(tripdarFeedback.ajaxUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        action: 'tripdar_submit_feedback',
                        nonce: tripdarFeedback.nonce,
                        strain_slug: this.strainSlug,
                        rating: this.currentRating
                    })
                });

                const data = await response.json();

                if (data.success) {
                    this.onRatingSubmitted();
                } else {
                    this.showError('Unable to submit feedback. Please try again.');
                }
            } catch (error) {
                console.error('Feedback submission error:', error);
                this.showError('Unable to submit feedback. Please try again.');
            }
        }

        onRatingSubmitted() {
            // Save rating to localStorage
            this.saveRating(this.currentRating);

            // Hide rating section
            if (this.elements.ratingSection) {
                this.elements.ratingSection.style.display = 'none';
            }

            // Show post-rating view
            this.showPostRatingView();
        }

        showThanks() {
            if (this.elements.thanksSection) {
                this.elements.thanksSection.style.display = 'block';
            }
        }

        showSurveyPrompt() {
            if (this.elements.surveyPrompt) {
                this.elements.surveyPrompt.style.display = 'block';
            }
        }

        skipSurvey() {
            if (this.elements.surveyPrompt) {
                this.elements.surveyPrompt.style.display = 'none';
            }
            this.showThanks();
        }

        async startSurvey() {
            if (this.elements.surveyPrompt) {
                this.elements.surveyPrompt.style.display = 'none';
            }

            // Fetch survey questions
            try {
                const response = await fetch(tripdarFeedback.ajaxUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        action: 'tripdar_get_survey',
                        nonce: tripdarFeedback.nonce
                    })
                });

                const data = await response.json();

                if (data.success && data.data.questions) {
                    this.surveyQuestions = data.data.questions;
                    this.renderSurvey();
                } else {
                    this.showThanks();
                }
            } catch (error) {
                console.error('Survey fetch error:', error);
                this.showThanks();
            }
        }

        renderSurvey() {
            if (!this.elements.surveySection) return;

            let html = `
                <div class="tripdar-survey">
                    <div class="tripdar-survey__header">
                        <h4 class="tripdar-survey__title">Help Us Improve</h4>
                        <p class="tripdar-survey__subtitle">Just a few quick questions (45 seconds)</p>
                    </div>
                    <div class="tripdar-survey__questions">
            `;

            this.surveyQuestions.forEach((question, index) => {
                html += `
                    <div class="tripdar-survey-question" data-question-id="${this.escapeHtml(question.id)}">
                        <p class="tripdar-survey-question__text">${this.escapeHtml(question.question)}</p>
                        <div class="tripdar-survey-options">
                `;

                question.options.forEach(option => {
                    html += `
                        <label class="tripdar-survey-option" data-option-id="${this.escapeHtml(option.id)}">
                            <input type="${question.multiSelect ? 'checkbox' : 'radio'}"
                                   name="survey_${question.id}"
                                   value="${this.escapeHtml(option.id)}">
                            <span>${this.escapeHtml(option.label)}</span>
                        </label>
                    `;
                });

                html += `
                        </div>
                    </div>
                `;
            });

            // Freeform text area
            html += `
                    <div class="tripdar-survey-question">
                        <p class="tripdar-survey-question__text">Anything else you'd like to share? (Optional)</p>
                        <textarea class="tripdar-survey-textarea"
                                  placeholder="Your experience helps improve our recommendations..."
                                  maxlength="500"></textarea>
                    </div>
                </div>
                <div class="tripdar-survey__actions">
                    <button class="tripdar-btn tripdar-btn--primary tripdar-survey__submit">
                        Submit Feedback
                    </button>
                </div>
            </div>
            `;

            this.elements.surveySection.innerHTML = html;
            this.elements.surveySection.style.display = 'block';

            // Bind option clicks
            this.elements.surveySection.querySelectorAll('.tripdar-survey-option').forEach(option => {
                option.addEventListener('click', (e) => {
                    const input = option.querySelector('input');
                    const questionEl = option.closest('.tripdar-survey-question');
                    const questionId = questionEl.dataset.questionId;

                    if (input.type === 'radio') {
                        // Deselect siblings
                        questionEl.querySelectorAll('.tripdar-survey-option').forEach(opt => {
                            opt.classList.remove('selected');
                        });
                    }

                    option.classList.toggle('selected');
                    input.checked = option.classList.contains('selected');

                    // Update responses
                    this.updateSurveyResponses(questionId, questionEl);
                });
            });

            // Bind submit
            const submitBtn = this.elements.surveySection.querySelector('.tripdar-survey__submit');
            if (submitBtn) {
                submitBtn.addEventListener('click', () => this.submitSurvey());
            }
        }

        updateSurveyResponses(questionId, questionEl) {
            const selectedOptions = questionEl.querySelectorAll('.tripdar-survey-option.selected');
            const values = Array.from(selectedOptions).map(opt => opt.dataset.optionId);

            if (values.length > 0) {
                this.surveyResponses[questionId] = values;
            } else {
                delete this.surveyResponses[questionId];
            }
        }

        async submitSurvey() {
            const submitBtn = this.elements.surveySection.querySelector('.tripdar-survey__submit');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Submitting...';
            }

            const freeformText = this.elements.surveySection.querySelector('.tripdar-survey-textarea')?.value || '';

            try {
                const response = await fetch(tripdarFeedback.ajaxUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        action: 'tripdar_submit_survey',
                        nonce: tripdarFeedback.nonce,
                        strain_slug: this.strainSlug,
                        rating: this.currentRating,
                        responses: JSON.stringify(this.surveyResponses),
                        freeform_text: freeformText
                    })
                });

                const data = await response.json();

                if (data.success) {
                    this.onSurveySubmitted();
                } else {
                    this.showError('Unable to submit survey. Thank you for trying!');
                }
            } catch (error) {
                console.error('Survey submission error:', error);
                this.showError('Unable to submit survey. Thank you for trying!');
            }
        }

        onSurveySubmitted() {
            if (this.elements.surveySection) {
                this.elements.surveySection.innerHTML = `
                    <div class="tripdar-survey__complete">
                        <div class="tripdar-survey__complete-icon">
                            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#4d7c5a" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M8 12l3 3 5-6"/>
                            </svg>
                        </div>
                        <h4 class="tripdar-survey__complete-title">Thank You!</h4>
                        <p class="tripdar-survey__complete-text">
                            Your insights help us improve Tripdar for everyone.
                        </p>
                    </div>
                `;
            }
        }

        showError(message) {
            console.error(message);
            // Reset button state
            if (this.elements.submitBtn) {
                this.elements.submitBtn.disabled = false;
                this.elements.submitBtn.textContent = 'Submit Feedback';
            }
        }

        async showPostRatingView() {
            console.log('showPostRatingView called for strain:', this.strainSlug);

            const strainName = this.strainSlug.split('-').map(word =>
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');

            const html = `
                <div class="tripdar-post-rating">
                    <div class="tripdar-post-rating__message">
                        <h4>Thanks for rating ${strainName}!</h4>
                        <p>Share your experience to help others on their journey.</p>
                    </div>

                    <div class="tripdar-trip-report-prompt">
                        ${this.renderTripReportForm()}
                    </div>

                    <div class="tripdar-recommendations">
                        <h4>You might also like...</h4>
                        <div class="tripdar-recommendations__loading">
                            <div class="tripdar-loading-spinner"></div>
                            <span>Loading suggestions...</span>
                        </div>
                    </div>
                </div>
            `;

            // Find the feedback body section and replace its content
            const ratingSection = this.container.querySelector('.tripdar-feedback__rating');
            console.log('Rating section found:', !!ratingSection);

            if (!ratingSection) {
                console.error('Cannot find .tripdar-feedback__rating element');
                return;
            }

            const feedbackBody = ratingSection.parentElement;
            console.log('Feedback body found:', !!feedbackBody);

            if (feedbackBody) {
                console.log('Replacing feedback body HTML');
                feedbackBody.innerHTML = html;

                // Bind trip report form
                this.bindTripReportForm();

                // Load recommendations
                await this.loadRecommendations();
            } else {
                console.error('Cannot find feedback body parent element');
            }
        }

        renderTripReportForm() {
            return `
                <form class="tripdar-trip-report-inline">
                    <div class="tripdar-form-row">
                        <label>Dose Amount</label>
                        <input type="text" name="dose_amount" placeholder="e.g., 2.5g" required>
                    </div>

                    <div class="tripdar-form-row">
                        <label>Dose Category</label>
                        <select name="dose_category" required>
                            <option value="">Select...</option>
                            <option value="MICRODOSE">Microdose</option>
                            <option value="LOW">Low</option>
                            <option value="MODERATE">Moderate</option>
                            <option value="HIGH">High</option>
                            <option value="HEROIC">Heroic</option>
                        </select>
                    </div>

                    <div class="tripdar-form-row">
                        <label>Setting</label>
                        <select name="setting" required>
                            <option value="">Select...</option>
                            <option value="nature">Nature</option>
                            <option value="home">Home</option>
                            <option value="ceremony">Ceremony</option>
                            <option value="social">Social</option>
                            <option value="solo">Solo</option>
                            <option value="therapeutic">Therapeutic</option>
                            <option value="creative">Creative</option>
                            <option value="other">Other</option>
                        </select>
                    </div>

                    <div class="tripdar-form-row">
                        <label>Title</label>
                        <input type="text" name="title" placeholder="Brief headline..." required>
                    </div>

                    <div class="tripdar-form-row">
                        <label>Your Experience (min 50 characters)</label>
                        <textarea name="body" rows="6" required minlength="50" placeholder="Describe your experience in detail..."></textarea>
                        <span class="tripdar-char-count">0 characters</span>
                    </div>

                    <button type="submit" class="tripdar-btn tripdar-btn--primary">
                        Submit TripTale
                    </button>
                </form>
            `;
        }

        bindTripReportForm() {
            console.log('Binding trip report form...');
            const form = this.container.querySelector('.tripdar-trip-report-inline');

            if (!form) {
                console.error('Trip report form not found in container');
                return;
            }

            console.log('Trip report form found, attaching handlers');

            const textarea = form.querySelector('textarea[name="body"]');
            const charCount = form.querySelector('.tripdar-char-count');

            // Character count
            if (textarea && charCount) {
                textarea.addEventListener('input', () => {
                    charCount.textContent = `${textarea.value.length} characters`;
                });
            }

            // Form submission
            form.addEventListener('submit', async (e) => {
                console.log('Form submit event triggered!');
                e.preventDefault();

                const formData = new FormData(form);
                const reportData = {
                    strainSlug: this.strainSlug,
                    doseAmount: formData.get('dose_amount'),
                    doseCategory: formData.get('dose_category'),
                    setting: formData.get('setting'),
                    title: formData.get('title'),
                    body: formData.get('body')
                };

                console.log('Submitting trip report:', reportData);

                const body = new URLSearchParams({
                    action: 'tripdar_submit_report',
                    nonce: tripdarFeedback.nonce,
                    data: JSON.stringify(reportData)
                });

                try {
                    const response = await fetch(tripdarFeedback.ajaxUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body
                    });

                    const data = await response.json();
                    console.log('Trip report response:', data);

                    if (data.success) {
                        form.innerHTML = '<p class="tripdar-success">✓ TripTale submitted! Thank you for sharing.</p>';
                    } else {
                        const errorMsg = data.data || data.message || 'Failed to submit report';
                        console.error('Trip report submission failed:', errorMsg);
                        // Show full error details on the page for debugging
                        const submitBtn = form.querySelector('[type="submit"]');
                        if (submitBtn) submitBtn.disabled = false;
                        const existing = form.querySelector('.tripdar-submit-error');
                        if (existing) existing.remove();
                        const errEl = document.createElement('p');
                        errEl.className = 'tripdar-submit-error';
                        errEl.style.cssText = 'color:red;font-size:0.85rem;margin-top:0.5rem;padding:0.5rem;background:#fff0f0;border-radius:4px;';
                        errEl.textContent = 'Error: ' + JSON.stringify(errorMsg);
                        form.appendChild(errEl);
                    }
                } catch (error) {
                    console.error('Report submission error:', error);
                    alert('Network error. Please try again.');
                }
            });
        }

        async loadRecommendations() {
            const container = this.container.querySelector('.tripdar-recommendations');
            if (!container) return;

            try {
                const response = await fetch(tripdarFeedback.ajaxUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        action: 'tripdar_get_similar',
                        nonce: tripdarFeedback.nonce,
                        strain_slug: this.strainSlug,
                        limit: 3
                    })
                });

                const data = await response.json();

                if (data.success && data.data && data.data.length > 0) {
                    const recs = data.data;
                    const html = recs.map(rec => this.renderRecommendationCard(rec)).join('');
                    container.innerHTML = `
                        <h4>You might also like...</h4>
                        <div class="tripdar-recommendations__grid">${html}</div>
                    `;

                    // Bind click handlers
                    this.bindRecommendationCards();
                } else {
                    container.innerHTML = `
                        <h4>Explore More</h4>
                        <p class="tripdar-recommendations__empty">Check out our full strain collection to find your next journey!</p>
                    `;
                }
            } catch (error) {
                console.error('Failed to load recommendations:', error);
                container.innerHTML = '<p class="tripdar-error">Unable to load suggestions</p>';
            }
        }

        renderRecommendationCard(rec) {
            // Extract shared vibes and unique vibe
            const sharedVibes = rec.sharedVibes || [];
            const uniqueVibe = rec.uniqueVibe || null;
            const imageUrl = rec.visualizationUrl || '';

            return `
                <div class="tripdar-rec-card" data-slug="${this.escapeHtml(rec.slug)}">
                    ${imageUrl ? `
                        <div class="tripdar-rec-card__image">
                            <img src="${this.escapeHtml(imageUrl)}" alt="${this.escapeHtml(rec.name)}" loading="lazy">
                        </div>
                    ` : `
                        <div class="tripdar-rec-card__placeholder">
                            <svg viewBox="0 0 60 60" class="tripdar-placeholder-icon">
                                <ellipse cx="30" cy="45" rx="6" ry="10" fill="currentColor" opacity="0.5"/>
                                <ellipse cx="30" cy="28" rx="18" ry="14" fill="currentColor"/>
                            </svg>
                        </div>
                    `}

                    <div class="tripdar-rec-card__content">
                        <div class="tripdar-rec-card__header">
                            <h5>${this.escapeHtml(rec.name)}</h5>
                            <span class="tripdar-rec-card__potency">${this.escapeHtml(rec.potency || 'Moderate')}</span>
                        </div>

                        <div class="tripdar-rec-card__explanation">
                            ${sharedVibes.length > 0 ? `
                                <p>
                                    <strong>Like ${this.strainSlug}:</strong>
                                    ${sharedVibes.slice(0, 2).map(v => this.escapeHtml(v)).join(', ')}
                                </p>
                            ` : ''}
                            ${uniqueVibe ? `
                                <p>
                                    <strong>Plus:</strong> ${this.escapeHtml(uniqueVibe)} experience
                                    - worth exploring for variety
                                </p>
                            ` : ''}
                        </div>

                        <button class="tripdar-btn tripdar-btn--secondary tripdar-rec-card__btn">
                            View ${this.escapeHtml(rec.name)}
                        </button>
                    </div>
                </div>
            `;
        }

        bindRecommendationCards() {
            const cards = this.container.querySelectorAll('.tripdar-rec-card__btn');

            cards.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const card = e.target.closest('.tripdar-rec-card');
                    const slug = card.dataset.slug;

                    // Trigger strain modal open (emit custom event for explorer.js to handle)
                    document.dispatchEvent(new CustomEvent('tripdar:view-strain', {
                        detail: { slug }
                    }));
                });
            });
        }

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    }

    // Expose TripdarFeedback globally so it can be initialized in modals
    window.TripdarFeedback = TripdarFeedback;

    // Initialize all feedback instances
    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('.tripdar-feedback').forEach(container => {
            new TripdarFeedback(container);
        });
    });
})();
