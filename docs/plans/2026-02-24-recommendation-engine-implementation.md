# Tripdar Recommendation Engine - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the `tripdar-recommendation-engine` WordPress plugin with server-side scoring, feedback loop, and admin controls - powered by a `tripdar-core` shared library extracted from the existing strain explorer.

**Architecture:** Three-layer scoring model (rule-based core + feedback adjustment + admin overrides) running server-side on Next.js/PostgreSQL. WordPress plugin is a thin presentation layer calling API endpoints. Shared `tripdar-core` library provides API client, caching, and base styles to both plugins.

**Tech Stack:** Next.js 15 (API routes), Prisma 5 (PostgreSQL/Neon), PHP 7.4+ (WordPress plugin), TypeScript, JavaScript, CSS

**Design Doc:** `docs/plans/2026-02-24-dose-recommendation-engine-design.md`

---

## Execution Protocol

### Pre-Approval Requirement

**Before starting ANY phase, the lead agent MUST:**

1. Present a plain-English summary of what the phase does and why
2. List every file that will be created or modified with a one-line description
3. List any commands that will be run (migrations, builds, etc.)
4. Wait for explicit owner approval before proceeding

**Format:**
```
PHASE [N] APPROVAL REQUEST
==========================
What: [1-2 sentence plain English]
Why: [Business value]

Files to CREATE:
- path/to/file.ts — description

Files to MODIFY:
- path/to/file.ts (lines X-Y) — what changes

Commands to RUN:
- npx prisma migrate dev — creates database tables

Approve to proceed?
```

### After Each Phase
- Run all tests for that phase
- Commit working code
- Report results to owner in plain English before starting next phase

---

## Phase 1: Extract `tripdar-core` Shared Library

### What the owner needs to know:
We're pulling the shared plumbing (API connection, caching, styles) out of the strain explorer into its own mini-plugin that both the explorer and the new recommendation engine can use. The strain explorer will keep working exactly as before - we're just reorganizing where the shared code lives.

---

### Task 1.1: Create `tripdar-core` plugin scaffold

**Files:**
- Create: `wordpress-plugin/tripdar-core/tripdar-core.php`
- Create: `wordpress-plugin/tripdar-core/includes/class-api-client.php`
- Create: `wordpress-plugin/tripdar-core/includes/class-cache.php`
- Create: `wordpress-plugin/tripdar-core/assets/css/tripdar-base.css`

**Step 1: Create main plugin file**

```php
<?php
/**
 * Plugin Name: Tripdar Core
 * Description: Shared library for Tripdar WordPress plugins. Provides API client, caching, and base styles.
 * Version: 1.0.0
 * Author: Tripdar
 * Text Domain: tripdar-core
 */

if (!defined('ABSPATH')) exit;

// Prevent double-loading
if (defined('TRIPDAR_CORE_VERSION')) return;

define('TRIPDAR_CORE_VERSION', '1.0.0');
define('TRIPDAR_CORE_DIR', plugin_dir_path(__FILE__));
define('TRIPDAR_CORE_URL', plugin_dir_url(__FILE__));
define('TRIPDAR_API_BASE', 'https://www.tripd.ar/api/v1');

// Load classes
require_once TRIPDAR_CORE_DIR . 'includes/class-cache.php';
require_once TRIPDAR_CORE_DIR . 'includes/class-api-client.php';

/**
 * Get the shared API client instance
 */
function tripdar_api_client() {
    static $client = null;
    if ($client === null) {
        $client = new Tripdar_API_Client();
    }
    return $client;
}

/**
 * Get the shared cache instance
 */
function tripdar_cache() {
    static $cache = null;
    if ($cache === null) {
        $cache = new Tripdar_Cache();
    }
    return $cache;
}

/**
 * Enqueue base styles shared across Tripdar plugins
 */
function tripdar_core_enqueue_base_styles() {
    wp_enqueue_style(
        'tripdar-base',
        TRIPDAR_CORE_URL . 'assets/css/tripdar-base.css',
        [],
        TRIPDAR_CORE_VERSION
    );
    wp_enqueue_style(
        'tripdar-fonts',
        'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Lora:ital,wght@0,400;0,500;0,600;1,400&display=swap',
        [],
        null
    );
}

/**
 * Check if tripdar-core is loaded (for dependent plugins to verify)
 */
function tripdar_core_loaded() {
    return true;
}
```

**Step 2: Create the cache class**

Extract the caching pattern from the existing strain explorer (`wordpress-plugin/tripdar-strain-explorer/includes/class-api-client.php` lines 14-20 for constants, transient pattern throughout).

```php
<?php
/**
 * Tripdar Cache - WordPress transient wrapper
 */
class Tripdar_Cache {

    const DURATION_SHORT  = 300;    // 5 minutes (strain lists)
    const DURATION_MEDIUM = 600;    // 10 minutes (strain detail)
    const DURATION_LONG   = 1800;   // 30 minutes (visualizations)
    const DURATION_HOUR   = 3600;   // 1 hour (quiz/config data)

    private $multiplier;

    public function __construct() {
        $configured = get_option('tripdar_cache_duration', 5);
        $this->multiplier = max(1, intval($configured)) / 5;
    }

    public function get($key) {
        return get_transient('tripdar_' . $key);
    }

    public function set($key, $value, $duration = self::DURATION_SHORT) {
        $adjusted = intval($duration * $this->multiplier);
        set_transient('tripdar_' . $key, $value, $adjusted);
    }

    public function delete($key) {
        delete_transient('tripdar_' . $key);
    }

    public function clear_all() {
        global $wpdb;
        $wpdb->query(
            "DELETE FROM {$wpdb->options}
             WHERE option_name LIKE '_transient_tripdar_%'
             OR option_name LIKE '_transient_timeout_tripdar_%'"
        );
    }

    public function make_key($prefix, $params = []) {
        return $prefix . '_' . md5(serialize($params));
    }
}
```

**Step 3: Create the API client class**

Extract from `wordpress-plugin/tripdar-strain-explorer/includes/class-api-client.php` (lines 40-98 for the core request method).

