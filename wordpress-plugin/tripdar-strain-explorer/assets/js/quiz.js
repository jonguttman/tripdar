/**
 * Tripdar Quiz Journey
 *
 * Handles the mystical strain finder quiz interaction.
 */

(function() {
    'use strict';

    class TripdarQuiz {
        constructor(container) {
            this.container = container;
            this.answers = {};
            this.currentQuestion = 0;
            this.availableStrains = JSON.parse(container.dataset.availableStrains || '[]');
            this.showAlternatives = container.dataset.showAlternatives !== 'false';

            this.screens = {
                welcome: container.querySelector('.tripdar-quiz__screen--welcome'),
                questions: container.querySelector('.tripdar-quiz__questions'),
                loading: container.querySelector('.tripdar-quiz__screen--loading'),
                result: container.querySelector('.tripdar-quiz__screen--result'),
                noMatch: container.querySelector('.tripdar-quiz__screen--no-match')
            };

            this.questionScreens = container.querySelectorAll('.tripdar-quiz__screen--question');

            this.init();
        }

        init() {
            // Start button
            const startBtn = this.container.querySelector('.tripdar-quiz__start');
            if (startBtn) {
                startBtn.addEventListener('click', () => this.startQuiz());
            }

            // Restart button
            const restartBtn = this.container.querySelector('.tripdar-quiz__restart');
            if (restartBtn) {
                restartBtn.addEventListener('click', () => this.restartQuiz());
            }

            // Answer buttons
            this.container.querySelectorAll('.tripdar-quiz__answer').forEach(btn => {
                btn.addEventListener('click', (e) => this.selectAnswer(e.currentTarget));
            });
        }

        showScreen(screenName) {
            // Hide all screens
            Object.values(this.screens).forEach(screen => {
                if (screen) {
                    screen.style.display = 'none';
                    screen.classList.remove('active');
                }
            });

            // Hide question container
            if (this.screens.questions) {
                this.screens.questions.style.display = 'none';
            }

            // Show requested screen
            const screen = this.screens[screenName];
            if (screen) {
                screen.style.display = 'block';
                screen.classList.add('active');
            }
        }

        showQuestion(index) {
            // Show questions container
            if (this.screens.questions) {
                this.screens.questions.style.display = 'block';
            }

            // Hide all question screens
            this.questionScreens.forEach(qs => {
                qs.style.display = 'none';
                qs.classList.remove('active');
            });

            // Show current question
            const currentScreen = this.questionScreens[index];
            if (currentScreen) {
                currentScreen.style.display = 'block';
                currentScreen.classList.add('active');
            }
        }

        startQuiz() {
            this.answers = {};
            this.currentQuestion = 0;

            // Hide welcome, show first question
            this.screens.welcome.style.display = 'none';
            this.screens.welcome.classList.remove('active');
            this.showQuestion(0);

            // Clear any previous selections
            this.container.querySelectorAll('.tripdar-quiz__answer.selected').forEach(btn => {
                btn.classList.remove('selected');
            });
        }

        restartQuiz() {
            this.startQuiz();
        }

        selectAnswer(button) {
            const questionScreen = button.closest('.tripdar-quiz__screen--question');
            const questionId = questionScreen.dataset.questionId;
            const answerId = button.dataset.answerId;

            // Record answer
            this.answers[questionId] = answerId;

            // Visual feedback
            questionScreen.querySelectorAll('.tripdar-quiz__answer').forEach(btn => {
                btn.classList.remove('selected');
            });
            button.classList.add('selected');

            // Delay then proceed
            setTimeout(() => {
                this.nextQuestion();
            }, 300);
        }

        nextQuestion() {
            this.currentQuestion++;

            if (this.currentQuestion < this.questionScreens.length) {
                this.showQuestion(this.currentQuestion);
            } else {
                this.submitQuiz();
            }
        }

        async submitQuiz() {
            // Show loading
            this.screens.questions.style.display = 'none';
            this.showScreen('loading');

            try {
                const response = await fetch(tripdarQuiz.ajaxUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        action: 'tripdar_submit_quiz',
                        nonce: tripdarQuiz.nonce,
                        answers: JSON.stringify(this.answers),
                        available_strains: JSON.stringify(this.availableStrains)
                    })
                });

                const data = await response.json();

                // Add suspenseful delay
                await this.delay(1500);

                if (data.success && data.data.recommendation) {
                    this.showResult(data.data.recommendation);
                } else {
                    this.showScreen('noMatch');
                }
            } catch (error) {
                console.error('Quiz submission error:', error);
                this.showScreen('noMatch');
            }
        }

        showResult(recommendation) {
            const resultContent = this.screens.result.querySelector('.tripdar-quiz__result-content');

            // Build result HTML
            let html = `
                <div class="tripdar-quiz__result-header">
                    <p class="tripdar-quiz__result-title">The Codex Reveals</p>
                    <h2 class="tripdar-quiz__result-strain">${this.escapeHtml(recommendation.strain.name)}</h2>
                </div>
                <p class="tripdar-quiz__result-reasoning">${this.escapeHtml(recommendation.reasoning)}</p>
                <div class="tripdar-quiz__result-card">
                    <div class="tripdar-quiz__result-vibes">
                        ${recommendation.strain.vibe.map(v => `<span class="tripdar-vibe-tag">${this.escapeHtml(v)}</span>`).join('')}
                    </div>
                    <p class="tripdar-quiz__result-desc">${this.escapeHtml(recommendation.strain.description)}</p>
                    <div class="tripdar-quiz__result-meta">
                        <span class="tripdar-tag tripdar-tag--potency tripdar-tag--${recommendation.strain.potency.toLowerCase().replace(' ', '-')}">
                            ${this.escapeHtml(recommendation.strain.potency)}
                        </span>
                        ${recommendation.strain.beginnerFriendly === 'yes' ? '<span class="tripdar-tag tripdar-tag--beginner">Beginner Friendly</span>' : ''}
                    </div>
                </div>
            `;

            // Add alternatives if available
            if (this.showAlternatives && recommendation.alternatives && recommendation.alternatives.length > 0) {
                html += `
                    <div class="tripdar-quiz__alternatives">
                        <h4 class="tripdar-quiz__alternatives-title">Also Consider</h4>
                        <div class="tripdar-quiz__alternatives-list">
                            ${recommendation.alternatives.map(alt => `
                                <div class="tripdar-quiz__alternative">
                                    <span class="tripdar-quiz__alternative-name">${this.escapeHtml(alt.name)}</span>
                                    <span class="tripdar-quiz__alternative-vibes">
                                        ${alt.vibe.slice(0, 2).map(v => this.escapeHtml(v)).join(', ')}
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            html += `
                <div class="tripdar-quiz__result-actions">
                    <button class="tripdar-btn tripdar-btn--primary tripdar-quiz__view-strain" data-slug="${this.escapeHtml(recommendation.strain.slug)}">
                        Explore ${this.escapeHtml(recommendation.strain.name)}
                    </button>
                    <button class="tripdar-btn tripdar-btn--ghost tripdar-quiz__restart">
                        Try Again
                    </button>
                </div>
            `;

            resultContent.innerHTML = html;

            // Bind new restart button
            const newRestartBtn = resultContent.querySelector('.tripdar-quiz__restart');
            if (newRestartBtn) {
                newRestartBtn.addEventListener('click', () => this.restartQuiz());
            }

            // Bind view strain button
            const viewStrainBtn = resultContent.querySelector('.tripdar-quiz__view-strain');
            if (viewStrainBtn) {
                viewStrainBtn.addEventListener('click', () => {
                    const slug = viewStrainBtn.dataset.slug;
                    // Trigger custom event for strain detail modal/navigation
                    this.container.dispatchEvent(new CustomEvent('tripdar:view-strain', {
                        detail: { slug },
                        bubbles: true
                    }));
                });
            }

            this.showScreen('result');
        }

        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    }

    // Initialize all quiz instances
    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('.tripdar-quiz').forEach(container => {
            new TripdarQuiz(container);
        });
    });
})();
