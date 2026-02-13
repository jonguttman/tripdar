=== Tripdar Strain Explorer ===
Contributors: tripdar
Tags: mushroom, psilocybin, strain explorer, quiz, storybook
Requires at least: 5.8
Tested up to: 6.4
Stable tag: 1.0.0
Requires PHP: 7.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A mystical storybook-style strain explorer with quiz journey and feedback collection.

== Description ==

Tripdar Strain Explorer brings a mystical, parchment-inspired interface to your WordPress site for exploring psilocybin mushroom strains. Features include:

* **Strain Explorer**: Browse strains with filters for vibe, intensity, and experience level
* **Strain Library**: Simple grid display of available strains
* **Quiz Journey**: Mystical strain finder that recommends strains based on user preferences
* **Feedback System**: Rating slider and optional survey for gathering user experiences
* **Admin Panel**: Manage API settings and select which strains are available at your location

== Installation ==

1. Upload the `tripdar-strain-explorer` folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' menu in WordPress
3. Go to Tripdar > Settings and enter your API key
4. Go to Tripdar > Strain Inventory and select which strains you carry
5. Add shortcodes to your pages

== Shortcodes ==

**[tripdar_explorer]**
Full strain explorer with filters and pagination.

Attributes:
* `per_page` - Number of strains per page (default: 12)
* `show_filters` - Show filter dropdowns (default: "true")

**[tripdar_library]**
Simple strain grid without filters.

Attributes:
* `per_page` - Number of strains to show (default: 20)
* `columns` - Grid columns (default: 4)

**[tripdar_quiz]**
Mystical strain finder quiz.

Attributes:
* `title` - Quiz title (default: "Discover Your Strain")
* `show_alternatives` - Show alternative recommendations (default: "true")

**[tripdar_strain]**
Single strain detail view.

Attributes:
* `slug` - Strain slug (required)
* `show_feedback` - Show feedback widget (default: "true")

== Frequently Asked Questions ==

= How do I get an API key? =

Contact Tripdar to become a partner and receive your API credentials.

= Can I customize the appearance? =

The plugin uses CSS custom properties (variables) that can be overridden in your theme's stylesheet.

= How does the quiz work? =

The quiz asks 2-3 questions about the user's intentions and preferences, then uses a tag-based matching algorithm to recommend strains from your available inventory.

== Changelog ==

= 1.0.0 =
* Initial release
* Strain explorer with filtering
* Quiz journey feature
* Feedback collection system
* Admin settings panel

== Upgrade Notice ==

= 1.0.0 =
Initial release.
