/**
 * Tripdar Aggregation Engine
 * 
 * Transforms signals into pattern language.
 * 
 * Per spec:
 * - Aggregation produces descriptive language, not metrics
 * - Uses frequency terms (commonly, often, sometimes, occasionally, rarely)
 * - Uses direction terms (more/less/similar [dimension] than usual)
 * - Never outputs percentages, counts, averages, or rankings
 * - Never uses evaluative or magnitude language
 */

import { Signal, Dimension, Direction, VALID_DIMENSIONS, FIXED_CONTEXT } from "./signal";
import { filterByDimension, countByDirection } from "./store";

// =============================================================================
// AGGREGATION LANGUAGE VOCABULARY
// =============================================================================

/**
 * Frequency terms per spec.
 * These describe how often a pattern appears in signals.
 */
export type FrequencyTerm = "commonly" | "often" | "sometimes" | "occasionally" | "rarely";

/**
 * Maps a proportion to a frequency term.
 * Per spec: thresholds are conceptual, based on signal density.
 */
function proportionToFrequencyTerm(proportion: number): FrequencyTerm | null {
  if (proportion >= 0.7) return "commonly";
  if (proportion >= 0.5) return "often";
  if (proportion >= 0.3) return "sometimes";
  if (proportion >= 0.15) return "occasionally";
  if (proportion > 0) return "rarely";
  return null; // No pattern
}

/**
 * Maps a direction to compliant direction language.
 * Per spec: "More [dimension] than usual" / "Less [dimension] than usual" / "Similar to usual"
 */
function directionToPhrase(direction: Direction, dimension: Dimension): string {
  switch (direction) {
    case "More":
      return `more ${dimension.toLowerCase()} than usual`;
    case "Less":
      return `less ${dimension.toLowerCase()} than usual`;
    case "Same":
      return `similar ${dimension.toLowerCase()} to usual`;
    case "Not noticed":
      // "Not noticed" is informative but not pattern-bearing for output
      return `${dimension.toLowerCase()} not noticed`;
  }
}

// =============================================================================
// MINIMUM SIGNAL REQUIREMENTS
// =============================================================================

/**
 * Minimum signals required before Tripdar speaks about patterns.
 * Per spec: "Tripdar does not speak about patterns until sufficient signals exist."
 */
const MINIMUM_SIGNALS_TO_SPEAK = 3;

/**
 * The insufficient data message per spec.
 * "This is the only valid 'insufficient data' message. It is not an apology; it is a boundary."
 */
function insufficientDataMessage(dimension: Dimension): string {
  return `Not enough reports yet to describe patterns for ${FIXED_CONTEXT.strain} at ${FIXED_CONTEXT.dose.toLowerCase()}.`;
}

// =============================================================================
// AGGREGATION RESULT TYPES
// =============================================================================

export interface DimensionAggregation {
  readonly dimension: Dimension;
  readonly canSpeak: boolean;
  readonly sentence: string;
  readonly signalCount: number;
}

export interface FullAggregation {
  readonly strain: string;
  readonly dose: string;
  readonly dimensions: readonly DimensionAggregation[];
  readonly compositeSentence: string | null;
}

// =============================================================================
// SINGLE DIMENSION AGGREGATION
// =============================================================================

/**
 * Aggregates signals for a single dimension.
 * Produces a compliant pattern language sentence.
 * 
 * Template per spec:
 * "[Strain] at [dose category] is [frequency term] described as [direction term] [dimension]."
 */
