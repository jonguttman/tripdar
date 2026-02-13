/**
 * Tripdar Ratings Component
 *
 * Handles star rating interactions and form submission.
 */

(function() {
    'use strict';

    // Initialize all reviews components on the page
    function initReviewsComponents() {
        document.querySelectorAll('.tripdar-reviews').forEach(initReviewsComponent);
    }

    function initReviewsComponent(container) {
        const strainSlug = container.dataset.strainSlug;
        const starInput = container.querySelector('.tripdar-reviews__star-input');
        const submitBtn = container.querySelector('.tripdar-reviews__submit-rating');
        const messageEl = container.querySelector('.tripdar-reviews__form-message');

        if (!starInput || !submitBtn) return;

        let selectedRating = 0;
        const stars = starInput.querySelectorAll('.tripdar-reviews__star');

        // Star hover effect
        stars.forEach(function(star, index) {
            star.addEventListener('mouseenter', function() {
                updateStarDisplay(index + 1, 'hover');
            });

            star.addEventListener('mouseleave', function() {
                updateStarDisplay(selectedRating, 'active');
            });

            star.addEventListener('click', function() {
                selectedRating = index + 1;
                updateStarDisplay(selectedRating, 'active');
                submitBtn.disabled = false;
            });
        });

        function updateStarDisplay(rating, className) {
            stars.forEach(function(star, index) {
                star.classList.remove('active', 'hover');
                if (index < rating) {
                    star.classList.add(className);
                }
            });
        }

        // Submit rating
        submitBtn.addEventListener('click', function() {
            if (selectedRating === 0 || submitBtn.disabled) return;

            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';

            // Use WordPress AJAX
            var formData = new FormData();
            formData.append('action', 'tripdar_submit_rating');
            formData.append('nonce', tripdarAjax.nonce);
            formData.append('slug', strainSlug);
            formData.append('rating', selectedRating);

            fetch(tripdarAjax.ajaxUrl, {
                method: 'POST',
                body: formData,
            })
            .then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.success) {
                    showMessage('Thank you for your rating!', 'success');
                    submitBtn.textContent = 'Submitted';
                    // Update the aggregation display if we have new data
                    if (data.data && data.data.aggregation) {
                        updateAggregationDisplay(container, data.data.aggregation);
                    }
                } else {
                    showMessage(data.data || 'Failed to submit rating', 'error');
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Submit Rating';
                }
            })
            .catch(function(err) {
                showMessage('Network error. Please try again.', 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Rating';
            });
        });

        function showMessage(text, type) {
            if (!messageEl) return;
            messageEl.textContent = text;
            messageEl.className = 'tripdar-reviews__form-message ' + type;
            messageEl.style.display = 'block';
        }

        function updateAggregationDisplay(container, aggregation) {
            var scoreEl = container.querySelector('.tripdar-reviews__score');
            var starsEl = container.querySelector('.tripdar-reviews__stats .tripdar-reviews__stars');
            var countEl = container.querySelector('.tripdar-reviews__count');

            if (scoreEl) {
                scoreEl.textContent = aggregation.averageRating.toFixed(1);
            }
            if (starsEl) {
                starsEl.textContent = renderStars(aggregation.averageRating);
            }
            if (countEl) {
                countEl.textContent = aggregation.totalRatings + ' ratings';
            }

            // Update distribution bars
            var distribution = aggregation.distribution;
            var total = aggregation.totalRatings;
            for (var i = 5; i >= 1; i--) {
                var row = container.querySelector('.tripdar-reviews__bar-row:nth-child(' + (6 - i) + ')');
                if (row) {
                    var fill = row.querySelector('.tripdar-reviews__bar-fill');
                    var count = row.querySelector('.tripdar-reviews__bar-count');
                    var percent = total > 0 ? (distribution[i] / total) * 100 : 0;
                    if (fill) fill.style.width = percent + '%';
                    if (count) count.textContent = distribution[i];
                }
            }
        }

        function renderStars(rating) {
            var full = Math.floor(rating);
            var half = (rating - full) >= 0.5 ? 1 : 0;
            var empty = 5 - full - half;

            var output = '';
            for (var i = 0; i < full; i++) output += '★';
            if (half) output += '½';
            for (var i = 0; i < empty; i++) output += '☆';

            return output;
        }
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initReviewsComponents);
    } else {
        initReviewsComponents();
    }
})();
