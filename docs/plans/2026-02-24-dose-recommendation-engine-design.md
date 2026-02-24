# Tripdar Recommendation Engine - Design Document

**Date:** 2026-02-24
**Status:** Approved
**Plugin Name:** `tripdar-recommendation-engine`
**Version Target:** 1.0.0

---

## What This Is (Plain English)

The Tripdar Recommendation Engine is a new WordPress plugin that asks people what kind of experience they're looking for and recommends a dose level and strain to match. Shops can map their actual products to strains so the recommendation says "take 3-4 capsules of [Product Name]" instead of just a milligram range. If the shop hasn't mapped products yet, the engine still works - it just shows strain names and dose ranges without product links.

**The engine never makes medical claims.** Every piece of output uses community-consensus language: "often described as," "many users say," "community experience suggests." A one-time acknowledgment gate confirms the user understands this before they see any recommendations.

**The engine protects newcomers without patronizing them.** Experience level is a soft weight - beginners see all strains but beginner-friendly ones score higher, and caution indicators are clearly visible on intense strains. When someone's desired experience doesn't match their experience level, the engine offers a stepped path: "experienced users explore this at Level 5, but starting at Level 3 with Golden Teacher lets you build familiarity first."

---

## What Matters for the Business Owner

### Things you control:
- **Product mapping per strain** - connect your inventory so recommendations link to actual products
- **Override any recommendation** - boost, suppress, or pin strains for specific intents
- **Override dose sensitivity** - if your product testing disagrees with community data
- **Add caution flags** - custom warnings on any strain
- **Set availability** - mark strains in/out of stock or seasonal
- **See what's working** - dashboard shows recommendation volume, feedback rates, and match quality per strain

### Things that happen automatically:
- The engine scores strains against user intent using data from the strain guide
- Customer feedback ("Nailed it" / "Pretty close" / "Off") gradually improves recommendations
- Deeper optional feedback from customers feeds the broader Tripdar signal model
- Your overrides always take priority over the algorithm

### Things to watch for:
- Strains with consistently negative feedback trends (the dashboard flags these)
- Unmapped strains that could be driving revenue if connected to products
- Feedback rate below 20% may mean the prompt timing needs adjustment

---

## Architecture

### Three-Plugin Structure

```
WordPress Site
├── tripdar-core (shared library)
│   ├── API client (HTTPS to tripd.ar with bearer token auth)
│   ├── WP transient caching layer
│   └── Base styles (parchment theme CSS)
│
├── tripdar-strain-explorer (existing, refactored to use core)
│   └── Strain browsing, quiz, ratings, reviews, TripTales
│
└── tripdar-recommendation-engine (NEW)
    ├── Frontend: entry screen, three input paths, results display, feedback
    ├── Admin: per-strain config meta box, global settings, dashboard widget
    └── Shortcode: [tripdar_recommendation_engine]
```

### Server-Side Architecture

All recommendation logic lives on the tripd.ar server (Next.js API routes + PostgreSQL). The WordPress plugin is a thin presentation layer that calls API endpoints.

```
tripd.ar Server
├── /api/v1/strains (existing)
├── /api/v1/recommend (NEW - public)
│   ├── POST /recommend - get recommendations
│   └── GET /recommend/config - get UI configuration
├── /api/v1/feedback (NEW - public)
│   ├── POST /feedback - quick match rating
│   └── POST /feedback/signals - deep dive dimensions
└── /api/v1/admin/recommend (NEW - authenticated)
    ├── GET /admin/recommend/strains - all strain configs
    ├── PUT /admin/recommend/strains/:slug/config - update strain config
    ├── GET /admin/recommend/strains/:slug/feedback - strain feedback data
    ├── GET /admin/recommend/dashboard - global health metrics
    └── PUT /admin/recommend/settings - global settings
```

---

## Scoring Model: Three Layers

The recommendation engine computes a match score for every strain in the shop's inventory against the user's stated intent. The score comes from three stacked layers.

### Layer 1: Rule-Based Core (works from day one)

User input gets normalized into an **intent vector** - a set of weighted values across descriptor clusters derived from the Tripdar Strain Experience Guide:

```
Intent Vector Example: "I want to feel relaxed and introspective"
{
  clarity_cognition: 0.6,
  mood_social: 0.3,
  visual_pattern: 0.0,
  somatic: 0.4,
  energy_direction: -0.7,     // calm end of Calm↔Energetic axis
  depth_direction: 0.5        // dreamy end of Clear↔Dreamy axis
}
```

