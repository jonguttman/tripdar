<?php
/**
 * Admin View: Dashboard Widget
 *
 * Quick-glance overview of recommendation engine health.
 * Data loaded via AJAX after page render.
 */

if (!defined('ABSPATH')) exit;
?>

<div class="tripdar-rec-widget" id="tripdar-rec-widget">
    <div class="tripdar-rec-widget-loading">
        <p>Loading recommendation engine data...</p>
    </div>

    <div class="tripdar-rec-widget-content" style="display: none;">
        <div class="tripdar-rec-widget-grid">
            <div class="tripdar-rec-widget-stat">
                <span class="tripdar-rec-widget-number" id="rec-widget-mapped">-</span>
                <span class="tripdar-rec-widget-label">Strains Mapped</span>
                <div class="tripdar-rec-widget-bar">
                    <div class="tripdar-rec-widget-bar-fill" id="rec-widget-mapped-bar" style="width: 0%"></div>
                </div>
            </div>

            <div class="tripdar-rec-widget-stat">
                <span class="tripdar-rec-widget-number" id="rec-widget-recs">-</span>
                <span class="tripdar-rec-widget-label">Recommendations (30d)</span>
            </div>

            <div class="tripdar-rec-widget-stat">
                <span class="tripdar-rec-widget-number" id="rec-widget-feedback-rate">-</span>
                <span class="tripdar-rec-widget-label">Feedback Rate</span>
            </div>
        </div>

        <div class="tripdar-rec-widget-distribution" id="rec-widget-distribution">
            <h4>Match Distribution</h4>
            <div class="tripdar-rec-widget-dist-row">
                <span class="tripdar-rec-widget-dist-emoji">&#127919;</span>
                <span class="tripdar-rec-widget-dist-label">Nailed It</span>
                <span class="tripdar-rec-widget-dist-count" id="rec-widget-nailed">0</span>
            </div>
            <div class="tripdar-rec-widget-dist-row">
                <span class="tripdar-rec-widget-dist-emoji">&#128076;</span>
                <span class="tripdar-rec-widget-dist-label">Pretty Close</span>
                <span class="tripdar-rec-widget-dist-count" id="rec-widget-close">0</span>
            </div>
            <div class="tripdar-rec-widget-dist-row">
                <span class="tripdar-rec-widget-dist-emoji">&#10060;</span>
                <span class="tripdar-rec-widget-dist-label">Missed</span>
                <span class="tripdar-rec-widget-dist-count" id="rec-widget-missed">0</span>
            </div>
        </div>

        <div class="tripdar-rec-widget-alerts" id="rec-widget-alerts" style="display: none;">
            <h4>Alerts</h4>
            <ul id="rec-widget-alert-list"></ul>
        </div>
    </div>

    <div class="tripdar-rec-widget-error" style="display: none;">
        <p>Unable to load data. <a href="<?php echo esc_url(admin_url('admin.php?page=tripdar-settings')); ?>">Check API settings</a>.</p>
    </div>

    <div class="tripdar-rec-widget-footer">
        <a href="<?php echo esc_url(admin_url('admin.php?page=tripdar-rec-strains')); ?>">Manage Strains</a> |
        <a href="<?php echo esc_url(admin_url('admin.php?page=tripdar-rec-settings')); ?>">Settings</a>
    </div>
</div>

<script type="text/javascript">
(function($) {
    $(document).ready(function() {
        $.post(tripdarRecAdmin.ajaxUrl, {
            action: 'tripdar_rec_load_dashboard',
            nonce: tripdarRecAdmin.nonce
        })
        .done(function(response) {
            if (response.success) {
                var d = response.data;
                $('#rec-widget-mapped').text(d.mappedStrains + ' / ' + d.totalStrains);
                $('#rec-widget-mapped-bar').css('width', d.mappedPercentage + '%');
                $('#rec-widget-recs').text(d.recommendations30d);
                $('#rec-widget-feedback-rate').text(d.feedbackRate + '%');
                $('#rec-widget-nailed').text(d.matchDistribution.nailed_it || 0);
                $('#rec-widget-close').text(d.matchDistribution.pretty_close || 0);
                $('#rec-widget-missed').text(d.matchDistribution.missed || 0);

                if (d.alerts && d.alerts.length > 0) {
                    var $list = $('#rec-widget-alert-list');
                    d.alerts.forEach(function(alert) {
                        $list.append('<li>' + $('<span>').text(alert).html() + '</li>');
                    });
                    $('#rec-widget-alerts').show();
                }

                $('.tripdar-rec-widget-loading').hide();
                $('.tripdar-rec-widget-content').show();
            } else {
                $('.tripdar-rec-widget-loading').hide();
                $('.tripdar-rec-widget-error').show();
            }
        })
        .fail(function() {
            $('.tripdar-rec-widget-loading').hide();
            $('.tripdar-rec-widget-error').show();
        });
    });
})(jQuery);
</script>
