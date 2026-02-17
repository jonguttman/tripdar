# Changelog

## [1.5.0] - 2026-02-17

### Changed
- Renamed all user-facing "Trip Report" / "Trip Reports" text to "TripTale" / "TripTales" throughout the WordPress plugin

### Fixed
- **"B+" strain now displays correctly** instead of showing as "b plus" in recommendations and post-rating views. Root cause: `getStrainBySlug()` only matched by name-derived slug (B+ → "b"), not by ID ("b-plus"), so the strain wasn't found and fell back to raw slug display
- Feedback widget now uses actual strain name from API data attribute instead of slug-to-name conversion
- Admin strain editor image section simplified - shows "browse files" link when image exists, label clarifies image is optional

## [1.4.8] - 2026-02-17

### Fixed
- **Trip report submission now works!** Root cause: Edge middleware whitelist (`postAllowedPaths`) did not include `/api/v1/reports`, so POST requests were blocked with "Only GET requests are allowed on this endpoint"
- Reverted unnecessary `redirection => 0` workaround in API client

## [1.4.3] - 2026-02-16

### Fixed
- Recommendation cards now display strain images by fetching visualization URLs from API
- Added fallback to fetch visualizations separately if not included in similar strains response

## [1.4.2] - 2026-02-16

### Fixed
- **Trip report submission now works!** Fixed API endpoint from `/reports` to `/strains/{slug}/reports` to match API routing
- Trip reports can now be successfully submitted after rating a strain

## [1.4.1] - 2026-02-16

### Fixed
- Added comprehensive console logging throughout trip report submission flow for debugging
- Fixed unhandled promise rejection when showing post-rating view
- Added localStorage availability checks to prevent "Not implemented on this platform" errors
- Added defensive checks for DOM element queries to prevent silent failures
- Improved error handling for async operations in feedback widget

## [1.4.0] - 2026-02-16

### Added
- **Progressive engagement system**: Users can now only rate each strain once (tracked via localStorage)
- **Trip report prompts**: After rating a strain, users are prompted to submit a detailed trip report with dose, setting, and experience details
- **Personalized recommendations**: Post-rating view displays 3 similar strains with vibe-based explanations highlighting shared characteristics and unique differences
- **Vibe tag tooltips**: Hover over any vibe tag to see a clear description of what that vibe means (e.g., "reflective" → "Promotes introspection and self-examination")
- **Return visit value**: Users who return to a previously-rated strain see the trip report form and recommendations immediately
- New AJAX endpoint `tripdar_get_similar` for fetching similar strains with explanation data
- Trip report submission directly from feedback widget (no need to navigate to separate form)

### Changed
- Feedback widget now shows different UI based on whether user has already rated the strain
- Rating widget only displays once per strain per user (localStorage-based tracking)
- Post-rating experience now focuses on data collection (trip reports) and discovery (recommendations)
- Similar strains now include explanation text comparing shared vibes and highlighting unique characteristics

### Technical
- WordPress plugin version bumped to 1.4.0
- Added `get_similar_strains()` method to API client
- Added `handle_get_similar_strains()` AJAX handler to main plugin class
- Enhanced feedback.js with localStorage management, post-rating views, and recommendation rendering
- Added `get_vibe_descriptions()` method to shortcodes class for tooltip content
- New CSS styles for post-rating view, trip report form, recommendation cards, and vibe tooltips

## [1.3.9] - 2026-02-16

### Added
- New admin Ratings page (/admin/ratings) showing rating statistics by strain with count, average stars, and latest rating time
- Ratings link added to admin navigation sidebar with award icon

### Fixed
- Feedback rating submission now correctly normalizes 1-5 slider values to 0-1 scale expected by API (1→0.0, 5→1.0)
- Analytics "Total Views" now correctly counts both page_view and strain_view events from partner sites
- Feedback ratings now persist to database instead of memory-only storage, appearing correctly in admin reviews and analytics
- Analytics "Total Ratings" now updates correctly by recording "rating" event type instead of "strain_view"

## [1.3.8] - 2026-02-16