```php
<?php
/**
 * Tripdar API Client - Shared HTTP client for tripd.ar API
 */
class Tripdar_API_Client {

    private $cache;

    public function __construct() {
        $this->cache = tripdar_cache();
    }

    public function get_api_key() {
        return get_option('tripdar_api_key', '');
    }

    /**
     * Make an authenticated request to the tripd.ar API
     */
    public function request($endpoint, $method = 'GET', $body = null, $cache_duration = 0) {
        $url = TRIPDAR_API_BASE . $endpoint;

        // Check cache for GET requests
        if ($method === 'GET' && $cache_duration > 0) {
            $cache_key = $this->cache->make_key('api', [$endpoint, $method]);
            $cached = $this->cache->get($cache_key);
            if ($cached !== false) {
                return $cached;
            }
        }

        $api_key = $this->get_api_key();
        $args = [
            'method'  => $method,
            'timeout' => 15,
            'headers' => [
                'Content-Type' => 'application/json',
                'Accept'       => 'application/json',
            ],
        ];

        if (!empty($api_key)) {
            $args['headers']['Authorization'] = 'Bearer ' . $api_key;
        }

        if ($body !== null) {
            $args['body'] = wp_json_encode($body);
        }

        $response = wp_remote_request($url, $args);

        if (is_wp_error($response)) {
            return [
                'success' => false,
                'error' => [
                    'code' => 'REQUEST_FAILED',
                    'message' => $response->get_error_message(),
                ],
            ];
        }

        $status = wp_remote_retrieve_response_code($response);
        $data = json_decode(wp_remote_retrieve_body($response), true);

        if ($status === 429) {
            $retry_after = wp_remote_retrieve_header($response, 'retry-after');
            return [
                'success' => false,
                'error' => [
                    'code' => 'RATE_LIMITED',
                    'message' => 'Rate limit exceeded. Retry after ' . ($retry_after ?: '60') . ' seconds.',
                ],
            ];
        }

        if ($status >= 400) {
            return [
                'success' => false,
                'error' => $data['error'] ?? [
                    'code' => 'HTTP_' . $status,
                    'message' => 'API returned status ' . $status,
                ],
            ];
        }

        $result = $data ?: ['success' => true];

        // Cache successful GET responses
        if ($method === 'GET' && $cache_duration > 0 && isset($result['success']) && $result['success']) {
            $this->cache->set($cache_key, $result, $cache_duration);
        }

        return $result;
    }

    /**
     * Convenience: GET request
     */
    public function get($endpoint, $cache_duration = 0) {
        return $this->request($endpoint, 'GET', null, $cache_duration);
    }

    /**
     * Convenience: POST request
     */
    public function post($endpoint, $body = []) {
        return $this->request($endpoint, 'POST', $body, 0);
    }

    /**
     * Convenience: PUT request
     */
    public function put($endpoint, $body = []) {
        return $this->request($endpoint, 'PUT', $body, 0);
    }

    /**
     * Test API connection
     */
    public function test_connection() {
        return $this->get('/strains?page=1&pageSize=1', 0);
    }
}
```

**Step 4: Create base CSS**

Extract shared CSS variables and font definitions from `wordpress-plugin/tripdar-strain-explorer/assets/css/storybook.css` (the CSS custom properties and typography rules only - not component-specific styles).

**Step 5: Commit**

```bash
git add wordpress-plugin/tripdar-core/
git commit -m "feat: create tripdar-core shared library plugin

Extracts API client, caching, and base styles into a shared
plugin that both strain-explorer and recommendation-engine
can depend on."
```

---

### Task 1.2: Refactor strain explorer to depend on `tripdar-core`

**Files:**
- Modify: `wordpress-plugin/tripdar-strain-explorer/tripdar-strain-explorer.php` (lines 20-26 constants, lines 31-81 init)
- Modify: `wordpress-plugin/tripdar-strain-explorer/includes/class-api-client.php` (entire file - becomes a thin extension)
- Delete internal cache logic (now in core)

**Step 1: Add core dependency check to strain explorer main file**

At the top of `tripdar-strain-explorer.php`, after the plugin header, add:

```php
// Require tripdar-core
if (!function_exists('tripdar_core_loaded')) {
    add_action('admin_notices', function() {
        echo '<div class="notice notice-error"><p><strong>Tripdar Strain Explorer</strong> requires the <strong>Tripdar Core</strong> plugin to be installed and activated.</p></div>';
    });
    return;
}
```

**Step 2: Remove constants that moved to core**

Remove from `tripdar-strain-explorer.php`:
- `TRIPDAR_API_BASE` (now in `tripdar-core.php`)

Keep plugin-specific constants:
- `TRIPDAR_VERSION`, `TRIPDAR_PLUGIN_DIR`, `TRIPDAR_PLUGIN_URL`, `TRIPDAR_GITHUB_USER`, `TRIPDAR_GITHUB_REPO`

**Step 3: Refactor API client to extend core client**

Replace the strain explorer's `class-api-client.php` content to extend the core client, keeping only strain-specific convenience methods (like `get_strains()`, `get_strain()`, etc.) that call `$this->get()` and `$this->post()` from the parent.

**Step 4: Verify strain explorer still works**

- Activate both plugins (core first, then explorer)
- Test: strain list loads via shortcode
- Test: strain detail modal opens
- Test: search works
- Test: quiz works
- Test: admin settings page loads and test connection works

**Step 5: Commit**

```bash
git add wordpress-plugin/tripdar-strain-explorer/ wordpress-plugin/tripdar-core/
git commit -m "refactor: strain explorer now depends on tripdar-core

Explorer API client extends core client. Caching delegated to
core cache class. Base styles loaded from core."
```

---

## Phase 2: Database Schema (New Prisma Models)

### What the owner needs to know:
We're adding 6 new database tables to store recommendation sessions, results, feedback, admin settings per strain, and pre-computed feedback scores. None of this touches existing tables - it's purely additive.

---

### Task 2.1: Add new models to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma` (append after line 239)

**Step 1: Add new models**

Append to `prisma/schema.prisma` after the `StrainCorrelation` model:

```prisma
// ============================================================================
// Recommendation Engine
// ============================================================================

model RecommendationSession {
  id              String   @id @default(cuid())
  sessionToken    String   @unique
  experienceLevel String   // new, few_times, experienced, very_experienced
  inputPath       String   // mood_tiles, sliders, guided_quiz
  intentVector    String   // JSON string: { clarity_cognition: 0.6, ... }
  rawInput        String   // JSON string: original user selections
  partnerId       String
  createdAt       DateTime @default(now())

  results         RecommendationResult[]

  @@index([partnerId, createdAt])
  @@index([sessionToken])
}

model RecommendationResult {
  id              String   @id @default(cuid())
  sessionId       String
  strainSlug      String
  rank            Int
  matchScore      Float
  baseScore       Float
  feedbackMod     Float    @default(0)
  adminMod        Float    @default(0)
  doseLevel       Int      // 1-6 canonical level
  doseLowMg       Int
  doseHighMg      Int
  productUnits    Int?
  cautionFlags    String?  // JSON string
  createdAt       DateTime @default(now())

  session         RecommendationSession @relation(fields: [sessionId], references: [id])
  feedback        RecommendationFeedback?

  @@index([sessionId])
  @@index([strainSlug, createdAt])
}

model RecommendationFeedback {
  id              String   @id @default(cuid())
  resultId        String   @unique
  quickRating     String   // nailed_it, pretty_close, missed
  actualDoseMg    Int?
  note            String?
  createdAt       DateTime @default(now())

  result          RecommendationResult @relation(fields: [resultId], references: [id])
  signals         RecommendationSignal[]

  @@index([quickRating])
}

model RecommendationSignal {
  id              String   @id @default(cuid())
  feedbackId      String
  dimensionId     String   // One of the 28 experiential dimensions
  direction       String   // more, less, same
  createdAt       DateTime @default(now())

  feedback        RecommendationFeedback @relation(fields: [feedbackId], references: [id])

  @@index([feedbackId])
  @@index([dimensionId])
}

model StrainRecommendationConfig {
  id                      String   @id @default(cuid())
  strainSlug              String   @unique
  productName             String?
  productUrl              String?
  productUnitMg           Int?
  productFormat           String?  // capsule, chocolate, gummy, dried
  availability            String   @default("in_stock") // in_stock, out_of_stock, seasonal
  doseSensitivityOverride String?  // null = use algorithm default
  intentOverrides         String?  // JSON string: { "calm_centered": "boost", ... }
  cautionFlags            String?  // JSON string: { "show_sensitivity": true, "custom": "..." }
  updatedAt               DateTime @updatedAt
  createdAt               DateTime @default(now())

  @@index([availability])
}

model FeedbackAggregate {
  id              String   @id @default(cuid())
  strainSlug      String
  intentCategory  String
  totalRatings    Int      @default(0)
  nailedIt        Int      @default(0)
  prettyClose     Int      @default(0)
  missed          Int      @default(0)
  feedbackMod     Float    @default(0)
  updatedAt       DateTime @updatedAt

  @@unique([strainSlug, intentCategory])
  @@index([strainSlug])
}
```

**Step 2: Generate and run migration**

```bash
cd /Users/jonathanguttman/Documents/Tripdar/tripdar
npx prisma migrate dev --name add_recommendation_engine
```

Expected: Migration creates 6 new tables. Existing tables untouched.

**Step 3: Verify Prisma client generation**

```bash
npx prisma generate
```

**Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: add recommendation engine database models

Six new tables: RecommendationSession, RecommendationResult,
RecommendationFeedback, RecommendationSignal,
StrainRecommendationConfig, FeedbackAggregate"
```

---

## Phase 3: Recommendation Service (Layer 1 - Rule-Based Core)

### What the owner needs to know:
This is the brain of the engine. It takes what the user wants to feel, scores every strain the shop carries against that intent, calculates strain-adjusted doses using the Psilly dose guide, and returns ranked recommendations. This phase builds the core scoring - no feedback loop or admin overrides yet, just the base algorithm working from the strain guide data.

---

### Task 3.1: Define recommendation types

**Files:**
- Create: `src/domain/recommendation-engine/types.ts`

**Step 1: Write type definitions**

```typescript
/**
 * Recommendation Engine Types
 *
 * Type definitions for the dose recommendation engine.
 */

// =============================================================================
// Intent & Input Types
// =============================================================================

export interface IntentVector {
  clarity_cognition: number;  // -1 to 1
  mood_social: number;        // -1 to 1
  visual_pattern: number;     // -1 to 1
  somatic: number;            // -1 to 1
  energy_direction: number;   // -1 (calm) to 1 (energetic)
  depth_direction: number;    // -1 (clear) to 1 (dreamy)
}

export type ExperienceLevel = "new" | "few_times" | "experienced" | "very_experienced";
export type InputPath = "mood_tiles" | "sliders" | "guided_quiz";

export interface RecommendationRequest {
  experienceLevel: ExperienceLevel;
  inputPath: InputPath;
  intentVector: IntentVector;
  rawInput: Record<string, unknown>;
  siteId: string;
}

// =============================================================================
// Dose Types
// =============================================================================

export type DoseSensitivity = "gentle" | "medium" | "steep" | "very_steep";

export interface CanonicalDoseLevel {
  level: number;           // 1-6
  name: string;            // Microdose, Mini-dose, Macro Dose, Museum Dose, Megadose, Heroic Dose
  standardLowMg: number;
  standardHighMg: number;
  descriptors: string[];
}

export const CANONICAL_DOSE_LEVELS: CanonicalDoseLevel[] = [
  {
    level: 1,
    name: "Microdose",
    standardLowMg: 50,
    standardHighMg: 250,
    descriptors: ["Mood enhancement", "Crisp concentration", "Increased mental stamina"],
  },
  {
    level: 2,
    name: "Mini-dose",
    standardLowMg: 250,
    standardHighMg: 750,
    descriptors: ["Feeling stoned", "Mild euphoria", "Visual enhancements", "Short term memory anomalies", "Altered sound perception"],
  },
  {
    level: 3,
    name: "Macro Dose",
    standardLowMg: 500,
    standardHighMg: 2000,
    descriptors: ["Colors more vivid", "Closed & open eye visuals", "Distracted thought pattern", "Enhanced creativity"],
  },
  {
    level: 4,
    name: "Museum Dose",
    standardLowMg: 1500,
    standardHighMg: 3500,
    descriptors: ["Warped & kaleidoscopic visuals", "Mild hallucinations", "3D closed eye visuals", "Minor synesthesia", "Distorted sense of time"],
  },
  {
    level: 5,
    name: "Megadose",
    standardLowMg: 3500,
    standardHighMg: 5000,
    descriptors: ["Heavy hallucinations", "Ego dissolution", "Mild disconnect from reality", "Complete loss of time", "Synesthesia", "Out of body experiences"],
  },
  {
    level: 6,
    name: "Heroic Dose",
    standardLowMg: 5000,
    standardHighMg: 7500, // 5000mg+ represented as upper bound for calculation
    descriptors: ["Complete altering of senses", "Ego death", "Complete disconnect from reality"],
  },
];

export const DOSE_SENSITIVITY_MODIFIERS: Record<DoseSensitivity, number> = {
  gentle: 1.0,
  medium: 0.85,
  steep: 0.7,
  very_steep: 0.55,
};

// =============================================================================
// Scoring Types
// =============================================================================