Each strain has a pre-computed **strain profile vector** built from:

| Attribute | Source |
|---|---|
| Potency tier | Strain Experience Guide PDF |
| Dose sensitivity curve (Gentle/Medium/Steep/Very Steep) | Strain Experience Guide PDF |
| Descriptor keywords | Strain Experience Guide PDF (bolded terms) |
| Effect compass position (Calm↔Energetic, Clear↔Dreamy) | Strain Experience Guide PDF |
| Experience stability | Strain Experience Guide PDF |
| Beginner friendliness | Strain Experience Guide PDF |
| 28 experiential dimensions | Existing Tripdar signal model |

**Match score** = cosine similarity between intent vector and strain profile vector, weighted by:
- Experience level modifier (beginner-friendly strains score higher for less experienced users)
- Dose feasibility (can this strain deliver the desired experience at an appropriate dose level?)

### Layer 2: Feedback Adjustment (activates after threshold)

- Quick match ratings shift scores: "Nailed it" = +5%, "Pretty close" = +0%, "Missed" = -10%
- Scores decay over time so recent feedback matters more
- Signal-compatible deep feedback refines strain descriptor accuracy
- **Activation threshold:** feedback modifier only applies after a configurable minimum number of ratings per intent-strain pair (default: 10)
- Pre-computed in `FeedbackAggregate` table, updated on each submission

### Layer 3: Admin Override (always has final say)

Per strain, per intent, the admin can:
- **Boost** - increase match score
- **Suppress** - decrease match score or hide entirely
- **Pin** - always show as top recommendation for an intent
- **Add caution flag** - custom warning text displayed with result
- **Override dose sensitivity** - replace algorithm's default curve
- **Set availability** - in stock / out of stock / seasonal

```
Final Score = (Base Rule Score x Feedback Modifier) + Admin Override
```

### Dose Calculation

Once a strain is matched, the engine maps desired intensity to the canonical 6-level dose scale, then adjusts by strain-specific dose sensitivity:

**Canonical Dose Levels (Standard Cubensis - from Psilly Co. Experience Guide):**

| Level | Name | Grams | Milligrams | Key Descriptors |
|-------|------|-------|------------|-----------------|
| 1 | Microdose | 0.05-0.25g | 50-250mg | Mood enhancement, crisp concentration, increased mental stamina |
| 2 | Mini-dose | 0.25-0.75g | 250-750mg | Feeling stoned, mild euphoria, visual enhancements, short term memory anomalies, altered sound perception |
| 3 | Macro Dose | 0.5-2.0g | 500-2000mg | Colors more vivid, closed & open eye visuals, distracted thought pattern, enhanced creativity |
| 4 | Museum Dose | 1.5-3.5g | 1500-3500mg | Warped & kaleidoscopic visuals, mild hallucinations, 3D closed eye visuals, minor synesthesia, distorted sense of time |
| 5 | Megadose | 3.5-5.0g | 3500-5000mg | Heavy hallucinations, ego dissolution, mild disconnect from reality, complete loss of time, synesthesia, out of body experiences |
| 6 | Heroic Dose | 5.0g+ | 5000mg+ | Complete altering of senses, ego death, complete disconnect from reality |

**Strain Sensitivity Modifiers:**

| Curve | Modifier | Effect |
|---|---|---|
| Gentle | 1.0x | Use standard ranges |
| Medium | 0.85x | Slightly less needed |
| Steep | 0.7x | Significantly less needed |
| Very Steep | 0.55x | Much less needed |

Example: Level 3 Macro Dose (500-2000mg) for APE (Very Steep) = ~275-1100mg.

When a product is mapped with a per-unit mg value, the engine converts the adjusted range into unit counts: "3-6 capsules of [Product Name] (250mg each)."

---

## User-Facing Experience

### Entry Screen

Three entry points displayed simultaneously. Experience level is asked upfront and persists across all paths.

**Path A: "I Know What I Want" (Mood Tiles)**
User taps 1-3 tiles from: Calm & Centered, Social & Giggly, Creative Flow, Deep Insight, Visual Journey, Energized & Uplifted, Body Warmth, Full Reset. Each tile maps to a pre-defined intent vector. Multiple selections blend the vectors.

**Path B: "Let Me Explore" (Sliders)**
Two-axis compass (Calm↔Energetic, Clear↔Dreamy) plus an intensity slider (Light / Moderate / Deep). Position and intensity generate the intent vector directly.