export function aggregateDimension(
  signals: readonly Signal[],
  dimension: Dimension
): DimensionAggregation {
  const dimensionSignals = filterByDimension(signals, dimension);
  const signalCount = dimensionSignals.length;

  // Check minimum signal requirement
  if (signalCount < MINIMUM_SIGNALS_TO_SPEAK) {
    return {
      dimension,
      canSpeak: false,
      sentence: insufficientDataMessage(dimension),
      signalCount,
    };
  }

  // Count directions
  const counts = countByDirection(signals, dimension);

  // Filter to active observations (More, Less, Same)
  // "Not noticed" is informative but not pattern-bearing for output
  const activeCount = counts["More"] + counts["Less"] + counts["Same"];

  if (activeCount === 0) {
    return {
      dimension,
      canSpeak: false,
      sentence: insufficientDataMessage(dimension),
      signalCount,
    };
  }

  // Find dominant direction among active observations
  const activeDirections: Direction[] = ["More", "Less", "Same"];
  let dominantDirection: Direction = "Same";
  let dominantCount = 0;

  for (const dir of activeDirections) {
    if (counts[dir] > dominantCount) {
      dominantDirection = dir;
      dominantCount = counts[dir];
    }
  }

  // Calculate proportion and determine frequency term
  const proportion = dominantCount / activeCount;
  const frequencyTerm = proportionToFrequencyTerm(proportion);

  if (frequencyTerm === null) {
    return {
      dimension,
      canSpeak: false,
      sentence: insufficientDataMessage(dimension),
      signalCount,
    };
  }

  // Build compliant sentence
  const directionPhrase = directionToPhrase(dominantDirection, dimension);
  const sentence = `${FIXED_CONTEXT.strain} at ${FIXED_CONTEXT.dose.toLowerCase()} is ${frequencyTerm} described as ${directionPhrase}.`;

  return {
    dimension,
    canSpeak: true,
    sentence,
    signalCount,
  };
}

// =============================================================================
// FULL AGGREGATION (ALL DIMENSIONS)
// =============================================================================

/**
 * Aggregates signals across all prototype dimensions.
 * Produces individual dimension sentences plus a composite profile if possible.
 */
export function aggregateAll(signals: readonly Signal[]): FullAggregation {
  const dimensions = VALID_DIMENSIONS.map((dim) => aggregateDimension(signals, dim));

  // Build composite sentence if we have enough speaking dimensions
  const speakingDimensions = dimensions.filter((d) => d.canSpeak);
  let compositeSentence: string | null = null;

  if (speakingDimensions.length >= 2) {
    // Composite profile template per spec:
    // "[Strain] at [dose] is characterized by [primary dimensions]."
    const dimensionList = speakingDimensions.map((d) => d.dimension.toLowerCase()).join(" and ");
    compositeSentence = `${FIXED_CONTEXT.strain} at ${FIXED_CONTEXT.dose.toLowerCase()} is notable for ${dimensionList}.`;
  }

  return {
    strain: FIXED_CONTEXT.strain,
    dose: FIXED_CONTEXT.dose,
    dimensions,
    compositeSentence,
  };
}

// =============================================================================
// COMPLIANCE VERIFICATION
// =============================================================================

/**
 * Forbidden language patterns per spec.
 * Used to verify aggregation output is compliant.
 */
const FORBIDDEN_PATTERNS = [
  // Evaluative language
  /\bbest\s+for\b/i,
  /\bmost\s+effective\b/i,
  /\brecommended\b/i,
  /\bideal\b/i,
  /\bsuperior\b/i,
  
  // Magnitude language
  /\bvery\b/i,
  /\bextremely\b/i,
  /\bstrongly\b/i,
  /\bsignificantly\b/i,
  /\bdramatically\b/i,
  /\bintense\b/i,
  /\bpowerful\b/i,
  
  // Numeric language
  /\d+%/,
  /\d+\s+out\s+of\s+\d+/i,
  /\bmost\s+people\b/i,
  /\bthe\s+majority\b/i,
  /\d+\s+(users?|reports?|people)/i,
  
  // Outcome language
  /\bworks\s+for\b/i,
  /\bhelps\s+with\b/i,
  /\bimproves?\b/i,
  /\btreats?\b/i,
  /\bcures?\b/i,
];

/**
 * Verifies that a sentence contains no forbidden language.
 * Returns list of violations found.
 */
export function checkCompliance(sentence: string): readonly string[] {
  const violations: string[] = [];

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(sentence)) {
      violations.push(`Contains forbidden pattern: ${pattern.source}`);
    }
  }

  return violations;
}

/**
 * Verifies an entire aggregation result is compliant.
 */
export function verifyAggregationCompliance(aggregation: FullAggregation): boolean {
  for (const dim of aggregation.dimensions) {
    const violations = checkCompliance(dim.sentence);
    if (violations.length > 0) {
      console.error(`Compliance violation in ${dim.dimension}:`, violations);
      return false;
    }
  }

  if (aggregation.compositeSentence) {
    const violations = checkCompliance(aggregation.compositeSentence);
    if (violations.length > 0) {
      console.error("Compliance violation in composite:", violations);
      return false;
    }
  }

  return true;
}

