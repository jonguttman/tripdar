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
  "Clarity",
  "Fluidity",
  "Introspection",
  "Presence",
  "Novelty",
  // Domain 2: Emotional (5)
  "Openness",
  "Calm",
  "Sensitivity",
  "Warmth",
  "Depth",
  // Domain 3: Somatic (5)
  "Body Awareness",
  "Energy",
  "Relaxation",
  "Groundedness",
  "Sensory Acuity",
  // Domain 4: Perceptual (4)
  "Visual Nuance",
  "Auditory Texture",
  "Spatial Awareness",
  "Aesthetic Sensitivity",
  // Domain 5: Temporal (3)
  "Time Dilation",
  "Flow",
  "Duration Awareness",
  // Domain 6: Relational (3)
  "Social Ease",
  "Empathic Attunement",
  "Environmental Connection",
  // Domain 7: Meaning (3)
  "Significance",
  "Perspective Shift",
  "Integration Readiness",
] as const;

export type DimensionId = (typeof DIMENSION_IDS)[number];


