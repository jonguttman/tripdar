/**
 * Tripdar Data Value Features
 *
 * Handles compare tool, recommendations, and interactive features
 * for the new data value shortcodes.
 */

(function() {
    'use strict';

    // =============================================================================
    // Compare Tool
    // =============================================================================

    class TripdarCompare {
        constructor(container) {
            this.container = container;
            this.maxStrains = parseInt(container.dataset.max, 10) || 5;
            this.selectedStrains = [];

            this.elements = {
                selected: container.querySelector('.tripdar-compare__selected'),
                dropdown: container.querySelector('.tripdar-compare__dropdown'),
                runBtn: container.querySelector('.tripdar-compare__run'),
                loading: container.querySelector('.tripdar-compare__loading'),
                results: container.querySelector('.tripdar-compare__results')
            };

            this.init();
        }

        init() {
            // Load pre-selected strains from chips
            this.container.querySelectorAll('.tripdar-compare__chip').forEach(chip => {
                this.selectedStrains.push(chip.dataset.slug);
            });

            // Dropdown change
            this.elements.dropdown.addEventListener('change', (e) => {
                const slug = e.target.value;
                if (slug && !this.selectedStrains.includes(slug)) {
                    this.addStrain(slug);
                }
                e.target.value = '';
            });

            // Remove chip
            this.elements.selected.addEventListener('click', (e) => {
                if (e.target.closest('.tripdar-compare__chip-remove')) {
                    const chip = e.target.closest('.tripdar-compare__chip');
                    this.removeStrain(chip.dataset.slug);
                }
            });

            // Run comparison
            this.elements.runBtn.addEventListener('click', () => this.runComparison());
        }

        addStrain(slug) {
            if (this.selectedStrains.length >= this.maxStrains) {
                alert(`Maximum ${this.maxStrains} strains can be compared.`);
                return;
            }

            this.selectedStrains.push(slug);
            const name = this.elements.dropdown.querySelector(`option[value="${slug}"]`).textContent;

            const chip = document.createElement('span');
            chip.className = 'tripdar-compare__chip';
            chip.dataset.slug = slug;
            chip.innerHTML = `${name} <button class="tripdar-compare__chip-remove">&times;</button>`;
            this.elements.selected.appendChild(chip);

            // Disable option in dropdown
            this.elements.dropdown.querySelector(`option[value="${slug}"]`).disabled = true;

            this.updateRunButton();
        }

        removeStrain(slug) {
            const index = this.selectedStrains.indexOf(slug);
            if (index > -1) {
                this.selectedStrains.splice(index, 1);
            }

            const chip = this.elements.selected.querySelector(`[data-slug="${slug}"]`);
            if (chip) chip.remove();

            // Re-enable option in dropdown
            const option = this.elements.dropdown.querySelector(`option[value="${slug}"]`);
            if (option) option.disabled = false;

            this.updateRunButton();
        }

        updateRunButton() {
            this.elements.runBtn.disabled = this.selectedStrains.length < 2;
        }

        async runComparison() {
            if (this.selectedStrains.length < 2) return;

            this.elements.loading.style.display = 'flex';
            this.elements.results.style.display = 'none';

            try {
                const response = await fetch(tripdarAjax.ajaxUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        action: 'tripdar_compare_strains',
                        nonce: tripdarAjax.nonce,
                        strains: this.selectedStrains.join(',')
                    })
                });

                const data = await response.json();

                if (data.success) {
                    this.renderComparison(data.data);
                } else {
                    this.elements.results.innerHTML = '<p class="tripdar-error">Could not compare strains.</p>';
                }
            } catch (error) {
                console.error('Compare error:', error);
                this.elements.results.innerHTML = '<p class="tripdar-error">An error occurred.</p>';
            } finally {
                this.elements.loading.style.display = 'none';
                this.elements.results.style.display = 'block';
            }
        }

        renderComparison(data) {
            const strains = data.strains || [];
            const attributes = [
                { key: 'potency', label: 'Potency' },
                { key: 'visual', label: 'Visual Intensity' },
                { key: 'stability', label: 'Trip Consistency' },
                { key: 'beginner', label: 'Beginner Friendly' },
                { key: 'vibes', label: 'Vibes' },
                { key: 'onsetTime', label: 'Onset Time' },
                { key: 'duration', label: 'Duration' },
                { key: 'bodyHeadBalance', label: 'Body/Head Balance' },
                { key: 'emotionalCharacter', label: 'Emotional Character' }
            ];

            let html = '<table class="tripdar-compare__table"><thead><tr><th>Attribute</th>';
            strains.forEach(s => {
                html += `<th>${s.name}</th>`;
            });
            html += '</tr></thead><tbody>';

            attributes.forEach(attr => {
                html += `<tr><td>${attr.label}</td>`;
                strains.forEach(s => {
                    let value = s[attr.key] || '-';
                    if (Array.isArray(value)) {
                        value = value.join(', ');
                    }
                    html += `<td>${value}</td>`;
                });
                html += '</tr>';
            });

            html += '</tbody></table>';

            if (data.commonVibes && data.commonVibes.length > 0) {
                html += `<p class="tripdar-compare__common"><strong>Common vibes:</strong> ${data.commonVibes.join(', ')}</p>`;
            }

            if (data.lineageRelation) {
                html += `<p class="tripdar-compare__lineage"><strong>Lineage:</strong> ${data.lineageRelation}</p>`;
            }

            this.elements.results.innerHTML = html;
        }
    }

    // =============================================================================
    // Recommendations
    // =============================================================================

    class TripdarRecommendations {
        constructor(container) {
            this.container = container;
            this.limit = parseInt(container.dataset.limit, 10) || 5;

            this.elements = {
                loading: container.querySelector('.tripdar-recommendations__loading'),
                list: container.querySelector('.tripdar-recommendations__list'),
                empty: container.querySelector('.tripdar-recommendations__empty')
            };

            this.init();
        }

        async init() {
            await this.loadRecommendations();
        }

        async loadRecommendations() {
            try {
                const triedStrains = JSON.parse(localStorage.getItem('tripdar_tried') || '[]');

                if (triedStrains.length === 0) {
                    this.showEmpty();
                    return;
                }

                const response = await fetch(tripdarAjax.ajaxUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        action: 'tripdar_get_recommendations',
                        nonce: tripdarAjax.nonce,
                        tried: triedStrains.join(','),
                        limit: this.limit
                    })
                });

                const data = await response.json();

                if (data.success && data.data.recommendations && data.data.recommendations.length > 0) {
                    this.renderRecommendations(data.data.recommendations);
                } else {
                    this.showEmpty();
                }
            } catch (error) {
                console.error('Recommendations error:', error);
                this.showEmpty();
            }
        }

        showEmpty() {
            this.elements.loading.style.display = 'none';
            this.elements.list.style.display = 'none';
            this.elements.empty.style.display = 'block';
        }

        renderRecommendations(recommendations) {
            this.elements.loading.style.display = 'none';
            this.elements.empty.style.display = 'none';

            let html = '';
            recommendations.forEach(rec => {
                const reasonText = rec.reasons ? rec.reasons.join(', ') : '';
                html += `
                    <div class="tripdar-recommendation-card" data-slug="${rec.slug}">
                        <div class="tripdar-recommendation-card__content">
                            <h4 class="tripdar-recommendation-card__name">${rec.name}</h4>
                            <div class="tripdar-recommendation-card__meta">
                                <span class="tripdar-recommendation-card__score">${Math.round(rec.score * 100)}% match</span>
                                ${reasonText ? `<span class="tripdar-recommendation-card__reason">${reasonText}</span>` : ''}
                            </div>
                        </div>
                        <button class="tripdar-btn tripdar-btn--ghost tripdar-recommendation-card__explore">View</button>
                    </div>
                `;
            });

            this.elements.list.innerHTML = html;
            this.elements.list.style.display = 'grid';

            // Add click handlers
            this.elements.list.querySelectorAll('.tripdar-recommendation-card__explore').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const card = e.target.closest('.tripdar-recommendation-card');
                    const slug = card.dataset.slug;
                    // Trigger modal or navigate
                    window.dispatchEvent(new CustomEvent('tripdar:openStrain', { detail: { slug } }));
                });
            });
        }
    }

    // =============================================================================
    // Similar Strains
    // =============================================================================

    class TripdarSimilar {
        constructor(container) {
            this.container = container;

            // Add click handlers
            container.querySelectorAll('.tripdar-similar__explore').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const card = e.target.closest('.tripdar-similar__card');
                    const slug = card.dataset.slug;
                    window.dispatchEvent(new CustomEvent('tripdar:openStrain', { detail: { slug } }));
                });
            });
        }
    }

    // =============================================================================
    // Lineage Tree
    // =============================================================================

    class TripdarLineageTree {
        constructor(container) {
            this.container = container;
            this.highlight = container.dataset.highlight || '';

            this.elements = {
                search: container.querySelector('.tripdar-lineage-tree__search'),
                nodes: container.querySelectorAll('.tripdar-tree-node')
            };

            this.init();
        }

        init() {
            // Search functionality
            if (this.elements.search) {
                this.elements.search.addEventListener('input', (e) => {
                    this.filterNodes(e.target.value);
                });
            }

            // Node click handlers
            this.elements.nodes.forEach(node => {
                node.querySelector('.tripdar-tree-node__content').addEventListener('click', () => {
                    const slug = node.dataset.strain;
                    window.dispatchEvent(new CustomEvent('tripdar:openStrain', { detail: { slug } }));
                });
            });
        }

        filterNodes(query) {
            const q = query.toLowerCase().trim();

            this.elements.nodes.forEach(node => {
                const name = node.querySelector('.tripdar-tree-node__name').textContent.toLowerCase();
                if (!q || name.includes(q)) {
                    node.style.display = '';
                    if (q && name.includes(q)) {
                        node.classList.add('tripdar-tree-node--highlighted');
                    } else {
                        node.classList.remove('tripdar-tree-node--highlighted');
                    }
                } else {
                    node.style.display = 'none';
                }
            });
        }
    }

    // =============================================================================
    // Initialize
    // =============================================================================

    document.addEventListener('DOMContentLoaded', function() {
        // Initialize Compare
        document.querySelectorAll('.tripdar-compare').forEach(container => {
            new TripdarCompare(container);
        });

        // Initialize Recommendations
        document.querySelectorAll('.tripdar-recommendations').forEach(container => {
            new TripdarRecommendations(container);
        });

        // Initialize Similar
        document.querySelectorAll('.tripdar-similar').forEach(container => {
            new TripdarSimilar(container);
        });

        // Initialize Lineage Tree
        document.querySelectorAll('.tripdar-lineage-tree').forEach(container => {
            new TripdarLineageTree(container);
        });
    });

})();
