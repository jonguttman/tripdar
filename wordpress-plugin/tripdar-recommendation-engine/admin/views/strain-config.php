<?php
/**
 * Admin View: Per-Strain Recommendation Config
 *
 * Lists all strains with their recommendation profiles, product mappings,
 * and feedback data. Expandable rows for editing config per strain.
 */

if (!defined('ABSPATH')) exit;
?>

<div class="wrap tripdar-rec-admin">
    <h1>Recommendation Engine - Strain Configuration</h1>

    <p class="description">Configure product mapping, dose overrides, and intent matching for each strain. Strains without product mapping will show mg ranges instead of product units.</p>

    <div class="card" style="max-width: 600px; margin: 15px 0;">
        <h3 style="margin-top: 0;">Shortcode</h3>
        <p>Add the recommendation engine to any page or post:</p>
        <p><code>[tripdar_recommendation_engine]</code></p>
        <p class="description" style="margin-bottom: 0;">
            Optional attributes: <code>theme="parchment|dark|minimal"</code> &nbsp; <code>show_consent="yes|no"</code>
        </p>
    </div>

    <?php if (empty($strains)): ?>
        <div class="notice notice-warning">
            <p>No strains loaded. Check your API connection in <a href="<?php echo esc_url(admin_url('admin.php?page=tripdar-settings')); ?>">Tripdar Settings</a>.</p>
        </div>
    <?php else: ?>

    <div class="tripdar-rec-strains-filter">
        <input type="text" id="tripdar-rec-strain-search" placeholder="Search strains..." class="regular-text">
        <select id="tripdar-rec-availability-filter">
            <option value="">All Availability</option>
            <option value="in_stock">In Stock</option>
            <option value="out_of_stock">Out of Stock</option>
            <option value="seasonal">Seasonal</option>
        </select>
        <span class="tripdar-rec-count"><?php echo count($strains); ?> strains</span>
    </div>

    <table class="wp-list-table widefat fixed striped tripdar-rec-strains-table">
        <thead>
            <tr>
                <th class="column-name">Strain</th>
                <th class="column-profile">Profile</th>
                <th class="column-product">Product</th>
                <th class="column-availability">Status</th>
                <th class="column-feedback">Feedback</th>
                <th class="column-actions">Actions</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($strains as $strain): ?>
            <tr class="tripdar-rec-strain-row" data-slug="<?php echo esc_attr($strain['strainSlug']); ?>" data-availability="<?php echo esc_attr($strain['config']['availability'] ?? 'in_stock'); ?>">
                <td class="column-name">
                    <strong><?php echo esc_html($strain['strainName']); ?></strong>
                    <br><code><?php echo esc_html($strain['strainSlug']); ?></code>
                </td>
                <td class="column-profile">
                    <span class="tripdar-rec-tag tripdar-rec-tag--potency"><?php echo esc_html($strain['profile']['potencyTier'] ?? 'N/A'); ?></span>
                    <span class="tripdar-rec-tag tripdar-rec-tag--sensitivity"><?php echo esc_html($strain['profile']['doseSensitivity'] ?? 'N/A'); ?></span>
                    <span class="tripdar-rec-tag tripdar-rec-tag--beginner"><?php echo esc_html($strain['profile']['beginnerFriendly'] ?? 'N/A'); ?></span>
                </td>
                <td class="column-product">
                    <?php if (!empty($strain['config']['productName'])): ?>
                        <span class="tripdar-rec-mapped"><?php echo esc_html($strain['config']['productName']); ?></span>
                        <?php if (!empty($strain['config']['productUnitMg'])): ?>
                            <br><small><?php echo esc_html($strain['config']['productUnitMg']); ?>mg / <?php echo esc_html($strain['config']['productFormat'] ?? 'unit'); ?></small>
                        <?php endif; ?>
                    <?php else: ?>
                        <span class="tripdar-rec-unmapped">Not mapped</span>
                    <?php endif; ?>
                </td>
                <td class="column-availability">
                    <?php
                    $avail = $strain['config']['availability'] ?? 'in_stock';
                    $avail_class = 'tripdar-rec-avail--' . str_replace('_', '-', $avail);
                    $avail_labels = ['in_stock' => 'In Stock', 'out_of_stock' => 'Out of Stock', 'seasonal' => 'Seasonal'];
                    ?>
                    <span class="tripdar-rec-avail <?php echo esc_attr($avail_class); ?>"><?php echo esc_html($avail_labels[$avail] ?? $avail); ?></span>
                </td>
                <td class="column-feedback">
                    <?php
                    $aggs = $strain['feedback']['aggregates'] ?? [];
                    $total = 0;
                    foreach ($aggs as $agg) {
                        $total += $agg['totalRatings'] ?? 0;
                    }
                    ?>
                    <?php if ($total > 0): ?>
                        <span class="tripdar-rec-feedback-count"><?php echo esc_html($total); ?> ratings</span>
                    <?php else: ?>
                        <span class="tripdar-rec-no-feedback">No feedback</span>
                    <?php endif; ?>
                </td>
                <td class="column-actions">
                    <button type="button" class="button tripdar-rec-edit-btn" data-slug="<?php echo esc_attr($strain['strainSlug']); ?>">Configure</button>
                </td>
            </tr>
            <tr class="tripdar-rec-config-row" id="config-<?php echo esc_attr($strain['strainSlug']); ?>" style="display: none;">
                <td colspan="6">
                    <div class="tripdar-rec-config-form">
                        <h3>Configure: <?php echo esc_html($strain['strainName']); ?></h3>

                        <div class="tripdar-rec-config-grid">
                            <fieldset class="tripdar-rec-fieldset">
                                <legend>Product Mapping</legend>
                                <p>
                                    <label>Product Name</label>
                                    <input type="text" name="productName" value="<?php echo esc_attr($strain['config']['productName'] ?? ''); ?>" class="regular-text">
                                </p>
                                <p>
                                    <label>Product URL</label>
                                    <input type="url" name="productUrl" value="<?php echo esc_attr($strain['config']['productUrl'] ?? ''); ?>" class="regular-text">
                                </p>
                                <p>
                                    <label>Unit Size (mg)</label>
                                    <input type="number" name="productUnitMg" value="<?php echo esc_attr($strain['config']['productUnitMg'] ?? ''); ?>" min="0" step="1">
                                </p>
                                <p>
                                    <label>Format</label>
                                    <select name="productFormat">
                                        <option value="capsule" <?php selected($strain['config']['productFormat'] ?? '', 'capsule'); ?>>Capsule</option>
                                        <option value="chocolate" <?php selected($strain['config']['productFormat'] ?? '', 'chocolate'); ?>>Chocolate</option>
                                        <option value="gummy" <?php selected($strain['config']['productFormat'] ?? '', 'gummy'); ?>>Gummy</option>
                                        <option value="dried" <?php selected($strain['config']['productFormat'] ?? '', 'dried'); ?>>Dried</option>
                                    </select>
                                </p>
                            </fieldset>

                            <fieldset class="tripdar-rec-fieldset">
                                <legend>Availability & Overrides</legend>
                                <p>
                                    <label>Availability</label>
                                    <select name="availability">
                                        <option value="in_stock" <?php selected($avail, 'in_stock'); ?>>In Stock</option>
                                        <option value="out_of_stock" <?php selected($avail, 'out_of_stock'); ?>>Out of Stock</option>
                                        <option value="seasonal" <?php selected($avail, 'seasonal'); ?>>Seasonal</option>
                                    </select>
                                </p>
                                <p>
                                    <label>Dose Sensitivity Override</label>
                                    <select name="doseSensitivityOverride">
                                        <option value="" <?php selected($strain['config']['doseSensitivityOverride'] ?? '', ''); ?>>Use Algorithm Default</option>
                                        <option value="gentle" <?php selected($strain['config']['doseSensitivityOverride'] ?? '', 'gentle'); ?>>Gentle (1.0x)</option>
                                        <option value="medium" <?php selected($strain['config']['doseSensitivityOverride'] ?? '', 'medium'); ?>>Medium (0.85x)</option>
                                        <option value="steep" <?php selected($strain['config']['doseSensitivityOverride'] ?? '', 'steep'); ?>>Steep (0.7x)</option>
                                        <option value="very_steep" <?php selected($strain['config']['doseSensitivityOverride'] ?? '', 'very_steep'); ?>>Very Steep (0.55x)</option>
                                    </select>
                                </p>
                                <p>
                                    <label>Custom Caution Note</label>
                                    <textarea name="cautionCustom" rows="2" class="large-text"><?php
                                        $caution = $strain['config']['cautionFlags'] ?? null;
                                        echo esc_textarea(is_array($caution) ? ($caution['custom'] ?? '') : '');
                                    ?></textarea>
                                </p>
                            </fieldset>

                            <fieldset class="tripdar-rec-fieldset">
                                <legend>Intent Overrides</legend>
                                <p class="description">Boost or suppress this strain for specific mood categories.</p>
                                <?php
                                $mood_tiles = ['calm_centered', 'social_giggly', 'creative_flow', 'deep_insight', 'visual_journey', 'energized_uplifted', 'body_warmth', 'full_reset'];
                                $tile_labels = [
                                    'calm_centered' => 'Calm & Centered',
                                    'social_giggly' => 'Social & Giggly',
                                    'creative_flow' => 'Creative Flow',
                                    'deep_insight' => 'Deep Insight',
                                    'visual_journey' => 'Visual Journey',
                                    'energized_uplifted' => 'Energized & Uplifted',
                                    'body_warmth' => 'Body Warmth',
                                    'full_reset' => 'Full Reset',
                                ];
                                $overrides = $strain['config']['intentOverrides'] ?? [];
                                foreach ($mood_tiles as $tile):
                                    $current = isset($overrides[$tile]) ? $overrides[$tile] : 'default';
                                ?>
                                <p class="tripdar-rec-intent-row">
                                    <label><?php echo esc_html($tile_labels[$tile]); ?></label>
                                    <select name="intent_<?php echo esc_attr($tile); ?>">
                                        <option value="default" <?php selected($current, 'default'); ?>>Default</option>
                                        <option value="boost" <?php selected($current, 'boost'); ?>>Boost (+10)</option>
                                        <option value="suppress" <?php selected($current, 'suppress'); ?>>Suppress (-20)</option>
                                        <option value="pin" <?php selected($current, 'pin'); ?>>Pin (always top)</option>
                                    </select>
                                </p>
                                <?php endforeach; ?>
                            </fieldset>

                            <fieldset class="tripdar-rec-fieldset">
                                <legend>Feedback Summary</legend>
                                <div class="tripdar-rec-feedback-detail" data-slug="<?php echo esc_attr($strain['strainSlug']); ?>">
                                    <?php if (empty($aggs)): ?>
                                        <p class="description">No feedback data yet.</p>
                                    <?php else: ?>
                                        <?php foreach ($aggs as $agg): ?>
                                        <div class="tripdar-rec-feedback-agg">
                                            <strong><?php echo esc_html($agg['intentCategory']); ?></strong>:
                                            <?php echo esc_html($agg['totalRatings']); ?> ratings
                                            (<?php echo esc_html($agg['nailedIt']); ?> nailed /
                                            <?php echo esc_html($agg['prettyClose']); ?> close /
                                            <?php echo esc_html($agg['missed']); ?> missed)
                                            — Modifier: <strong><?php echo esc_html(number_format($agg['feedbackMod'], 1)); ?></strong>
                                        </div>
                                        <?php endforeach; ?>
                                    <?php endif; ?>
                                </div>
                            </fieldset>
                        </div>

                        <p class="tripdar-rec-config-actions">
                            <button type="button" class="button button-primary tripdar-rec-save-btn" data-slug="<?php echo esc_attr($strain['strainSlug']); ?>">Save Config</button>
                            <button type="button" class="button tripdar-rec-cancel-btn" data-slug="<?php echo esc_attr($strain['strainSlug']); ?>">Cancel</button>
                            <span class="tripdar-rec-save-status"></span>
                        </p>
                    </div>
                </td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <?php endif; ?>
</div>
