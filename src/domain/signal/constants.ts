/**
 * Meaning Layer v1.0 — Application Guards
 *
 * This module encodes ONLY the allowed vocabulary for fields/enums/dimensions
 * so that meaning drift is rejected rather than silently accepted.
 *
 * Authoritative sources:
 * - tripdar-spec/tripdar-signal-table-definition.md
 * - tripdar-spec/tripdar-experiential-dimensions.md
 * - prisma/schema.prisma
 */

// =============================================================================
// Allowed (exact) Signal fields — allow-list to prevent forbidden fields
// =============================================================================

export const ALLOWED_SIGNAL_FIELDS = [
  "id",
  "strainId",
  "doseCategory",
  "scale",
  "dimensionId",
  "referenceFrame",
  "comparisonDose",
  "comparisonStrainId",
  "direction",
  "sessionId",
  "reportId",
  "createdAt",
] as const;

export type AllowedSignalField = (typeof ALLOWED_SIGNAL_FIELDS)[number];

// =============================================================================
// Prisma enums (Meaning Layer v1.0)
// =============================================================================

export const DOSE_CATEGORIES = ["MICRODOSE", "LOW", "MODERATE", "HIGH"] as const;
export type DoseCategory = (typeof DOSE_CATEGORIES)[number];

export const EXPERIENCE_SCALES = ["MICRO", "MACRO"] as const;
export type ExperienceScale = (typeof EXPERIENCE_SCALES)[number];

export const REFERENCE_FRAMES = ["BASELINE", "WITHIN_STRAIN", "CROSS_STRAIN"] as const;
export type ReferenceFrame = (typeof REFERENCE_FRAMES)[number];

export const DIRECTIONS = ["MORE", "LESS", "SAME", "NOT_NOTICED"] as const;
export type Direction = (typeof DIRECTIONS)[number];

// =============================================================================
// Experiential dimensions (27) — treated as the canonical dimensionId set
// =============================================================================
// Note: Meaning Layer v1.0 defines the dimension vocabulary by name. Until a
// separate canonical ID mapping is introduced, we treat dimensionId as this set.

export const DIMENSION_IDS = [
  // Domain 1: Cognitive (5)
  "clarity",
  "fluidity",
  "introspection",
  "presence",
  "novelty",
  // Domain 2: Emotional (5)
  "openness",
  "calm",
  "sensitivity",
  "warmth",
  "depth",
  // Domain 3: Somatic (5)
  "body_awareness",
  "energy",
  "relaxation",
  "groundedness",
  "sensory_acuity",
  // Domain 4: Perceptual (4)
  "visual_nuance",
  "auditory_texture",
  "spatial_awareness",
  "aesthetic_sensitivity",
  // Domain 5: Temporal (3)
  "time_dilation",
  "flow",
  "duration_awareness",
  // Domain 6: Relational (3)
  "social_ease",
  "empathic_attunement",
  "environmental_connection",
  // Domain 7: Meaning (3)
  "significance",
  "perspective_shift",
  "integration_readiness",
] as const;

export type DimensionId = (typeof DIMENSION_IDS)[number];


