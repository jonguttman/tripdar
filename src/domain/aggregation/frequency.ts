/**
 * Tripdar Frequency Term Selection
 *
 * Meaning Layer v1.0 — Frequency terms are a closed set.
 * Thresholds are internal and MUST NOT be exposed.
 *
 * Source: tripdar-spec/TRIPDAR_AGGREGATION_LANGUAGE.md
 */

import type { FrequencyTerm } from "./types";

/**
 * Select frequency term based on proportion of dominant direction.
 *
 * Per TRIPDAR_AGGREGATION_LANGUAGE.md:
 * - commonly: Clear majority pattern; high confidence
 * - often: Strong presence; confident pattern
 * - sometimes: Present but not dominant
 * - occasionally: Minority pattern; low confidence
 * - rarely: Near-absent; very few signals
 *
 * Thresholds are conceptual and internal.
 * Numbers MUST NOT appear in output.
 */
export function selectFrequencyTerm(proportion: number): FrequencyTerm | null {
  // Per spec: thresholds are conceptual, not fixed percentages.
  // These values implement the spec's conceptual descriptions.

  if (proportion >= 0.7) {
    // "Clear majority pattern; high confidence"
    return "commonly";
  }

  if (proportion >= 0.5) {
    // "Strong presence; confident pattern"
    return "often";
  }

  if (proportion >= 0.35) {
    // "Present but not dominant"
    return "sometimes";
  }

  if (proportion >= 0.2) {
    // "Minority pattern; low confidence"
    return "occasionally";
  }

  if (proportion > 0) {
    // "Near-absent; very few signals"
    return "rarely";
  }

  // No signals for this direction
  return null;
}

/**
 * Determine if a proportion represents a "clear" dominant pattern.
 *
 * Per spec: "One direction clearly dominates"
 * If mixed or unclear → silence (NO_CLEAR_PATTERN)
 */
export function isClearDominance(proportion: number): boolean {
  // A direction must have at least 50% to be considered dominant.
  // Below this threshold, the pattern is "mixed or unclear" per spec.
  return proportion >= 0.5;
}

