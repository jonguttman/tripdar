/**
 * Tripdar Trip Report Form
 *
 * Handles trip report form submission.
 */

(function() {
    'use strict';

    // Initialize all report forms on the page
    function initReportForms() {
        document.querySelectorAll('.tripdar-report-form').forEach(initReportForm);
    }

    function initReportForm(container) {
        var strainSlug = container.dataset.strainSlug;
        var form = container.querySelector('.tripdar-report-form__form');
        var submitBtn = container.querySelector('.tripdar-report-form__submit');
        var messageEl = container.querySelector('.tripdar-report-form__message');
        var bodyTextarea = container.querySelector('textarea[name="body"]');
        var charCount = container.querySelector('.tripdar-report-form__charcount');

        if (!form || !submitBtn) return;

        // Character count for body
        if (bodyTextarea && charCount) {
            bodyTextarea.addEventListener('input', function() {
                var len = this.value.length;
                charCount.textContent = len + ' / 50 minimum';
                if (len >= 50) {
                    charCount.style.color = '#4d7c5a';
                } else {
                    charCount.style.color = '';
                }
            });
        }

        // Form submission
        form.addEventListener('submit', function(e) {
            e.preventDefault();

            var formData = new FormData(form);
            var data = {
                strainSlug: strainSlug,
                doseCategory: formData.get('doseCategory'),
                doseAmount: formData.get('doseAmount'),
                setting: formData.get('setting'),
                title: formData.get('title'),
                body: formData.get('body'),
            };

            // Optional fields
            var duration = formData.get('duration');
            if (duration) data.duration = duration;

            var peakIntensity = formData.get('peakIntensity');
            if (peakIntensity) data.peakIntensity = parseInt(peakIntensity, 10);

            var intention = formData.get('intention');
            if (intention) data.intention = intention;

            // Validate required fields
            if (!data.doseCategory || !data.doseAmount || !data.setting || !data.title || !data.body) {
                showMessage('Please fill in all required fields.', 'error');
                return;
            }

            if (data.body.length < 50) {
                showMessage('Your experience must be at least 50 characters.', 'error');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';

            // Use WordPress AJAX
            var ajaxData = new FormData();
            ajaxData.append('action', 'tripdar_submit_report');
            ajaxData.append('nonce', tripdarReports.nonce);
            ajaxData.append('data', JSON.stringify(data));

            fetch(tripdarReports.ajaxUrl, {
                method: 'POST',
                body: ajaxData,
            })
            .then(function(response) { return response.json(); })
            .then(function(result) {
                if (result.success) {
                    showMessage('Thank you! Your trip report has been submitted and is pending review.', 'success');
                    form.reset();
                    if (charCount) charCount.textContent = '0 / 50 minimum';
                    submitBtn.textContent = 'Submitted';
                } else {
                    showMessage(result.data || 'Failed to submit report. Please try again.', 'error');
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Submit Trip Report';
                }
            })
            .catch(function(err) {
                showMessage('Network error. Please try again.', 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Trip Report';
            });
        });

        function showMessage(text, type) {
            if (!messageEl) return;
            messageEl.textContent = text;
            messageEl.className = 'tripdar-report-form__message ' + type;
            messageEl.style.display = 'block';
        }
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initReportForms);
    } else {
        initReportForms();
    }
})();
