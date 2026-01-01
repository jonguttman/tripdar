/**
 * Tripdar Dimension Aggregation
 *
 * Meaning Layer v1.0 — Aggregation produces language, not metrics.
 *
 * This module:
 * - Reads existing Signal[]
 * - Produces pattern language only
 * - Does not store aggregation results
 * - Does not mutate signals
 * - Does not infer outcomes, benefits, or recommendations
 *
 * Source: tripdar-spec/TRIPDAR_AGGREGATION_LANGUAGE.md
 * Source: tripdar-spec/TRIPDAR_SIGNAL_MODEL.md
 */

import type {
  AggregationResult,
  AggregationSignal,
  Direction,
} from "./types";
import { ACTIVE_DIRECTIONS } from "./types";
import { getDirectionPhrase } from "./phrases";
import { selectFrequencyTerm, isClearDominance } from "./frequency";

/**
 * Minimum signals required before Tripdar speaks.
 * Per spec: "At least 3 signals for the same dimension, same strain × dose × scale × reference"
 */
const MINIMUM_SIGNALS = 3;

/**
 * Dose category display names.
 * Used in sentence templates only.
 */
const DOSE_DISPLAY: Record<string, string> = {
  MICRODOSE: "microdose",
  LOW: "low dose",
  MODERATE: "moderate dose",
  HIGH: "high dose",
};

/**
 * Aggregate signals for a single dimension.
 *
 * Input requirements (per spec):
 * - All signals MUST have the same strainId, doseCategory, scale, referenceFrame, dimensionId
 * - Caller is responsible for filtering
 *
 * Speaking rules (per spec):
 * 1. Minimum 3 signals
 * 2. Only MORE, LESS, SAME count (NOT_NOTICED does not establish direction)
 * 3. One direction must clearly dominate
 *
 * If any condition fails → silence (INSUFFICIENT_DATA or NO_CLEAR_PATTERN)
 */
export function aggregateDimension(
  signals: readonly AggregationSignal[],
  strainName: string
): AggregationResult {
  // Validate input: signals must not be empty and must share context
  if (signals.length === 0) {
    return insufficientData(signals[0]?.dimensionId ?? "unknown");
  }

  const dimensionId = signals[0].dimensionId;
  const doseCategory = signals[0].doseCategory;

  // Rule 1: Minimum signals
  if (signals.length < MINIMUM_SIGNALS) {
    return insufficientData(dimensionId);
  }

  // Count directions (only active directions count toward pattern)
  const counts = countDirections(signals);
  const activeTotal = counts.MORE + counts.LESS + counts.SAME;

  // Rule 2: Must have active observations (NOT_NOTICED doesn't count)
  if (activeTotal === 0) {
    return noClearPattern(dimensionId);
  }

  // Find dominant direction
  const dominant = findDominantDirection(counts);
  if (!dominant) {
    return noClearPattern(dimensionId);
  }

  // Rule 3: Dominant direction must be clear
  const proportion = counts[dominant.direction] / activeTotal;
  if (!isClearDominance(proportion)) {
    return noClearPattern(dimensionId);
  }

  // Get frequency term
  const frequencyTerm = selectFrequencyTerm(proportion);
  if (!frequencyTerm) {
    return noClearPattern(dimensionId);
  }

  // Get direction phrase
  const directionPhrase = getDirectionPhrase(dimensionId, dominant.direction);
  if (!directionPhrase) {
    return noClearPattern(dimensionId);
  }

  // Build sentence using template from TRIPDAR_AGGREGATION_LANGUAGE.md:
  // "[Strain] at [dose category] is [frequency term] described as [direction phrase]."
  const doseDisplay = DOSE_DISPLAY[doseCategory] ?? doseCategory.toLowerCase();
  const sentence = `${strainName} at ${doseDisplay} is ${frequencyTerm} described as ${directionPhrase}.`;

  return {
    dimensionId,
    status: "PATTERN_DETECTED",
    sentence,
  };
}

/**
 * Count signals by direction.
 * NOT_NOTICED is counted but does not contribute to pattern detection.
 */
function countDirections(
  signals: readonly AggregationSignal[]
): Record<Direction, number> {
  const counts: Record<Direction, number> = {
    MORE: 0,
    LESS: 0,
    SAME: 0,
    NOT_NOTICED: 0,
  };

  for (const signal of signals) {
    const dir = signal.direction as Direction;
    if (dir in counts) {
      counts[dir]++;
    }
  }

  return counts;
}

/**
 * Find the direction with the highest count among active directions.
 * Returns null if no active signals exist.
 */
function findDominantDirection(
  counts: Record<Direction, number>
): { direction: Direction; count: number } | null {
  let dominant: { direction: Direction; count: number } | null = null;

  for (const dir of ACTIVE_DIRECTIONS) {
    const count = counts[dir];
    if (count > 0 && (!dominant || count > dominant.count)) {
      dominant = { direction: dir, count };
    }
  }

  return dominant;
}

/**
 * Return INSUFFICIENT_DATA result.
 * Per spec: sentence MUST be null unless status = PATTERN_DETECTED
 */
function insufficientData(dimensionId: string): AggregationResult {
  return {
    dimensionId,
    status: "INSUFFICIENT_DATA",
    sentence: null,
  };
}

/**
 * Return NO_CLEAR_PATTERN result.
 * Per spec: sentence MUST be null unless status = PATTERN_DETECTED
 */
function noClearPattern(dimensionId: string): AggregationResult {
  return {
    dimensionId,
    status: "NO_CLEAR_PATTERN",
    sentence: null,
  };
}

