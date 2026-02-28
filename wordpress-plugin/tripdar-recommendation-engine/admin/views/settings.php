<?php
/**
 * Admin View: Global Recommendation Engine Settings
 *
 * Manages engine-wide settings like feedback thresholds, display options,
 * consent gate text, and theme selection.
 */

if (!defined('ABSPATH')) exit;

// Load current settings from API
$api = new Tripdar_Rec_API_Client();
$response = $api->get_settings();
$settings = [];
if ($response && isset($response['success']) && $response['success']) {
    $settings = $response['data']['settings'] ?? [];
}

// Defaults
$defaults = [
    'feedbackThreshold' => 10,
    'maxResults' => 3,
    'showMatchPercentage' => true,
    'showSteppedPath' => true,
    'consentGateText' => '',
    'feedbackPromptDelayHours' => 48,
    'enableDeepDive' => true,
    'theme' => 'parchment',
];
$settings = array_merge($defaults, $settings);
?>

<div class="wrap tripdar-rec-admin">
    <h1>Recommendation Engine Settings</h1>

    <form id="tripdar-rec-settings-form" class="tripdar-rec-settings-form">
        <table class="form-table">
            <tbody>
                <tr>
                    <th scope="row"><label for="maxResults">Max Results</label></th>
                    <td>
                        <input type="number" id="maxResults" name="maxResults"
                               value="<?php echo esc_attr($settings['maxResults']); ?>"
                               min="1" max="10" class="small-text">
                        <p class="description">Number of strain recommendations to show (1-10). Default: 3</p>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><label for="feedbackThreshold">Feedback Threshold</label></th>
                    <td>
                        <input type="number" id="feedbackThreshold" name="feedbackThreshold"
                               value="<?php echo esc_attr($settings['feedbackThreshold']); ?>"
                               min="1" max="1000" class="small-text">
                        <p class="description">Minimum ratings before feedback modifier activates. Default: 10</p>
                    </td>
                </tr>

                <tr>
                    <th scope="row">Display Options</th>
                    <td>
                        <fieldset>
                            <label>
                                <input type="checkbox" name="showMatchPercentage" value="1"
                                       <?php checked($settings['showMatchPercentage']); ?>>
                                Show match percentage on result cards
                            </label>
                            <br>
                            <label>
                                <input type="checkbox" name="showSteppedPath" value="1"
                                       <?php checked($settings['showSteppedPath']); ?>>
                                Show stepped path notices for inexperienced users
                            </label>
                            <br>
                            <label>
                                <input type="checkbox" name="enableDeepDive" value="1"
                                       <?php checked($settings['enableDeepDive']); ?>>
                                Enable deep dive feedback (Tier 2 signal collection)
                            </label>
                        </fieldset>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><label for="feedbackPromptDelayHours">Feedback Delay</label></th>
                    <td>
                        <input type="number" id="feedbackPromptDelayHours" name="feedbackPromptDelayHours"
                               value="<?php echo esc_attr($settings['feedbackPromptDelayHours']); ?>"
                               min="0" max="168" class="small-text"> hours
                        <p class="description">Hours after recommendation before prompting for feedback. Default: 48</p>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><label for="consentGateText">Consent Gate Text</label></th>
                    <td>
                        <textarea id="consentGateText" name="consentGateText" rows="6"
                                  class="large-text"><?php echo esc_textarea($settings['consentGateText']); ?></textarea>
                        <p class="description">Shown to users before first use. Supports line breaks.</p>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><label for="theme">Theme</label></th>
                    <td>
                        <select id="theme" name="theme">
                            <option value="parchment" <?php selected($settings['theme'], 'parchment'); ?>>Parchment</option>
                            <option value="dark" <?php selected($settings['theme'], 'dark'); ?>>Dark</option>
                            <option value="minimal" <?php selected($settings['theme'], 'minimal'); ?>>Minimal</option>
                        </select>
                        <p class="description">Visual theme for the recommendation engine frontend.</p>
                    </td>
                </tr>
            </tbody>
        </table>

        <h2 class="title">Dosing Guide Settings</h2>
        <table class="form-table">
            <tr>
                <th scope="row">Enable Dosing Guide</th>
                <td>
                    <label>
                        <input type="checkbox" name="dosingGuideEnabled" value="1"
                            <?php checked(get_option('tripdar_rec_dosing_guide_enabled', false)); ?>>
                        Show "Get Your Dose Card" button on result cards
                    </label>
                </td>
            </tr>
            <tr>
                <th scope="row">Store Logo</th>
                <td>
                    <?php $logo_url = get_option('tripdar_rec_store_logo', ''); ?>
                    <div id="tripdar-logo-preview" style="margin-bottom: 10px;">
                        <?php if ($logo_url): ?>
                            <img src="<?php echo esc_url($logo_url); ?>" style="max-width: 200px; max-height: 200px;">
                        <?php endif; ?>
                    </div>
                    <input type="hidden" name="storeLogo" id="tripdar-store-logo" value="<?php echo esc_attr($logo_url); ?>">
                    <button type="button" class="button" id="tripdar-upload-logo">Upload Logo</button>
                    <?php if ($logo_url): ?>
                        <button type="button" class="button" id="tripdar-remove-logo">Remove</button>
                    <?php endif; ?>
                    <p class="description">PNG recommended. This appears at the top of the dose card.</p>
                </td>
            </tr>
            <tr>
                <th scope="row">Store Name</th>
                <td>
                    <input type="text" name="storeName" id="storeName" class="regular-text"
                        value="<?php echo esc_attr(get_option('tripdar_rec_store_name', '')); ?>">
                </td>
            </tr>
            <tr>
                <th scope="row">Store Address</th>
                <td>
                    <textarea name="storeAddress" id="storeAddress" class="large-text" rows="2"><?php echo esc_textarea(get_option('tripdar_rec_store_address', '')); ?></textarea>
                </td>
            </tr>
            <tr>
                <th scope="row">Store Phone</th>
                <td>
                    <input type="text" name="storePhone" id="storePhone" class="regular-text"
                        value="<?php echo esc_attr(get_option('tripdar_rec_store_phone', '')); ?>">
                </td>
            </tr>
            <tr>
                <th scope="row">Always Show QR Code</th>
                <td>
                    <label>
                        <input type="checkbox" name="forceQr" value="1"
                            <?php checked(get_option('tripdar_rec_force_qr', false)); ?>>
                        Show QR code on all devices (useful for in-store kiosks)
                    </label>
                </td>
            </tr>
        </table>

        <h2>Shortcode Reference</h2>
        <table class="form-table">
            <tbody>
                <tr>
                    <th scope="row">Full Engine</th>
                    <td><code>[tripdar_recommendation_engine]</code></td>
                </tr>
                <tr>
                    <th scope="row">With Options</th>
                    <td><code>[tripdar_recommendation_engine theme="dark" show_consent="true"]</code></td>
                </tr>
            </tbody>
        </table>

        <p class="submit">
            <button type="submit" class="button button-primary" id="tripdar-rec-save-settings">Save Settings</button>
            <span class="tripdar-rec-settings-status"></span>
        </p>
    </form>
</div>
