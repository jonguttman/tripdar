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
