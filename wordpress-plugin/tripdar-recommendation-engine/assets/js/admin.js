(function($) {
    'use strict';

    // =========================================================================
    // Strain Config Page
    // =========================================================================

    // Search filter
    $('#tripdar-rec-strain-search').on('input', function() {
        var query = $(this).val().toLowerCase();
        $('.tripdar-rec-strain-row').each(function() {
            var name = $(this).find('.column-name').text().toLowerCase();
            var show = !query || name.indexOf(query) !== -1;
            $(this).toggle(show);
            // Also hide config row if hidden
            if (!show) {
                $('#config-' + $(this).data('slug')).hide();
            }
        });
    });

    // Availability filter
    $('#tripdar-rec-availability-filter').on('change', function() {
        var filter = $(this).val();
        $('.tripdar-rec-strain-row').each(function() {
            var avail = $(this).data('availability');
            var show = !filter || avail === filter;
            $(this).toggle(show);
            if (!show) {
                $('#config-' + $(this).data('slug')).hide();
            }
        });
    });

    // Toggle config expansion
    $(document).on('click', '.tripdar-rec-edit-btn', function() {
        var slug = $(this).data('slug');
        var $row = $('#config-' + slug);
        $row.toggle();
    });

    // Cancel config
    $(document).on('click', '.tripdar-rec-cancel-btn', function() {
        var slug = $(this).data('slug');
        $('#config-' + slug).hide();
    });

    // Save strain config
    $(document).on('click', '.tripdar-rec-save-btn', function() {
        var $btn = $(this);
        var slug = $btn.data('slug');
        var $form = $('#config-' + slug).find('.tripdar-rec-config-form');
        var $status = $form.find('.tripdar-rec-save-status');

        $btn.prop('disabled', true).text('Saving...');
        $status.text('');

        // Collect intent overrides
        var intentOverrides = {};
        $form.find('[name^="intent_"]').each(function() {
            var tile = $(this).attr('name').replace('intent_', '');
            var val = $(this).val();
            if (val !== 'default') {
                intentOverrides[tile] = val;
            }
        });

        // Collect caution flags
        var cautionCustom = $form.find('[name="cautionCustom"]').val();
        var cautionFlags = {};
        if (cautionCustom) {
            cautionFlags.custom = cautionCustom;
        }

        var data = {
            action: 'tripdar_rec_save_strain_config',
            nonce: tripdarRecAdmin.nonce,
            strain_slug: slug,
            productName: $form.find('[name="productName"]').val(),
            productUrl: $form.find('[name="productUrl"]').val(),
            productUnitMg: $form.find('[name="productUnitMg"]').val(),
            productFormat: $form.find('[name="productFormat"]').val(),
            availability: $form.find('[name="availability"]').val(),
            doseSensitivityOverride: $form.find('[name="doseSensitivityOverride"]').val(),
            intentOverrides: JSON.stringify(intentOverrides),
            cautionFlags: JSON.stringify(cautionFlags)
        };

        $.post(tripdarRecAdmin.ajaxUrl, data)
            .done(function(response) {
                if (response.success) {
                    $status.css('color', '#1a7f37').text('Saved!');
                } else {
                    $status.css('color', '#d63638').text('Error: ' + (response.data.message || 'Save failed'));
                }
            })
            .fail(function() {
                $status.css('color', '#d63638').text('Network error');
            })
            .always(function() {
                $btn.prop('disabled', false).text('Save Config');
                setTimeout(function() { $status.text(''); }, 3000);
            });
    });

    // =========================================================================
    // Settings Page
    // =========================================================================

    $('#tripdar-rec-settings-form').on('submit', function(e) {
        e.preventDefault();

        var $btn = $('#tripdar-rec-save-settings');
        var $status = $('.tripdar-rec-settings-status');

        $btn.prop('disabled', true).text('Saving...');
        $status.text('');

        var data = {
            action: 'tripdar_rec_save_settings',
            nonce: tripdarRecAdmin.nonce,
            feedbackThreshold: $('#feedbackThreshold').val(),
            maxResults: $('#maxResults').val(),
            showMatchPercentage: $('[name="showMatchPercentage"]').is(':checked') ? '1' : '0',
            showSteppedPath: $('[name="showSteppedPath"]').is(':checked') ? '1' : '0',
            enableDeepDive: $('[name="enableDeepDive"]').is(':checked') ? '1' : '0',
            feedbackPromptDelayHours: $('#feedbackPromptDelayHours').val(),
            consentGateText: $('#consentGateText').val(),
            theme: $('#theme').val()
        };

        $.post(tripdarRecAdmin.ajaxUrl, data)
            .done(function(response) {
                if (response.success) {
                    $status.css('color', '#1a7f37').text('Settings saved!');
                } else {
                    $status.css('color', '#d63638').text('Error: ' + (response.data.message || 'Save failed'));
                }
            })
            .fail(function() {
                $status.css('color', '#d63638').text('Network error');
            })
            .always(function() {
                $btn.prop('disabled', false).text('Save Settings');
                setTimeout(function() { $status.text(''); }, 3000);
            });
    });

})(jQuery);