export interface StrainProfileVector {
  strainSlug: string;
  clarity_cognition: number;
  mood_social: number;
  visual_pattern: number;
  somatic: number;
  energy_direction: number;
  depth_direction: number;
  potencyTier: string;
  doseSensitivity: DoseSensitivity;
  experienceStability: string;
  beginnerFriendly: string;
}

export interface ScoredRecommendation {
  strainSlug: string;
  strainName: string;
  matchScore: number;       // 0-100
  baseScore: number;        // Layer 1
  feedbackMod: number;      // Layer 2
  adminMod: number;         // Layer 3
  doseLevel: number;        // 1-6
  doseLevelName: string;
  doseLowMg: number;
  doseHighMg: number;
  product?: {
    name: string;
    url: string;
    suggestedUnits: string;
    format: string;
  };
  description: string;
  tags: {
    stability: string;
    doseSensitivity: string;
    beginnerFriendly: string;
  };
  cautions: string[];
  steppedPathNotice?: string;
}

// =============================================================================
// Response Types
// =============================================================================

export interface RecommendationResponse {
  sessionToken: string;
  results: ScoredRecommendation[];
  steppedPath?: {
    message: string;
    suggestedLevel: number;
    aspirationalLevel: number;
  };
}

// =============================================================================
// Config Types (for GET /recommend/config)
// =============================================================================

export interface MoodTile {
  id: string;
  label: string;
  description: string;
  intentVector: IntentVector;
}

export interface RecommendationConfig {
  moodTiles: MoodTile[];
  sliderAxes: Array<{ id: string; label: string; min: number; max: number }>;
  quizSteps: Array<{
    id: string;
    question: string;
    options: Array<{ id: string; label: string; tags: string[] }>;
  }>;
  experienceLevels: Array<{ id: ExperienceLevel; label: string }>;
  doseLevels: CanonicalDoseLevel[];
}
```

**Step 2: Commit**

```bash
git add src/domain/recommendation-engine/
git commit -m "feat: define recommendation engine type system"
```

---

### Task 3.2: Build the intent configuration (mood tiles, sliders, quiz)

**Files:**
- Create: `src/domain/recommendation-engine/config.ts`

**Step 1: Define mood tiles with pre-computed intent vectors**

Map each mood tile to an intent vector using the descriptor clusters from the Strain Experience Guide PDF (page 2: Clarity & Cognition, Mood & Social, Visual & Pattern, Somatic clusters, and page 25: effect-profile compass).

```typescript
/**
 * Recommendation Engine Configuration
 *
 * Mood tiles, slider axes, quiz steps, and their intent vector mappings.
 * Derived from the Tripdar Strain Experience Guide descriptor clusters.
 */

import { MoodTile, RecommendationConfig, IntentVector } from "./types";

export const MOOD_TILES: MoodTile[] = [
  {
    id: "calm_centered",
    label: "Calm & Centered",
    description: "Peaceful, grounded, at ease",
    intentVector: {
      clarity_cognition: 0.4,
      mood_social: 0.3,
      visual_pattern: 0.0,
      somatic: 0.6,
      energy_direction: -0.8,  // calm
      depth_direction: -0.3,   // clear-leaning
    },
  },
  {
    id: "social_giggly",
    label: "Social & Giggly",
    description: "Playful, connected, lighthearted",
    intentVector: {
      clarity_cognition: 0.1,
      mood_social: 0.9,
      visual_pattern: 0.1,
      somatic: 0.2,
      energy_direction: 0.6,   // energetic
      depth_direction: -0.4,   // clear-leaning
    },
  },
  {
    id: "creative_flow",
    label: "Creative Flow",
    description: "Inspired, flowing, imaginative",
    intentVector: {
      clarity_cognition: 0.6,
      mood_social: 0.2,
      visual_pattern: 0.5,
      somatic: 0.1,
      energy_direction: 0.3,   // slightly energetic
      depth_direction: 0.3,    // slightly dreamy
    },
  },
  {
    id: "deep_insight",
    label: "Deep Insight",
    description: "Introspective, philosophical, meaningful",
    intentVector: {
      clarity_cognition: 0.8,
      mood_social: -0.2,
      visual_pattern: 0.2,
      somatic: 0.3,
      energy_direction: -0.5,  // calm
      depth_direction: 0.6,    // dreamy
    },
  },
  {
    id: "visual_journey",
    label: "Visual Journey",
    description: "Vivid, immersive, kaleidoscopic",
    intentVector: {
      clarity_cognition: 0.1,
      mood_social: 0.0,
      visual_pattern: 0.9,
      somatic: 0.3,
      energy_direction: 0.0,
      depth_direction: 0.8,    // dreamy
    },
  },
  {
    id: "energized_uplifted",
    label: "Energized & Uplifted",
    description: "Bright, motivated, euphoric",
    intentVector: {
      clarity_cognition: 0.3,
      mood_social: 0.5,
      visual_pattern: 0.2,
      somatic: 0.4,
      energy_direction: 0.9,   // energetic
      depth_direction: -0.3,   // clear-leaning
    },
  },
  {
    id: "body_warmth",
    label: "Body Warmth",
    description: "Relaxed, wave-like, grounded",
    intentVector: {
      clarity_cognition: 0.0,
      mood_social: 0.2,
      visual_pattern: 0.0,
      somatic: 0.9,
      energy_direction: -0.6,  // calm
      depth_direction: 0.1,
    },
  },
  {
    id: "full_reset",
    label: "Full Reset",
    description: "Transformative, profound, ego-dissolving",
    intentVector: {
      clarity_cognition: 0.4,
      mood_social: -0.3,
      visual_pattern: 0.7,
      somatic: 0.5,
      energy_direction: 0.0,
      depth_direction: 0.9,    // very dreamy
    },
  },
];

