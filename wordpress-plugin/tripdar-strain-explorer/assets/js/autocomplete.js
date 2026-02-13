/**
 * Tripdar Strain Search Autocomplete
 *
 * Provides real-time strain search with fuzzy matching.
 */

(function() {
    'use strict';

    // Debounce helper
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Initialize search components
    function initSearch() {
        const searchContainers = document.querySelectorAll('.tripdar-search');

        searchContainers.forEach(container => {
            const input = container.querySelector('.tripdar-search__input');
            const results = container.querySelector('.tripdar-search__results');
            const detail = container.querySelector('.tripdar-search__detail');
            const icon = container.querySelector('.tripdar-search__icon');
            const loading = container.querySelector('.tripdar-search__loading');
            const limit = parseInt(container.dataset.limit) || 10;

            if (!input || !results) return;

            let currentResults = [];
            let selectedIndex = -1;

            // Search function with debounce
            const performSearch = debounce(async (query) => {
                if (query.length < 2) {
                    hideResults();
                    return;
                }

                showLoading();

                try {
                    const formData = new FormData();
                    formData.append('action', 'tripdar_search_strains');
                    formData.append('nonce', tripdarExplorer.nonce);
                    formData.append('query', query);
                    formData.append('limit', limit);

                    const response = await fetch(tripdarExplorer.ajaxUrl, {
                        method: 'POST',
                        body: formData
                    });

                    const data = await response.json();

                    if (data.success && data.data.results) {
                        currentResults = data.data.results;
                        renderResults(currentResults);
                    } else {
                        renderNoResults();
                    }
                } catch (error) {
                    console.error('Search error:', error);
                    renderError();
                } finally {
                    hideLoading();
                }
            }, 300);

            // Render search results
            function renderResults(items) {
                if (items.length === 0) {
                    renderNoResults();
                    return;
                }

                selectedIndex = -1;
                results.innerHTML = items.map((item, index) => `
                    <div class="tripdar-search__result" data-index="${index}" data-slug="${item.slug}">
                        <div class="tripdar-search__result-name">${escapeHtml(item.name)}</div>
                        <div class="tripdar-search__result-meta">
                            <span class="tripdar-search__result-potency">${formatPotency(item.potencyTier)}</span>
                            <span class="tripdar-search__result-beginner">${formatBeginner(item.beginnerSuitable)}</span>
                            <span class="tripdar-search__result-match">${formatMatchType(item.matchType)}</span>
                        </div>
                    </div>
                `).join('');

                showResults();
            }

            function renderNoResults() {
                results.innerHTML = `
                    <div class="tripdar-search__no-results">
                        No strains found. Try a different search term.
                    </div>
                `;
                showResults();
            }

            function renderError() {
                results.innerHTML = `
                    <div class="tripdar-search__error">
                        Search unavailable. Please try again.
                    </div>
                `;
                showResults();
            }

            function showResults() {
                results.style.display = 'block';
            }

            function hideResults() {
                results.style.display = 'none';
                selectedIndex = -1;
            }

            function showLoading() {
                if (icon) icon.style.display = 'none';
                if (loading) loading.style.display = 'flex';
            }

            function hideLoading() {
                if (icon) icon.style.display = 'flex';
                if (loading) loading.style.display = 'none';
            }

            // Handle result selection
            function selectResult(index) {
                if (index < 0 || index >= currentResults.length) return;

                const item = currentResults[index];
                input.value = item.name;
                hideResults();

                // Load strain detail if container exists
                if (detail) {
                    loadStrainDetail(item.slug);
                }

                // Dispatch custom event for external listeners
                container.dispatchEvent(new CustomEvent('tripdar:strain-selected', {
                    detail: item,
                    bubbles: true
                }));
            }

            // Load full strain detail
            async function loadStrainDetail(slug) {
                if (!detail) return;

                detail.innerHTML = '<div class="tripdar-search__detail-loading">Loading...</div>';
                detail.style.display = 'block';

                try {
                    const formData = new FormData();
                    formData.append('action', 'tripdar_get_strain');
                    formData.append('nonce', tripdarExplorer.nonce);
                    formData.append('slug', slug);

                    const response = await fetch(tripdarExplorer.ajaxUrl, {
                        method: 'POST',
                        body: formData
                    });

                    const data = await response.json();

                    if (data.success && data.data.html) {
                        detail.innerHTML = data.data.html;
                    } else {
                        detail.innerHTML = '<div class="tripdar-search__detail-error">Could not load strain details.</div>';
                    }
                } catch (error) {
                    console.error('Detail load error:', error);
                    detail.innerHTML = '<div class="tripdar-search__detail-error">Could not load strain details.</div>';
                }
            }

            // Keyboard navigation
            function updateSelection(newIndex) {
                const resultItems = results.querySelectorAll('.tripdar-search__result');
                if (resultItems.length === 0) return;

                // Remove previous selection
                resultItems.forEach(item => item.classList.remove('tripdar-search__result--selected'));

                // Wrap index
                if (newIndex < 0) newIndex = resultItems.length - 1;
                if (newIndex >= resultItems.length) newIndex = 0;

                selectedIndex = newIndex;
                resultItems[selectedIndex].classList.add('tripdar-search__result--selected');
                resultItems[selectedIndex].scrollIntoView({ block: 'nearest' });
            }

            // Event listeners
            input.addEventListener('input', (e) => {
                performSearch(e.target.value.trim());
            });

            input.addEventListener('keydown', (e) => {
                if (results.style.display === 'none') return;

                switch (e.key) {
                    case 'ArrowDown':
                        e.preventDefault();
                        updateSelection(selectedIndex + 1);
                        break;
                    case 'ArrowUp':
                        e.preventDefault();
                        updateSelection(selectedIndex - 1);
                        break;
                    case 'Enter':
                        e.preventDefault();
                        if (selectedIndex >= 0) {
                            selectResult(selectedIndex);
                        }
                        break;
                    case 'Escape':
                        hideResults();
                        break;
                }
            });

            input.addEventListener('focus', () => {
                if (currentResults.length > 0 && input.value.length >= 2) {
                    showResults();
                }
            });

            // Click on result
            results.addEventListener('click', (e) => {
                const resultItem = e.target.closest('.tripdar-search__result');
                if (resultItem) {
                    const index = parseInt(resultItem.dataset.index);
                    selectResult(index);
                }
            });

            // Close results when clicking outside
            document.addEventListener('click', (e) => {
                if (!container.contains(e.target)) {
                    hideResults();
                }
            });
        });
    }

    // Helper functions
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatPotency(tier) {
        const map = {
            'very-high': 'Very High',
            'high': 'High',
            'moderate': 'Moderate',
            'low': 'Low',
            'variable': 'Variable'
        };
        return map[tier] || tier;
    }

    function formatBeginner(suitable) {
        const map = {
            'yes': 'Beginner OK',
            'maybe': 'Some Experience',
            'no': 'Experienced'
        };
        return map[suitable] || suitable;
    }

    function formatMatchType(type) {
        const map = {
            'exact': 'Exact match',
            'prefix': 'Starts with',
            'contains': 'Contains',
            'fuzzy': 'Similar'
        };
        return map[type] || '';
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSearch);
    } else {
        initSearch();
    }
})();
