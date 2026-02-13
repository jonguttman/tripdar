/**
 * Tripdar Admin Scripts
 */

(function($) {
    'use strict';

    // Test API Connection
    $('.tripdar-test-connection').on('click', function() {
        var $btn = $(this);
        var $status = $('.tripdar-connection-status');

        $btn.prop('disabled', true).text('Testing...');
        $status.removeClass('success error').addClass('loading').text('Connecting...');

        $.post(tripdarAdmin.ajaxUrl, {
            action: 'tripdar_test_connection',
            nonce: tripdarAdmin.nonce
        })
        .done(function(response) {
            if (response.success) {
                $status.removeClass('loading').addClass('success').text(response.data.message);
            } else {
                $status.removeClass('loading').addClass('error').text(response.data.message);
            }
        })
        .fail(function() {
            $status.removeClass('loading').addClass('error').text('Network error');
        })
        .always(function() {
            $btn.prop('disabled', false).text('Test Connection');
        });
    });

    // Inventory: Select All
    $('.tripdar-select-all').on('click', function() {
        $('.tripdar-inventory__item').addClass('selected');
        $('.tripdar-inventory__item input[type="checkbox"]').prop('checked', true);
        updateInventoryCount();
    });

    // Inventory: Select None
    $('.tripdar-select-none').on('click', function() {
        $('.tripdar-inventory__item').removeClass('selected');
        $('.tripdar-inventory__item input[type="checkbox"]').prop('checked', false);
        updateInventoryCount();
    });

    // Inventory: Toggle item
    $('.tripdar-inventory__item').on('click', function(e) {
        if ($(e.target).is('input')) return; // Let checkbox handle itself

        var $item = $(this);
        var $checkbox = $item.find('input[type="checkbox"]');

        $item.toggleClass('selected');
        $checkbox.prop('checked', $item.hasClass('selected'));
        updateInventoryCount();
    });

    // Update count display
    function updateInventoryCount() {
        var selected = $('.tripdar-inventory__item.selected').length;
        var total = $('.tripdar-inventory__item').length;
        $('.tripdar-inventory__count strong').text(selected);
    }

    // Refresh strains list
    $('.tripdar-refresh-strains').on('click', function() {
        var $btn = $(this);
        var originalHtml = $btn.html();

        $btn.prop('disabled', true).html('<span class="dashicons dashicons-update" style="animation: spin 1s linear infinite;"></span> Refreshing...');

        $.post(tripdarAdmin.ajaxUrl, {
            action: 'tripdar_refresh_strains',
            nonce: tripdarAdmin.nonce
        })
        .done(function(response) {
            if (response.success) {
                location.reload();
            } else {
                alert(response.data.message);
                $btn.prop('disabled', false).html(originalHtml);
            }
        })
        .fail(function() {
            alert('Network error. Please try again.');
            $btn.prop('disabled', false).html(originalHtml);
        });
    });

    // Spin animation
    $('<style>@keyframes spin { to { transform: rotate(360deg); } }</style>').appendTo('head');

})(jQuery);