export const QUIZ_STEPS = [
  {
    id: "occasion",
    question: "What's the occasion?",
    options: [
      { id: "solo", label: "Solo reflection", tags: ["introspective", "calm", "deep"] },
      { id: "social", label: "Social gathering", tags: ["social", "giggly", "uplifting", "playful"] },
      { id: "creative", label: "Creative work", tags: ["creative", "focused", "flowing"] },
      { id: "nature", label: "Nature outing", tags: ["grounded", "connected", "sensory"] },
      { id: "ceremony", label: "Ceremony & healing", tags: ["deep", "visionary", "transformative"] },
      { id: "curious", label: "Just curious", tags: ["gentle", "balanced", "beginner-friendly"] },
    ],
  },
  {
    id: "priority",
    question: "What matters most to you?",
    options: [
      { id: "clarity", label: "Clarity of mind", tags: ["clear-headed", "focused", "lucid"] },
      { id: "emotion", label: "Emotional openness", tags: ["heart-opening", "warm", "connected"] },
      { id: "visuals", label: "Visual beauty", tags: ["visual", "immersive", "patterning"] },
      { id: "body", label: "Physical relaxation", tags: ["body warmth", "relaxation", "grounded"] },
      { id: "meaning", label: "Sense of meaning", tags: ["philosophical", "introspective", "deep"] },
      { id: "fun", label: "Fun & laughter", tags: ["giggly", "playful", "euphoric"] },
    ],
  },
  {
    id: "intensity",
    question: "How would you describe your comfort level with intensity?",
    options: [
      { id: "gentle", label: "Keep it gentle", tags: ["gentle", "stable", "beginner-friendly"] },
      { id: "moderate", label: "I'm open to something moderate", tags: ["balanced", "moderate"] },
      { id: "deep", label: "I want to go deep", tags: ["intense", "powerful", "immersive"] },
      { id: "surprise", label: "Surprise me", tags: ["variable", "adventurous"] },
    ],
  },
  {
    id: "past_strains",
    question: "Any strains you've enjoyed before?",
    conditional: "experienced",  // Only show if experience level >= experienced
    options: [],                 // Populated dynamically from shop's mapped strains
  },
];

export const SLIDER_AXES = [
  { id: "energy", label: "Calm \u2194 Energetic", min: -1, max: 1 },
  { id: "depth", label: "Clear \u2194 Dreamy", min: -1, max: 1 },
];

export const EXPERIENCE_LEVELS = [
  { id: "new" as const, label: "This is my first time" },
  { id: "few_times" as const, label: "A few times" },
  { id: "experienced" as const, label: "Experienced" },
  { id: "very_experienced" as const, label: "Very experienced" },
];