### Fixed
- Analytics event tracking now works correctly - edge middleware was blocking POST requests to `/api/v1/events` endpoint, causing 405 Method Not Allowed errors
- Feedback rating button now works in strain detail modal - TripdarFeedback class is now globally accessible for dynamic modal initialization

## [1.3.7] - 2026-02-16

### Fixed
- Confidence badges now display correctly using existing strain data instead of calling non-existent API endpoint
- Only show "Established" and "High Confidence" badges (hide "Emerging" and "Developing")

## [1.3.6] - 2026-02-16

### Changed
- Confidence badges now only display when confidence score is 65% or higher (hides "emerging" and low "developing" badges)

## [1.3.5] - 2026-02-16

### Fixed
- Vibe filter now counts vibes across all 25 strains instead of just the first page (12 strains), correctly showing 7-9 popular vibes instead of 4

## [1.3.4] - 2026-02-16

### Added
- Clear Cache button in WordPress plugin settings to manually clear cached API responses

## [1.3.3] - 2026-02-15

### Changed
- Vibe filter dropdown now dynamically generates options from actual strain data, showing vibes that appear in 3+ strains (8-9 focused options instead of 5 hardcoded)

## [1.3.2] - 2026-02-15

### Changed
- Vibe filter dropdown now dynamically generates options from actual strain data, showing vibes that appear in 2+ strains (~20 options instead of 5 hardcoded) [SUPERSEDED by 1.3.3]
- Updated strain data.ts with 19 field corrections across 14 strains to match authoritative research values (emotional character refinements, body/head balance arrows, onset time corrections)

## [1.3.1] - 2026-02-15

### Fixed
- Strain detail API endpoint now reads from admin-managed blob storage instead of hardcoded fallback data
- Added "Head-dominant" as a valid body/head balance option across the full type chain (admin dropdown, API types, public view mapping, WordPress renderer)
- Updated all 25 hardcoded fallback strain values to match admin-curated authoritative data (body/head balance, vibes, descriptions, emotional characters, stability, visual intensity, come-up intensity, peak character)
- Body/Head balance spectrum in WordPress plugin now correctly positions "Head-dominant" marker

### Changed
- Detail endpoint (`/api/v1/strains/[slug]`) uses `loadStrainData()` from blob-store instead of `getStrainBySlug()` from hardcoded data, making admin page the single source of truth

## [1.3.0] - 2026-02-15

### Added
- Dose sensitivity tag on strain cards (color-coded: gentle/moderate/steep)
- Mini visual scale bars on cards for Visual Intensity and Trip Consistency at-a-glance comparison
- "View Lineage" indicator link on cards for strains with lineage data
- Tabbed detail modal with Overview, Experience Profile, and Lineage tabs
- Experience Profile tab: onset time, duration, come-up intensity, peak character, body/head balance spectrum, emotional character tags
- Lineage tab: generation badge, clickable parent strain tags that open that strain's modal, lineage notes
- Balance spectrum component (Body <-> Head visual slider)
- Expanded `normalize_strain()` to pass through doseSensitivity, experienceProfile, and lineage from API
- Dose Sensitivity scale bar in Overview tab
- Graceful empty states for strains without experience or lineage data

### Changed
- Strain cards now show mini-scales instead of text excerpt for better at-a-glance comparison
- Detail modal restructured from single-page to tabbed layout
- Version bumped to 1.3.0

## [1.2.0] - 2026-02-14

### Added
- Compare strains tool shortcode
- Recommendations shortcode
- Similar strains widget
- Dosage curve visualization
- Full lineage tree shortcode
- Confidence badges on strain cards and details
- "I've tried this" button with localStorage persistence
- Analytics event tracking (strain_view, strain_tried)

## [1.1.0] - 2026-02-13

### Added
- Star ratings and reviews system
- Trip report submission form and display
- Search with autocomplete
- Collection and curated collection display
- Lineage shortcode with family tree rendering

## [1.0.0] - 2026-02-12

### Added
- Initial release
- Strain explorer with filters and pagination
- Strain library grid
- Strain finder quiz with mystical theme
- Single strain detail view with feedback widget
- Storybook-themed CSS with parchment palette
