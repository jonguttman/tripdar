# Changelog

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