export function getRecommendationConfig(): RecommendationConfig {
  return {
    moodTiles: MOOD_TILES,
    sliderAxes: SLIDER_AXES,
    quizSteps: QUIZ_STEPS,
    experienceLevels: EXPERIENCE_LEVELS,
    doseLevels: [], // Imported from types.ts CANONICAL_DOSE_LEVELS
  };
}
```

**Step 2: Commit**

```bash
git add src/domain/recommendation-engine/
git commit -m "feat: define mood tiles, quiz steps, and intent vector mappings"
```

---

### Task 3.3: Build the strain profile vector generator

**Files:**
- Create: `src/domain/recommendation-engine/strain-profiles.ts`

**Step 1: Build strain-to-vector mapping**

Map each strain's attributes (from `src/domain/strain/types.ts` fields: potency, stability, beginner, visual, vibe, emotionalCharacter) into a profile vector for cosine similarity matching.

This reads from the existing `getAllStrains()` function in `src/domain/strain/data.ts` and produces `StrainProfileVector` objects.

Key mappings from the Strain Experience Guide PDF:
- Vibe keywords → descriptor cluster weights (clarity_cognition, mood_social, visual_pattern, somatic)
- potency + comeUpIntensity + peakCharacter → energy_direction
- emotionalCharacter + visual intensity → depth_direction
- doseSensitivity from `characteristics.doseSensitivity` (gentle/moderate/steep, extending to very_steep for PE-family based on PDF data)

**Step 2: Commit**

```bash
git add src/domain/recommendation-engine/
git commit -m "feat: strain profile vector generator from strain data"
```

---

### Task 3.4: Build the scoring engine

**Files:**
- Create: `src/domain/recommendation-engine/scoring.ts`

**Step 1: Implement cosine similarity + experience weighting**

Core algorithm:
1. Compute cosine similarity between intent vector and each strain profile vector
2. Apply experience level modifier (beginner-friendly strains get +15% for "new" users, -10% for "very_experienced")
3. Apply dose feasibility check (strain must be able to deliver desired intensity at a safe dose level for this experience level)
4. Return sorted scored list

**Step 2: Implement dose calculation**

Using the canonical dose levels from `types.ts` and sensitivity modifiers:
- Determine target dose level from intent vector intensity + experience level
- Apply strain's dose sensitivity modifier to get adjusted mg range
- If product mapped, calculate unit count from adjusted range and per-unit mg

**Step 3: Implement stepped path detection**

When experience level is "new" or "few_times" but intent vector points to Level 4+, generate the stepped path notice.

**Step 4: Commit**

```bash
git add src/domain/recommendation-engine/
git commit -m "feat: recommendation scoring engine with dose calculation"
```

---

### Task 3.5: Build the recommendation service (orchestrator)

**Files:**
- Create: `src/domain/recommendation-engine/service.ts`
- Create: `src/domain/recommendation-engine/index.ts`

**Step 1: Implement main recommendation function**

Orchestrates:
1. Load available strains for the requesting partner/site
2. Load StrainRecommendationConfig for each strain (product mapping, overrides)
3. Filter to available strains only (`availability === "in_stock"`)
4. Generate strain profile vectors
5. Score against intent vector (Layer 1)
6. Apply feedback modifiers (Layer 2 - stub for now, returns 0)
7. Apply admin overrides (Layer 3 - reads from StrainRecommendationConfig)
8. Sort by final score, take top N
9. Build response with dose calculations, product info, caution flags
10. Save RecommendationSession + RecommendationResults to database
11. Return response

**Step 2: Create barrel export**

`index.ts` re-exports the public API of the module.

**Step 3: Commit**

```bash
git add src/domain/recommendation-engine/
git commit -m "feat: recommendation service orchestrator"
```

---

## Phase 4: API Endpoints

### What the owner needs to know:
We're creating the server endpoints that the WordPress plugin will call. Four public endpoints (get recommendations, get UI config, submit feedback, submit deep feedback) and four admin endpoints (view/edit strain configs, dashboard stats, global settings). These follow the exact same pattern as all the existing Tripdar API routes.

---

### Task 4.1: Create public recommendation endpoints

**Files:**
- Create: `src/app/api/v1/recommend/route.ts`
- Create: `src/app/api/v1/recommend/config/route.ts`

**Step 1: Build POST /api/v1/recommend**

Follow the exact pattern from `src/app/api/v1/recommendations/route.ts` (lines 1-42) and `src/domain/partner/middleware.ts` for auth:

```typescript
import { authenticateRequest, addPartnerHeaders, withLogging } from "@/domain/partner";
import { generateRecommendations } from "@/domain/recommendation-engine";
import type { ApiSuccessResponse } from "@/domain/partner";
import type { RecommendationResponse } from "@/domain/recommendation-engine";
```

- Authenticate request
- Parse and validate body (experienceLevel, inputPath, intentVector, rawInput)
- Call `generateRecommendations(request, partner.id)`
- Return `ApiSuccessResponse<RecommendationResponse>`
- Include OPTIONS handler for CORS (match existing pattern)

**Step 2: Build GET /api/v1/recommend/config**

- Authenticate request
- Return mood tiles, slider axes, quiz steps, experience levels, canonical dose levels
- Cache for 1 hour (config changes rarely)

**Step 3: Commit**

```bash
git add src/app/api/v1/recommend/
git commit -m "feat: POST /recommend and GET /recommend/config endpoints"
```

---

### Task 4.2: Create feedback endpoints

**Files:**
- Create: `src/app/api/v1/recommend/feedback/route.ts`
- Create: `src/app/api/v1/recommend/feedback/signals/route.ts`

**Step 1: Build POST /api/v1/recommend/feedback**

- Authenticate
- Validate: sessionToken, resultId, quickRating (nailed_it | pretty_close | missed)
- Optional: actualDoseMg, note
- Create RecommendationFeedback record
- Update FeedbackAggregate (increment counters, recompute modifier)
- Return success + showDeepDive flag

**Step 2: Build POST /api/v1/recommend/feedback/signals**

- Authenticate
- Validate: feedbackId, signals array (each: dimensionId from 28 dimensions, direction: more|less|same)
- Create RecommendationSignal records
- Return success + count

**Step 3: Commit**

```bash
git add src/app/api/v1/recommend/feedback/
git commit -m "feat: feedback and signal submission endpoints"
```

---

### Task 4.3: Create admin endpoints

**Files:**
- Create: `src/app/api/v1/admin/recommend/strains/route.ts`
- Create: `src/app/api/v1/admin/recommend/strains/[slug]/config/route.ts`
- Create: `src/app/api/v1/admin/recommend/strains/[slug]/feedback/route.ts`
- Create: `src/app/api/v1/admin/recommend/dashboard/route.ts`
- Create: `src/app/api/v1/admin/recommend/settings/route.ts`

**Step 1: Build GET /admin/recommend/strains**

Returns all strains with their StrainRecommendationConfig, computed intent scores, and FeedbackAggregate data.

**Step 2: Build PUT /admin/recommend/strains/:slug/config**

Upserts StrainRecommendationConfig. Validates product mapping fields, intent overrides JSON, caution flags JSON.

**Step 3: Build GET /admin/recommend/strains/:slug/feedback**

Returns FeedbackAggregate for the strain plus recent individual RecommendationFeedback records.

**Step 4: Build GET /admin/recommend/dashboard**

Aggregates: mapped strain count, total recommendations (last 30 days), feedback rate, match distribution, alert flags.

**Step 5: Build PUT /admin/recommend/settings**

Updates global settings (stored as a single JSON document or individual rows - follow existing pattern).

**Step 6: Commit**

```bash
git add src/app/api/v1/admin/recommend/
git commit -m "feat: admin endpoints for recommendation engine config and monitoring"
```

---

### Task 4.4: Update Next.js middleware for new routes

**Files:**
- Modify: `next.config.ts` or `middleware.ts` (if edge middleware exists)

Ensure `/api/v1/recommend/*` and `/api/v1/admin/recommend/*` routes are whitelisted in the edge middleware. Reference: the existing bug from CHANGELOG v1.4.8 where trip report submission failed due to edge middleware whitelist.

**Step 1: Add new routes to whitelist**

**Step 2: Commit**

```bash
git add next.config.ts middleware.ts
git commit -m "fix: whitelist recommendation engine routes in edge middleware"
```

---

## Phase 5: WordPress Admin (Per-Strain Config + Global Settings)

### What the owner needs to know:
This adds the admin controls to your WordPress dashboard. Each strain gets a new "Recommendation Engine" section where you map products, set overrides, and see feedback data. There's also a global settings page for engine-wide controls and a dashboard widget showing overall health.

---

### Task 5.1: Create recommendation engine plugin scaffold

**Files:**
- Create: `wordpress-plugin/tripdar-recommendation-engine/tripdar-recommendation-engine.php`
- Create: `wordpress-plugin/tripdar-recommendation-engine/admin/class-admin.php`
- Create: `wordpress-plugin/tripdar-recommendation-engine/includes/class-api-client.php`
- Create: `wordpress-plugin/tripdar-recommendation-engine/assets/css/admin.css`
- Create: `wordpress-plugin/tripdar-recommendation-engine/assets/js/admin.js`

**Step 1: Create main plugin file**

Follows same pattern as strain explorer. Requires tripdar-core. Registers admin hooks and shortcode.

**Step 2: Create API client extending core**

Thin extension of `Tripdar_API_Client` with recommendation-specific methods: `get_recommendations($body)`, `submit_feedback($body)`, `get_config()`, `get_strain_config($slug)`, `update_strain_config($slug, $data)`, `get_dashboard()`.

**Step 3: Create admin class**

Registers:
- Per-strain meta box (hooks into existing strain admin if available, otherwise standalone)
- Global settings page under Tripdar menu
- Dashboard widget
- AJAX handlers for saving config

**Step 4: Commit**

```bash
git add wordpress-plugin/tripdar-recommendation-engine/
git commit -m "feat: recommendation engine WP plugin scaffold with admin"
```

---

### Task 5.2: Build per-strain recommendation meta box

**Files:**
- Modify: `wordpress-plugin/tripdar-recommendation-engine/admin/class-admin.php`
- Create: `wordpress-plugin/tripdar-recommendation-engine/admin/views/strain-config.php`

**Step 1: Build the meta box HTML**

Renders: product mapping fields, dose sensitivity override, intent matching bars with override dropdowns, caution flags, feedback summary (read-only).

**Step 2: Build AJAX save handler**

Sanitizes input, calls `PUT /admin/recommend/strains/:slug/config`.

**Step 3: Build AJAX load handler**

Calls `GET /admin/recommend/strains/:slug/feedback` to populate feedback summary.

**Step 4: Commit**

```bash
git add wordpress-plugin/tripdar-recommendation-engine/
git commit -m "feat: per-strain recommendation config meta box"
```

---

### Task 5.3: Build global settings page

**Files:**
- Create: `wordpress-plugin/tripdar-recommendation-engine/admin/views/settings.php`
- Modify: `wordpress-plugin/tripdar-recommendation-engine/admin/class-admin.php`

**Step 1: Build settings page HTML**

Fields: feedback threshold, max results, show match %, show stepped path, consent gate text, feedback delay, enable deep dive, theme selection, shortcode reference.

**Step 2: Register settings with WordPress**

Use `register_setting()` and `add_settings_field()` following the pattern from `wordpress-plugin/tripdar-strain-explorer/admin/class-admin.php` (lines 77-120).

**Step 3: Commit**

```bash
git add wordpress-plugin/tripdar-recommendation-engine/
git commit -m "feat: global recommendation engine settings page"
```

---

## Phase 6: WordPress Frontend (User-Facing Experience)

### What the owner needs to know:
This is what your customers see. The three entry points (mood tiles, sliders, guided quiz), the fade transition when they pick one, the recommendation output cards with dose info, product links, and caution indicators. Plus the consent gate on first use and the feedback prompts after purchase.

---

### Task 6.1: Build the shortcode and entry screen

**Files:**
- Create: `wordpress-plugin/tripdar-recommendation-engine/includes/class-shortcodes.php`
- Create: `wordpress-plugin/tripdar-recommendation-engine/assets/js/recommendation-engine.js`
- Create: `wordpress-plugin/tripdar-recommendation-engine/assets/css/recommendation-engine.css`

**Step 1: Register shortcode `[tripdar_recommendation_engine]`**

Renders the consent gate (checks localStorage for prior acceptance) and the entry screen with three path cards + experience level selector.

**Step 2: Build JavaScript controller**

Class `TripdarRecommendationEngine`:
- Loads config from `/recommend/config` on init
- Manages state: current path, experience level, intent vector
- Handles path selection animation (fade out non-selected, expand selected)
- Handles form submission → `POST /recommend`
- Renders results
- Handles feedback submission

**Step 3: Build CSS**

Extends tripdar-base styles. Entry cards, mood tiles, slider compass, quiz steps, result cards, caution indicators, feedback prompt.

**Step 4: Commit**

```bash
git add wordpress-plugin/tripdar-recommendation-engine/
git commit -m "feat: recommendation engine frontend - entry screen and shortcode"
```

---

### Task 6.2: Build Path A (Mood Tiles)

**Files:**
- Modify: `wordpress-plugin/tripdar-recommendation-engine/assets/js/recommendation-engine.js`

**Step 1: Implement mood tile rendering and selection**

- Render tiles from config data
- Multi-select (1-3 tiles)
- Visual feedback on selection (highlight, count indicator)
- Blend intent vectors when multiple tiles selected (average)
- Submit button appears after selection

**Step 2: Commit**

```bash
git add wordpress-plugin/tripdar-recommendation-engine/assets/
git commit -m "feat: mood tiles input path"
```

---

### Task 6.3: Build Path B (Sliders/Compass)

**Files:**
- Modify: `wordpress-plugin/tripdar-recommendation-engine/assets/js/recommendation-engine.js`

**Step 1: Implement 2D compass + intensity slider**

- Draggable marker on 2-axis compass (Calm↔Energetic, Clear↔Dreamy)
- Separate intensity slider (Light / Moderate / Deep)
- Real-time intent vector calculation from position
- Submit button

**Step 2: Commit**

```bash
git add wordpress-plugin/tripdar-recommendation-engine/assets/
git commit -m "feat: slider compass input path"
```

---

### Task 6.4: Build Path C (Guided Quiz)

**Files:**
- Modify: `wordpress-plugin/tripdar-recommendation-engine/assets/js/recommendation-engine.js`

**Step 1: Implement stepped quiz**

- One question at a time with fade transitions
- Progress indicator
- Each answer adjusts intent vector progressively
- Step 4 (past strains) only shows for experienced+ users
- Submit after final step

**Step 2: Commit**

```bash
git add wordpress-plugin/tripdar-recommendation-engine/assets/
git commit -m "feat: guided quiz input path"
```

---

### Task 6.5: Build recommendation output display

**Files:**
- Modify: `wordpress-plugin/tripdar-recommendation-engine/assets/js/recommendation-engine.js`
- Modify: `wordpress-plugin/tripdar-recommendation-engine/assets/css/recommendation-engine.css`

**Step 1: Implement result cards**

- Best Match card: strain name, dose level, mg range OR product units, community description, Tripdar tags, match %, product link (if mapped)
- Also Fits cards (condensed)
- Stepped path notice (when applicable)
- Inline caution indicators
- "Start Over" button

**Step 2: Commit**

```bash
git add wordpress-plugin/tripdar-recommendation-engine/
git commit -m "feat: recommendation output display with caution indicators"
```

---

### Task 6.6: Build feedback prompt

**Files:**
- Modify: `wordpress-plugin/tripdar-recommendation-engine/assets/js/recommendation-engine.js`

**Step 1: Implement Tier 1 quick rating**

- Shows after results (or on return visit via localStorage session token)
- Three emoji buttons: Nailed it / Pretty close / Off
- Optional note field
- Submits to `POST /feedback`

**Step 2: Implement Tier 2 deep dive**

- Offered after Tier 1 if `showDeepDive` is true
- Shows 3-5 dimensions relevant to original intent
- Each: More / Same / Less radio buttons
- Actual dose field
- Submits to `POST /feedback/signals`

**Step 3: Commit**

```bash
git add wordpress-plugin/tripdar-recommendation-engine/
git commit -m "feat: tiered feedback collection (quick rating + deep dive)"
```

---

## Phase 7: Feedback Adjustment Layer (Layer 2)

### What the owner needs to know:
This makes the engine learn from real experience. When customers tell us "Nailed it" or "Missed the mark," those ratings gradually shift future recommendations. The more feedback a strain gets for a particular intent, the more confident the engine becomes. You can see the feedback modifier per strain in the admin panel.

---

### Task 7.1: Implement feedback aggregation

**Files:**
- Create: `src/domain/recommendation-engine/feedback.ts`
- Modify: `src/domain/recommendation-engine/service.ts`

**Step 1: Build aggregation function**

When feedback is submitted:
1. Find or create `FeedbackAggregate` for this strainSlug + intentCategory
2. Increment appropriate counter (nailedIt, prettyClose, missed)
3. Recompute modifier: `((nailedIt * 5 + prettyClose * 0 + missed * -10) / totalRatings)` capped at +-20%
4. Only activate if totalRatings >= threshold (from global settings)

**Step 2: Integrate into scoring**

In the scoring engine, after Layer 1 base score, look up `FeedbackAggregate` for each strain + the closest matching intent category. Apply modifier to base score.

**Step 3: Commit**

```bash
git add src/domain/recommendation-engine/
git commit -m "feat: feedback aggregation and Layer 2 scoring adjustment"
```

---

### Task 7.2: Implement signal processing

**Files:**
- Modify: `src/domain/recommendation-engine/feedback.ts`

**Step 1: Process deep dive signals**

When Tier 2 signals are submitted:
1. Store RecommendationSignal records
2. Aggregate signal direction counts per strain per dimension
3. If a strain consistently shows "more calm" across many signals, increase its calm weight in the strain profile vector

This is a longer-term refinement - initial implementation stores the data and computes simple direction frequency. Profile vector adjustment can be refined as data accumulates.

**Step 2: Commit**

```bash
git add src/domain/recommendation-engine/
git commit -m "feat: deep dive signal processing for strain profile refinement"
```

---

## Phase 8: Dashboard Widget

### What the owner needs to know:
A quick-glance widget on your WordPress dashboard showing how the recommendation engine is performing: how many strains are mapped, how many recommendations have been made, what the feedback looks like, and any alerts that need your attention.

---

### Task 8.1: Build dashboard widget

**Files:**
- Modify: `wordpress-plugin/tripdar-recommendation-engine/admin/class-admin.php`
- Create: `wordpress-plugin/tripdar-recommendation-engine/admin/views/dashboard-widget.php`

**Step 1: Register WP dashboard widget**

Hook into `wp_dashboard_setup`, add widget that calls `GET /admin/recommend/dashboard`.

**Step 2: Render widget HTML**

Shows: mapped strain count + bar, total recommendations (30d), feedback rate, match distribution (emoji breakdown), alert flags.

**Step 3: Commit**

```bash
git add wordpress-plugin/tripdar-recommendation-engine/
git commit -m "feat: recommendation engine dashboard widget"
```

---

## Phase 9: Integration Testing & Polish

### What the owner needs to know:
We're making sure everything works together - the strain explorer and recommendation engine side by side, core dependency handling, edge cases like no products mapped, and the graceful degradation we designed.

---

### Task 9.1: Test graceful degradation

Verify:
- Engine works with zero products mapped (shows mg ranges, no product cards)
- Engine works with partial mapping (some results have product cards, others don't)
- Engine works with all products mapped (full experience)
- User never sees error messaging about missing configuration

### Task 9.2: Test both plugins together

Verify:
- Both plugins activate with tripdar-core active
- Correct error message if tripdar-core is deactivated
- Strain explorer still works identically to before
- No CSS/JS conflicts between plugins
- Admin pages for both plugins work

### Task 9.3: Test all three input paths

For each path (mood tiles, sliders, quiz):
- Path selection fades others correctly
- Input produces valid intent vector
- Recommendation results display correctly
- Product links work when mapped
- Caution indicators show for steep-sensitivity strains
- Stepped path notice shows for new users requesting intense experiences

### Task 9.4: Test feedback loop end-to-end

- Quick rating submits and shows thank you
- Deep dive offered after Tier 1
- Signal dimensions match original intent
- FeedbackAggregate updates correctly
- Feedback modifier appears in admin per-strain view
- Modifier activates only after threshold

### Task 9.5: Update documentation

**Files:**
- Modify: `docs/CHANGELOG.md` - Add version entry for recommendation engine
- Modify: `docs/BUG_LOG.md` - Document any bugs found during integration testing

**Step 1: Update CHANGELOG**

Add entry for `tripdar-core` v1.0.0 and `tripdar-recommendation-engine` v1.0.0.

**Step 2: Commit**

```bash
git add docs/
git commit -m "docs: update changelog and bug log for recommendation engine v1.0.0"
```

---

## File Summary

### New files to create:

**tripdar-core (WordPress plugin):**
- `wordpress-plugin/tripdar-core/tripdar-core.php`
- `wordpress-plugin/tripdar-core/includes/class-api-client.php`
- `wordpress-plugin/tripdar-core/includes/class-cache.php`
- `wordpress-plugin/tripdar-core/assets/css/tripdar-base.css`

**tripdar-recommendation-engine (WordPress plugin):**
- `wordpress-plugin/tripdar-recommendation-engine/tripdar-recommendation-engine.php`
- `wordpress-plugin/tripdar-recommendation-engine/admin/class-admin.php`
- `wordpress-plugin/tripdar-recommendation-engine/admin/views/strain-config.php`
- `wordpress-plugin/tripdar-recommendation-engine/admin/views/settings.php`
- `wordpress-plugin/tripdar-recommendation-engine/admin/views/dashboard-widget.php`
- `wordpress-plugin/tripdar-recommendation-engine/includes/class-api-client.php`
- `wordpress-plugin/tripdar-recommendation-engine/includes/class-shortcodes.php`
- `wordpress-plugin/tripdar-recommendation-engine/assets/js/recommendation-engine.js`
- `wordpress-plugin/tripdar-recommendation-engine/assets/js/admin.js`
- `wordpress-plugin/tripdar-recommendation-engine/assets/css/recommendation-engine.css`
- `wordpress-plugin/tripdar-recommendation-engine/assets/css/admin.css`

**Server-side (Next.js):**
- `src/domain/recommendation-engine/types.ts`
- `src/domain/recommendation-engine/config.ts`
- `src/domain/recommendation-engine/strain-profiles.ts`
- `src/domain/recommendation-engine/scoring.ts`
- `src/domain/recommendation-engine/feedback.ts`
- `src/domain/recommendation-engine/service.ts`
- `src/domain/recommendation-engine/index.ts`
- `src/app/api/v1/recommend/route.ts`
- `src/app/api/v1/recommend/config/route.ts`
- `src/app/api/v1/recommend/feedback/route.ts`
- `src/app/api/v1/recommend/feedback/signals/route.ts`
- `src/app/api/v1/admin/recommend/strains/route.ts`
- `src/app/api/v1/admin/recommend/strains/[slug]/config/route.ts`
- `src/app/api/v1/admin/recommend/strains/[slug]/feedback/route.ts`
- `src/app/api/v1/admin/recommend/dashboard/route.ts`
- `src/app/api/v1/admin/recommend/settings/route.ts`

### Existing files to modify:
- `prisma/schema.prisma` — Add 6 new models (append only, no changes to existing)
- `wordpress-plugin/tripdar-strain-explorer/tripdar-strain-explorer.php` — Add core dependency check
- `wordpress-plugin/tripdar-strain-explorer/includes/class-api-client.php` — Extend core client
- `next.config.ts` or `middleware.ts` — Whitelist new routes
- `docs/CHANGELOG.md` — Version entries
- `docs/BUG_LOG.md` — Bug documentation if applicable
