/**
 * Tripdar Strain Explorer
 *
 * Handles strain grid, filtering, pagination, and modals.
 */

(function() {
    'use strict';

    class TripdarExplorer {
        constructor(container) {
            this.container = container;
            this.perPage = parseInt(container.dataset.perPage, 10) || 12;
            this.currentPage = 1;
            this.filters = {};
            this.isLoading = false;

            this.elements = {
                grid: container.querySelector('.tripdar-explorer__grid'),
                loadMoreBtn: container.querySelector('.tripdar-btn--load-more'),
                loading: container.querySelector('.tripdar-explorer__loading'),
                filterSelects: container.querySelectorAll('.tripdar-filter-select')
            };

            this.init();
        }

        init() {
            // Load "tried" state from localStorage
            this.triedStrains = JSON.parse(localStorage.getItem('tripdar_tried') || '[]');

            // Filter changes
            this.elements.filterSelects.forEach(select => {
                select.addEventListener('change', () => this.onFilterChange());
            });

            // Load more button
            if (this.elements.loadMoreBtn) {
                this.elements.loadMoreBtn.addEventListener('click', () => this.loadMore());
            }

            // Strain card clicks (but not on the tried button)
            this.container.addEventListener('click', (e) => {
                // Handle "I've tried this" button
                const triedBtn = e.target.closest('.tripdar-tried-btn');
                if (triedBtn) {
                    e.stopPropagation();
                    this.handleTriedClick(triedBtn);
                    return;
                }

                const card = e.target.closest('.tripdar-strain-card');
                if (card) {
                    const slug = card.dataset.slug;
                    this.openStrainModal(slug);
                }
            });

            // Mark already-tried strains
            this.updateTriedButtons();

            // Listen for quiz strain view
            document.addEventListener('tripdar:view-strain', (e) => {
                this.openStrainModal(e.detail.slug);
            });

            // Close modal on escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.closeModal();
                }
            });
        }

        onFilterChange() {
            this.filters = {};

            this.elements.filterSelects.forEach(select => {
                const filterName = select.dataset.filter;
                const value = select.value;
                if (value) {
                    this.filters[filterName] = value;
                }
            });

            // Reset and reload
            this.currentPage = 1;
            this.loadStrains(true);
        }

        async loadStrains(replace = false) {
            if (this.isLoading) return;

            this.isLoading = true;
            this.showLoading();

            try {
                const response = await fetch(tripdarExplorer.ajaxUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        action: 'tripdar_load_strains',
                        nonce: tripdarExplorer.nonce,
                        page: this.currentPage,
                        per_page: this.perPage,
                        filters: JSON.stringify(this.filters)
                    })
                });

                const data = await response.json();

                if (data.success) {
                    if (replace) {
                        this.elements.grid.innerHTML = data.data.html;
                    } else {
                        this.elements.grid.insertAdjacentHTML('beforeend', data.data.html);
                    }

                    // Update tried state on new cards
                    this.updateTriedButtons();

                    // Update pagination
                    if (data.data.hasMore) {
                        if (this.elements.loadMoreBtn) {
                            this.elements.loadMoreBtn.style.display = '';
                            this.elements.loadMoreBtn.dataset.page = this.currentPage + 1;
                        }
                    } else {
                        if (this.elements.loadMoreBtn) {
                            this.elements.loadMoreBtn.style.display = 'none';
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to load strains:', error);
            } finally {
                this.isLoading = false;
                this.hideLoading();
            }
        }

        loadMore() {
            this.currentPage++;
            this.loadStrains(false);
        }

        showLoading() {
            if (this.elements.loading) {
                this.elements.loading.style.display = 'flex';
            }
        }

        hideLoading() {
            if (this.elements.loading) {
                this.elements.loading.style.display = 'none';
            }
        }

        async openStrainModal(slug) {
            // Create modal if doesn't exist
            let modal = document.querySelector('.tripdar-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.className = 'tripdar-modal';
                modal.innerHTML = `
                    <div class="tripdar-modal__backdrop"></div>
                    <div class="tripdar-modal__container">
                        <button class="tripdar-modal__close" aria-label="Close">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                        <div class="tripdar-modal__content">
                            <div class="tripdar-modal__loading">
                                <div class="tripdar-loading-spinner"></div>
                                <span>Loading strain details...</span>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);

                // Close handlers
                modal.querySelector('.tripdar-modal__backdrop').addEventListener('click', () => this.closeModal());
                modal.querySelector('.tripdar-modal__close').addEventListener('click', () => this.closeModal());
            }

            // Show modal
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';

            // Track strain view
            this.trackEvent('strain_view', slug);

            // Load strain details
            try {
                const response = await fetch(tripdarExplorer.ajaxUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        action: 'tripdar_get_strain',
                        nonce: tripdarExplorer.nonce,
                        slug: slug
                    })
                });

                const data = await response.json();

                if (data.success) {
                    modal.querySelector('.tripdar-modal__content').innerHTML = data.data.html;

                    // Initialize feedback widget in modal
                    const feedbackContainer = modal.querySelector('.tripdar-feedback');
                    if (feedbackContainer && typeof TripdarFeedback !== 'undefined') {
                        new TripdarFeedback(feedbackContainer);
                    }
                } else {
                    modal.querySelector('.tripdar-modal__content').innerHTML = `
                        <div class="tripdar-error">
                            <p class="tripdar-error__message">Unable to load strain details.</p>
                        </div>
                    `;
                }
            } catch (error) {
                console.error('Failed to load strain:', error);
                modal.querySelector('.tripdar-modal__content').innerHTML = `
                    <div class="tripdar-error">
                        <p class="tripdar-error__message">Unable to load strain details.</p>
                    </div>
                `;
            }
        }

        handleTriedClick(btn) {
            const slug = btn.dataset.slug;
            if (!slug) return;

            if (this.triedStrains.includes(slug)) {
                // Un-try
                this.triedStrains = this.triedStrains.filter(s => s !== slug);
                btn.classList.remove('active');
                btn.querySelector('.tripdar-tried-btn__text').textContent = "I've tried this";
            } else {
                // Mark as tried
                this.triedStrains.push(slug);
                btn.classList.add('active');
                btn.querySelector('.tripdar-tried-btn__text').textContent = 'Tried';
                this.trackEvent('strain_tried', slug);
            }

            localStorage.setItem('tripdar_tried', JSON.stringify(this.triedStrains));
        }

        updateTriedButtons() {
            this.container.querySelectorAll('.tripdar-tried-btn').forEach(btn => {
                const slug = btn.dataset.slug;
                if (this.triedStrains.includes(slug)) {
                    btn.classList.add('active');
                    btn.querySelector('.tripdar-tried-btn__text').textContent = 'Tried';
                }
            });
        }

        trackEvent(eventType, entitySlug) {
            // Fire-and-forget analytics
            fetch(tripdarExplorer.ajaxUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    action: 'tripdar_track_event',
                    nonce: tripdarExplorer.nonce,
                    event_type: eventType,
                    entity_slug: entitySlug
                })
            }).catch(() => {}); // Silently ignore errors
        }

        closeModal() {
            const modal = document.querySelector('.tripdar-modal');
            if (modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
        }
    }

    // Modal styles (injected)
    const modalStyles = `
        .tripdar-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 999999;
            display: none;
        }
        .tripdar-modal.active {
            display: block;
        }
        .tripdar-modal__backdrop {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(44, 24, 16, 0.6);
            backdrop-filter: blur(4px);
        }
        .tripdar-modal__container {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            max-width: 800px;
            max-height: 90vh;
            background: #faf6f1;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(44, 24, 16, 0.3);
            overflow: auto;
        }
        .tripdar-modal__close {
            position: absolute;
            top: 16px;
            right: 16px;
            width: 40px;
            height: 40px;
            border: none;
            background: white;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1;
            box-shadow: 0 2px 8px rgba(44, 24, 16, 0.1);
        }
        .tripdar-modal__close:hover {
            background: #f0e6d8;
        }
        .tripdar-modal__content {
            padding: 32px;
        }
        .tripdar-modal__loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
            padding: 48px;
            color: #8b7355;
        }
    `;

    // Inject styles
    const styleSheet = document.createElement('style');
    styleSheet.textContent = modalStyles;
    document.head.appendChild(styleSheet);

    // Initialize all explorer instances
    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('.tripdar-explorer').forEach(container => {
            new TripdarExplorer(container);
        });
    });
})();
