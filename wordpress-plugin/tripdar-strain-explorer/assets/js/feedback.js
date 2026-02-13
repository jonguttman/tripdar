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
            // Hide rating section
            if (this.elements.ratingSection) {
                this.elements.ratingSection.style.display = 'none';
            }

            // If rating is low (1-2), show survey prompt
            if (this.currentRating <= 2) {
                this.showSurveyPrompt();
            } else {
                this.showThanks();
            }
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
                            Your insights help us improve the codex for everyone.
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

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    }

    // Initialize all feedback instances
    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('.tripdar-feedback').forEach(container => {
            new TripdarFeedback(container);
        });
    });
})();
