/**
 * Tripdar Aggregation Engine
 *
 * Meaning Layer v1.0 — Aggregation produces language, not metrics.
 *
 * This module is read-only:
 * - Reads existing Signal[]
 * - Produces pattern language only
 * - Does not store aggregation results
 * - Does not mutate signals
 * - Does not infer outcomes, benefits, or recommendations
 */

// Types
export type {
  AggregationResult,
  AggregationStatus,
  AggregationSignal,
  Direction,
  FrequencyTerm,
} from "./types";

export { ACTIVE_DIRECTIONS } from "./types";

// Aggregation
export { aggregateDimension } from "./aggregateDimension";

// Phrases (for testing/validation only)
export { DIMENSION_PHRASES, getDirectionPhrase } from "./phrases";

// Frequency (for testing/validation only)
export { selectFrequencyTerm, isClearDominance } from "./frequency";

