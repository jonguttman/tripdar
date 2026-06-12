# Changelog

## [1.11.0] - 2026-06-12

### Added
- **Recipe/flavor product model enforced**: same recipe + multiple flavors = ONE product with `flavors[]`; different recipes = Duplicate. New `src/domain/myco/flavors.ts` normalizes flavor lists server-side (trim, collapse whitespace, case-insensitive dedupe, cap 25) on create and update.
- **Flavor attribution**: optional `TesterVote.flavor` (tester form shows a flavor picker + "Not sure" when the product has flavors; unknown values fall back to recipe-level rather than blocking) and `ProductPhoto.flavor` (per-photo flavor label in admin, validated against the product's flavor list). Tester flavor data is a recipe-smell detector — if one flavor's reports diverge, the same-recipe assumption is wrong and the product should be split. Migration `20260612120000_flavor_attribution`.
- **Customer card flavor display**: "/m/[slug]" result cards now show "Comes in: Mint · Raspberry".
- **Guarded recipe edits**: changing a recipe-defining field (dose/unit, format, strain, ingredients, dose tiers) now resets the strength-offset confirmation server-side, and the admin warns before saving such a change on a product that has tester reports ("if this is a different recipe, Duplicate instead").

### Changed
- **Duplicate = new recipe**: the duplicate route no longer copies flavors (new recipe declares its own), photos (wrong-package shots must not reach customers), offset confirmation (re-confirm against the new recipe), or a `flywheel` vibe source (community validation isn't inheritable — copies as `admin`). Tester votes/outcome reports/recommendation results were already never copied. A fresh duplicate intentionally lands in "Needs attention".

### Fixed
- **Partner isolation on product-scoped admin routes** (BUG-2026-06-12-001): `[id]` PATCH, `[id]/duplicate`, and the photo routes now verify partner ownership via `resolveProductForAdmin()`; photo PATCH/DELETE are scoped to the product in the URL. Previously any authenticated admin could read/modify/delete across partners by product ID.

## [1.10.0] - 2026-06-09

### Added
- **Product readiness model**: `computeReadiness()` (`src/domain/myco/readiness.ts`) defines "recommendation-ready" — photo, brand, mg/unit, units/pack, onset, duration, vibe profile, brand dose guidance, and a *confirmed* strength offset. The same check powers the admin completeness view and hard-gates the customer-facing engine (`src/domain/myco/candidates.ts`), so archived/inactive/incomplete products can never be recommended.
- **Admin catalog completeness view** (`/admin/myco`): per-product ✅ Ready / ⚠️ N missing chips with "Still needed: …" detail, Needs attention / Ready filters, a "X of Y active products recommendation-ready" summary (computed over the full catalog, not a page), and dose-math warnings (`units × mg/unit ≠ total`, outlier per-unit doses).
- **Strength offset confirmation**: offsets now require explicit admin confirmation (`confirmed`/`confirmedAt`/`confirmedBy` on `ProductStrengthOffset`); changing the offset value invalidates a prior confirmation.
- **Product-first recommendation engine** (`src/domain/myco/scoring.ts`): scores catalog products directly via 6-axis cosine similarity against user intent, with format-preference boost and a **strain-specific match highlight** when the product's strain also fits the intent.
- **Deterministic dose curve** (`src/domain/myco/dose.ts`): depth (gentle/noticeable/deep) picks the rung on the brand's own micro/mini/macro dose ladder, experience level caps it (new explorers never start above mini), strength offset shifts guidance with the spec's visible disclaimer. Always a range; fully unit-tested (25 domain tests).
- **Public Myco customer flow** at `/m/[partnerSlug]` (no login): age gate (21+, placeholder copy pending legal review), guided intake (up to 3 intents → experience → depth → format), product cards with photo, key vibes, dose guidance, onset/duration, and a "why this matched" reflection. Kiosk mode (`?kiosk=1`) re-gates age per customer with a 2-minute idle reset. "Everyone is different. Start low and go slow." + not-medical-advice on every screen.
- **Reflections**: LLM-generated "why this matched" copy (Anthropic API, `MYCO_REFLECTION_MODEL` env override) with a deterministic fallback — the flow never blocks on the API.
- **Post-results email capture**: `MycoProfileSignup` model + `/api/myco/signup`. Deliberately *not* a NextAuth account — admin auth is whitelist-gated and grants `partner_admin` by default, so customer accounts need their own role model (post-demo).
- **Community vibe profiles + confidence**: tester votes aggregate into a per-axis community profile (`src/domain/myco/community.ts`) shown beside the admin sliders (👥 values, divergence highlighted), with one-click "Accept community profile" (`source: "flywheel"`). Admin-only confidence badges (No reports / Low / Building / Solid) from report volume + agreement.
- **New models**: `MycoRecommendationResult` (product-first results, strain-keyed `RecommendationResult` untouched for the WP engine), `MycoProfileSignup`. Migration `20260609180000_myco_product_first`.

### Changed
- `/api/admin/myco` GET and `[id]` PATCH responses now include per-product `readiness`, `community`, and `confidence`.
- Canonical 6-axis vibe definitions extracted to `src/domain/myco/vibes.ts` (shared by admin UI, engine, and aggregation).

## [1.9.4] - 2026-06-09

### Fixed
- **Myco partner admin empty state after stale partner selection**: Partner admins are now always resolved to their assigned partner on `/api/admin/myco`, ignoring stale/forged `partnerId` query params that could incorrectly return `partner: null` and show "Create an active partner before configuring Myco products." Product creation now also verifies partner admins can only create products for their assigned partner.

## [1.9.3] - 2026-06-03

### Fixed
- **Large photo uploads silently fail**: Vercel serverless has a 4.5MB request body limit. Phone photos (4-8MB) hit this limit and returned no visible error. Added client-side canvas resize — all photos are downscaled to max 1600px and re-encoded as JPEG at 85% quality before upload. Output is typically 200-600KB regardless of original size.

## [1.9.2] - 2026-06-03

### Fixed
- **Myco photo upload broken on Next.js 16**: Photo uploads (and product PATCH/duplicate) returned HTTP 500 "Failed to upload product photo". Root cause: the Myco dynamic API routes used the old synchronous `params` signature, but Next.js 16 made route `params` a Promise. Accessing `params.id` synchronously yielded `undefined`, so `prisma.findUnique({ where: { id: undefined }})` threw a `PrismaClientValidationError`. Fixed all 4 routes (`[id]/photos`, `[id]/photos/[photoId]`, `[id]`, `[id]/duplicate`) to type `params` as a Promise and `await` it. The blob upload, env vars, and schema were all fine — this was purely the params signature.

## [1.9.1] - 2026-03-19

### Added
- **Strain image URLs in API**: `/api/v1/strains` and `/api/v1/strains/:slug` now include `imageUrl` field with direct blob storage URL for strain photos, enabling WordPress plugin to display strain images
- **Shared image matching utility**: Extracted blob filename matching logic into `src/domain/strain/images.ts` for reuse across endpoints

## [1.9.0] - 2026-02-28

### Added
- **Dose experience descriptions**: Each dose level on the dosing guide card now shows a short, strain-specific poetic description (e.g., "Gentle clarity, quiet warmth" for Golden Teacher's microdose) — 150 hand-curated descriptions across all 25 strains
- **Strain watermark**: Dose card now displays the strain's visualization photo as a subtle watermark behind the dose rows
- **Admin dose descriptions**: 6 text inputs in the strain edit modal for editing dose-level experience descriptions
- **Dosing guide disclaimer**: "For educational use only" disclaimer added to the "For the Journey" wisdom section

### Changed
- `InternalStrain` type now includes optional `doseExperiences?: string[]` field (backward compatible)
- Dose experience descriptions and secondary mg values now render on the same line
- **Homepage**: Replaced placeholder page with elegant "Coming Soon" landing page

## [1.8.2] - 2026-02-28

### Fixed
- **Dose card layout**: Removed gap between "Dosing Guide" label and strain name by positioning compass rose as a background element behind the strain name instead of between them

## [1.8.1] - 2026-02-28

### Fixed
- **Dose card rendering**: Replaced `@vercel/og` image generation (incompatible with Next.js 16, caused "failed to pipe response" 500 errors) with mobile-optimized HTML page

### Changed
- **Dose card redesign**: Sacred scroll aesthetic with compass rose, Cormorant Garamond/Lora typography, parchment textures, gold accent ornamental dividers, staggered fade-in animations, and "For the Journey" wisdom section

## [1.8.0] - 2026-02-27

### Added — "Map Your Journey" Dose Card in Strain Explorer (Strain Explorer v1.6.0, Rec Engine v1.2.0)
- **Strain explorer dose card**: "Map Your Journey" button now appears in the strain detail modal, allowing users to download dose cards from any strain (not just recommendations)
- **Standalone dose cards**: Dosing guide tokens no longer require a recommendation session — works in both the recommendation engine and strain explorer
- **CTA updated**: Button text changed from "Get Your Dose Card" to "Map Your Journey" across both plugins

### Changed
- `DosingGuideToken.sessionId` is now optional (nullable) in Prisma schema — supports dose cards created without a recommendation session
- API `POST /api/v1/dosing-guide/create` no longer requires `sessionToken` — creates standalone dose card when omitted
- Strain explorer localizes dosing guide settings (`dosingGuideEnabled`, `forceQr`) for frontend access

## [1.7.0] - 2026-02-27

### Added — Dosing Guide "To Go" (Recommendation Engine v1.1.0)
- **Dose card image generation**: Server-side rendering via `@vercel/og` (Satori) producing 1080x1920px branded PNG dose cards with retailer logo, strain info, all 6 dose levels with strain-specific sensitivity-adjusted ranges, safety tips, and "powered by tripd.ar" footer
- **Token-based attribution tracking**: `DosingGuideToken` Prisma model links dose card downloads to recommendation sessions for full funnel attribution (session → result → guide → download)
- **API endpoints**: `POST /api/v1/dosing-guide/create` (authenticated) and `GET /api/v1/dosing-guide/[token]` (public download)
- **Dose display**: Grams (rounded to nearest 0.25g) as primary unit for levels above microdose, milligrams in small print; microdose stays in mg only
- **Analytics events**: `dosing_guide_created` and `dosing_guide_downloaded` with device/referrer metadata
- **WordPress admin settings**: Store logo upload (WP Media Library), store name, address, phone, enable/disable toggle, force QR mode for kiosks
- **Frontend UX**: "Map Your Journey" button on each result card; adaptive delivery (QR popover on desktop, direct download on mobile); admin override to force QR on all devices
- **Middleware**: Public GET bypass for dosing guide download URLs (no API key required)

## [1.6.0] - 2026-02-24

### Added
- **tripdar-core v1.0.0**: Shared library plugin with API client, caching, and base styles
- **tripdar-recommendation-engine v1.0.0**: Full dose recommendation engine with:
  - Three-layer scoring model (rule-based + feedback adjustment + admin overrides)
  - 6 Prisma models (RecommendationSession, RecommendationResult, RecommendationFeedback, RecommendationSignal, StrainRecommendationConfig, FeedbackAggregate)
  - Scoring engine: cosine similarity matching, 6-dimension intent vectors, experience level modifiers, canonical 6-level dose scale with strain-specific sensitivity adjustments
  - 9 API endpoints: POST /recommend, GET /recommend/config, POST /recommend/feedback, POST /recommend/feedback/signals, GET /admin/recommend/strains, PUT /admin/recommend/strains/[slug]/config, GET /admin/recommend/strains/[slug]/feedback, GET /admin/recommend/dashboard, GET+PUT /admin/recommend/settings
  - Feedback aggregation module (Layer 2): weighted rating formula, threshold activation, signal processing
  - WordPress admin: per-strain config page (product mapping, dose overrides, intent overrides, caution flags), global settings page, dashboard health widget
  - WordPress frontend: [tripdar_recommendation_engine] shortcode with three input paths (mood tiles, 2D compass, guided quiz), result cards with dose info and product links, caution indicators, stepped path notices, two-tier feedback collection
  - Three themes: parchment (default), dark, minimal
  - Consent gate with configurable text
  - Graceful degradation (works with zero, partial, or full product mapping)

### Changed
- Strain explorer now depends on tripdar-core for shared API client and base styles
- Strain explorer API client refactored to extend core client (Tripdar_Strain_API_Client)

## [1.5.5] - 2026-02-17

### Changed
- Reset all community analytics data (ratings, reviews, trip reports, analytics events) to start fresh after testing period
- Added `scripts/reset-community-data.ts` reusable reset script

## [1.5.4] - 2026-02-17

### Fixed
- Tooltips now render above the strain detail modal (z-index bumped to 10000000 vs modal's 999999)
- Converted last 4 native `title=` attributes to `data-tooltip=` for consistent warm-themed tooltips:
  - Mini-scale bars on cards
  - Body/head balance spectrum marker
  - Similar strains similarity score
  - Dosage curve bars
- Confidence shield tooltip now works inside the detail modal (was blocked by z-index collision)

## [1.5.3] - 2026-02-17

### Changed
- Complete tooltip overhaul: all tooltips now use JS-based system with edge detection so they never get clipped by viewport edges
- Switched from `title` to `data-tooltip` attributes to prevent native browser tooltips (which were showing as black/white)
- Tooltips now use warm parchment theme (dark brown bg, cream text) matching the storybook aesthetic
- Vibe tags: hover shows tooltip, click makes it sticky until you click away
- Confidence shield icon moved from image overlay to superscript position after strain name
- Added emotional character tag tooltips that explain each emotion (e.g. "peaceful" → "A sense of calm and inner stillness")
- Minimum font size raised from 0.65rem/0.7rem to 0.75rem (12px) across all card labels, tags, tooltips, and scale indicators
- Mini-scale label width increased from 80px to 88px to fit "Consistency" at the larger font size

### Fixed
- Tooltips no longer get cut off by page/window edges — JS positions them with viewport boundary detection
- Tooltips now display in dark parchment color instead of black/white
- Vibe tag hover tooltips work in both explorer cards and strain detail modal
- Vibe tag clicks on cards no longer open the strain detail modal
- Emotional character tags now have descriptive tooltips
- Confidence badge no longer floats in strain detail popup — positioned inline as superscript

## [1.5.2] - 2026-02-17

### Changed
- Strain card images tightened from 4:3 to 3:2 aspect ratio to reduce empty space under landscape graphics
- Confidence badges replaced with small shield icons (green for high-confidence, blue for established) with descriptive hover tooltips
- Mini-scale label width increased from 72px to 80px with larger gap to prevent "Consistency" text from bumping into the track bar
- Vibe tooltips now cover all 77 vibes (was only 23) — self-explanatory vibes include suggested activities

### Fixed
- Consistency scale bar no longer visually collides with its label text

## [1.5.1] - 2026-02-17

### Changed
- Tightened spacing across the WordPress plugin to reduce empty space under graphics
- Reduced global spacing variables (md/lg/xl/xxl) for a more compact layout
- Recommendation card images changed from square (1:1) to landscape (3:2) aspect ratio
- Strain detail image reduced from 300px square to 240px at 4:3 aspect ratio
- Reduced detail header gap, body padding, and section margins
- Smaller placeholder icons (60px → 40px) on cards and recommendations
- Reduced post-rating message and trip report form margins

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