**Path C: "Guide Me" (Quiz)**
Stepped questions one at a time:
1. "What's the occasion?" (Solo reflection / Social gathering / Creative work / Nature outing / Ceremony & healing / Just curious)
2. "What matters most to you?" (Clarity of mind / Emotional openness / Visual beauty / Physical relaxation / Sense of meaning / Fun & laughter)
3. "How would you describe your comfort level with intensity?" (Keep it gentle / Open to moderate / Want to go deep / Surprise me)
4. (If experienced) "Any strains you've enjoyed before?" (Optional multi-select from shop's mapped strains)

**Transition:** When user clicks a path, the other two fade out and the selected path's follow-up content animates in.

### Recommendation Output

All three paths converge to the same output format:
- **Best Match** card: strain name, dose level name, strain-adjusted mg range (or product unit count if mapped), community description in consensus voice, Tripdar tags (Stability, Dose Sensitivity, Beginner Friendliness), match percentage, product link (if mapped)
- **Also Fits** cards (2 additional): condensed format
- **Stepped Path Notice** (when applicable): validates user's aspirational goal, suggests responsible starting point
- **Caution Indicators** (when applicable): inline warnings for steep sensitivity, variable stability, or custom admin flags

### Consent Gate (One-Time)

Shown before first interaction:

> "Welcome to the Tripdar Recommendation Engine.
>
> Everything here is based on community-reported experiences - patterns shared by real people about what they noticed, not clinical research or medical advice. Individual experiences vary based on many factors including set, setting, and personal sensitivity.
>
> Please carefully consider all harm reduction practices before choosing to alter your consciousness.
>
> [I understand - show me recommendations]"

### Post-Experience Feedback (Tiered)

**Tier 1 (Quick - always shown):**
"How did your [Strain] experience match what you were looking for?"
- Nailed it / Pretty close / Off
- Optional one-line note
- Optional: actual dose taken (mg)

**Tier 2 (Deep dive - offered after Tier 1):**
"Want to help the community? Tell us more about what you experienced."
- 3-5 experiential dimensions relevant to the user's original intent
- Each dimension: More / Same / Less (matches existing signal model)
- Feeds directly into the Tripdar signal data

---

## WordPress Admin Experience

### Per-Strain Meta Box (within existing strain admin)

Added as a new section to the existing strain management page:

**Product Mapping:**
- Product name, URL, per-unit mg, format (capsule/chocolate/gummy/dried), availability

**Dose Sensitivity Override:**
- Shows algorithm default, allows override to any curve

**Intent Matching:**
- Shows algorithm-calculated score per intent category as a visual bar
- Dropdown per intent: None / Boost / Suppress / Pin

**Caution Flags:**
- Toggle: show dose sensitivity warning
- Toggle + text field: custom caution message

**Feedback Summary (read-only):**
- Total recommendations, feedback received, feedback rate
- Match rating distribution (Nailed it / Pretty close / Off)
- Current feedback modifier value and whether it's active
- Top intents this strain is recommended for

### Global Settings Page

Under Tripdar menu:
- Feedback activation threshold (default: 10 ratings)
- Max recommendations shown (default: 3)
- Show match percentage to users (yes/no)
- Show stepped path notices (yes/no)
- Consent gate text (editable)
- Feedback prompt delay (default: 48 hours)
- Enable deep dive tier 2 (yes/no)
- Theme selection (Parchment / Dark / Minimal)
- Shortcode reference: `[tripdar_recommendation_engine]`

### Dashboard Widget

Quick-glance engine health:
- Mapped strains count and percentage
- Total recommendations (last 30 days)
- Feedback rate
- Overall match score distribution
- Alerts: unmapped strains, negative feedback trends

---

## Data Model (New Prisma Models)

### RecommendationSession
Tracks each user interaction with the engine.

| Field | Type | Purpose |
|---|---|---|
| id | String (cuid) | Primary key |
| sessionToken | String (unique) | Anonymous session tracking |
| experienceLevel | String | new, few_times, experienced, very_experienced |
| inputPath | String | mood_tiles, sliders, guided_quiz |
| intentVector | Json | Computed intent vector |
| rawInput | Json | Original user selections (audit trail) |
| createdAt | DateTime | Timestamp |

### RecommendationResult
Each strain+dose recommendation within a session.

| Field | Type | Purpose |
|---|---|---|
| id | String (cuid) | Primary key |
| sessionId | String | FK to RecommendationSession |
| strainId | String | FK to existing strain data |
| rank | Int | 1 = best match |
| matchScore | Float | Final score (0-100) |
| baseScore | Float | Layer 1 rule score |
| feedbackMod | Float | Layer 2 modifier |
| adminMod | Float | Layer 3 override effect |
| doseLevel | Int | 1-6 canonical level |
| doseLowMg | Int | Strain-adjusted low end |
| doseHighMg | Int | Strain-adjusted high end |
| productUnits | Int (nullable) | Suggested unit count if product mapped |
| cautionFlags | Json (nullable) | Active warnings |
| createdAt | DateTime | Timestamp |

### RecommendationFeedback
Quick match rating from users.

| Field | Type | Purpose |
|---|---|---|
| id | String (cuid) | Primary key |
| resultId | String (unique) | FK to RecommendationResult |
| quickRating | String | nailed_it, pretty_close, missed |
| actualDoseMg | Int (nullable) | What they actually took |
| note | String (nullable) | Optional one-liner |
| createdAt | DateTime | Timestamp |

### RecommendationSignal
Tier 2 deep dive dimensional feedback.

| Field | Type | Purpose |
|---|---|---|
| id | String (cuid) | Primary key |
| feedbackId | String | FK to RecommendationFeedback |
| dimensionId | String | One of the 28 experiential dimensions |
| direction | String | more, less, same |
| createdAt | DateTime | Timestamp |

### StrainRecommendationConfig
Admin settings per strain.

| Field | Type | Purpose |
|---|---|---|
| id | String (cuid) | Primary key |
| strainId | String (unique) | FK to existing strain data |
| productName | String (nullable) | Mapped product display name |
| productUrl | String (nullable) | Link to product page |
| productUnitMg | Int (nullable) | Milligrams per unit |
| productFormat | String (nullable) | capsule, chocolate, gummy, dried |
| availability | String (default: in_stock) | in_stock, out_of_stock, seasonal |
| doseSensitivityOverride | String (nullable) | Overrides algorithm default |
| intentOverrides | Json (nullable) | Per-intent boost/suppress/pin |
| cautionFlags | Json (nullable) | Warning toggles and custom text |
| updatedAt | DateTime | Last modified |
| createdAt | DateTime | Created |

### FeedbackAggregate
Pre-computed feedback scores per strain per intent.

| Field | Type | Purpose |
|---|---|---|
| id | String (cuid) | Primary key |
| strainId | String | FK to strain data |
| intentCategory | String | Which mood tile / intent |
| totalRatings | Int (default: 0) | Total feedback count |
| nailedIt | Int (default: 0) | Positive count |
| prettyClose | Int (default: 0) | Neutral count |
| missed | Int (default: 0) | Negative count |
| feedbackMod | Float (default: 0) | Computed modifier |
| updatedAt | DateTime | Last recomputed |
| @@unique | [strainId, intentCategory] | Composite unique constraint |

### Relationships to Existing Models

- `StrainRecommendationConfig` extends existing strain data (1:1)
- `RecommendationSignal` reuses the same 28 dimension IDs from the signal model
- `RecommendationResult` dose calculations reference existing `DoseCurveData`
- `RecommendationSession` is tracked alongside existing `AnalyticsEvent` types

---

## Language & Tone Rules

### Voice (applies to ALL user-facing output)

**Always use:** "Often described as," "Commonly reported as," "Many users say," "Community experience suggests," "Reports tend to cluster around," "This strain is frequently associated with"

**Never use:** "This will make you feel," "This strain causes," "Guaranteed to," "You should expect," "Treats," "Helps with," "Recommended for," any medical/therapeutic/clinical framing

### Dose Language

| Do | Don't |
|---|---|
| "Community reports commonly place a Macro Dose at 500-2000mg for standard varieties" | "Take 500-2000mg" |
| "For this strain, many users report adjusting down due to steep dose sensitivity" | "This strain is stronger so take less" |
| "3-6 capsules is a common starting range at this level" | "Take 3-6 capsules" |

### Caution Indicator Templates

**Steep Dose Sensitivity:**
"Community reports suggest this strain responds more strongly per mg than standard varieties. Many users recommend starting at the lower end of the range."

**Experience/Intent Mismatch (Stepped Path):**
"Based on what you're looking for, experienced users often explore this at Level [X]. For your experience level, community wisdom suggests starting at Level [Y] with [strain] to build familiarity first. Many users say the depth surprised them even at this level."

**Variable Stability:**
"Experiences with this strain are reported as less predictable than some alternatives. Set and setting may play a larger role than usual."

### Graceful Degradation

The engine always provides value regardless of product mapping state:

- **No products mapped:** Recommend strains + dose levels using canonical mg ranges. No product cards, no unit counts, no links. User never knows anything is "missing."
- **Some strains mapped, recommended strain unmapped:** Show strain recommendation with canonical mg range. No product card for that result. Mapped strains in "Also Fits" show product cards normally.
- **All strains mapped:** Full experience with product cards, unit counts, and purchase links.

### Empty States

**No good match (all scores below threshold):**
"Based on what you're looking for, we don't have a strong match in the current selection. You might try adjusting your preferences or exploring the strain library for more context."

**Feedback thank you:**
"Thanks for sharing your experience. Community input like yours helps make these recommendations more useful for everyone."

---

## API Endpoint Reference

### Public Endpoints

**POST /api/v1/recommend**
Input: experience level, input path, intent vector, raw input, site ID
Output: session token, ranked results with strain data, scores, dose ranges, product info, cautions, stepped path notice

**GET /api/v1/recommend/config**
Output: mood tile definitions with intent vectors, slider axis config, quiz step definitions, experience levels, canonical dose level definitions. Keeps the WP plugin thin.

**POST /api/v1/feedback**
Input: session token, result ID, quick rating, optional actual dose, optional note
Output: success, whether to show deep dive

**POST /api/v1/feedback/signals**
Input: feedback ID, array of dimension/direction pairs
Output: success, signal count

### Admin Endpoints (Authenticated)

**GET /api/v1/admin/recommend/strains**
All strains with recommendation configs, computed scores, feedback aggregates.

**PUT /api/v1/admin/recommend/strains/:slug/config**
Update product mapping, overrides, caution flags for one strain.

**GET /api/v1/admin/recommend/strains/:slug/feedback**
Feedback aggregates and recent individual feedback for one strain.

**GET /api/v1/admin/recommend/dashboard**
Global engine health: mapped count, total recommendations, feedback rate, match distribution, alerts.

**PUT /api/v1/admin/recommend/settings**
Update global settings: threshold, max results, consent text, display prefs.

### Authentication
- Public endpoints: bearer token (same pattern as strain explorer via tripdar-core)
- Admin endpoints: auth session + admin role check (existing `auth()` + `hasPermission()` pattern)

---

## Implementation Notes for Agent Team

### For the team lead:

This document is the source of truth. When the owner asks "why does it do X?" the answer should trace back to a decision in this doc. If something isn't covered here, ask before building.

Key things to get right:
1. **The three-layer scoring model must be separable.** Layer 1 works alone on day one. Layer 2 activates only after threshold. Layer 3 is always optional. If any layer breaks, the others still produce a recommendation.
2. **Language rules are non-negotiable.** Every string the user sees must use community-consensus voice. No imperative dosing language. No medical framing. This is a legal and brand requirement.
3. **Graceful degradation is a core feature, not an edge case.** The engine must work with zero products mapped. Test this path as thoroughly as the fully-mapped path.
4. **The WP plugin is thin.** All scoring, matching, dose calculation, and feedback aggregation happens server-side. The plugin renders UI and calls APIs. If you're writing business logic in PHP, stop and move it to the Next.js service layer.

### Suggested implementation order:
1. Extract `tripdar-core` from existing strain explorer
2. Build the data model (new Prisma models + migration)
3. Build the recommendation service (Layer 1 scoring only)
4. Build the API endpoints (public + admin)
5. Build the WP admin meta box and global settings
6. Build the WP frontend (entry screen, three paths, results)
7. Add Layer 2 feedback loop
8. Add dashboard widget
9. Integration testing with existing strain explorer

### Key reference files:
- Strain data: `/src/domain/strain/` (25 strains with full profiles)
- Existing API pattern: `/src/app/api/v1/` (follow same structure)
- Existing WP plugin: `/wordpress-plugin/tripdar-strain-explorer/`
- Signal model: `/tripdar-spec/TRIPDAR_SIGNAL_SHAPE.md`
- Experiential dimensions: `/tripdar-spec/tripdar-experiential-dimensions.md`
- Dose guide source: Psilly Co. Psilocybin Experience Guide (6 canonical levels)
- Strain guide source: Tripdar Strain Experience Guide PDF (25 strain profiles with potency tiers, dose sensitivity, descriptor clusters)
