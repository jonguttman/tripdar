/**
 * Tripdar Aggregation Types
 *
 * Meaning Layer v1.0 — Aggregation produces language, not metrics.
 * These types define the shape of aggregation output only.
 * No new meaning is introduced here.
 */

/**
 * Aggregation status per Meaning Layer v1.0:
 * - INSUFFICIENT_DATA: Not enough signals to establish pattern confidence
 * - NO_CLEAR_PATTERN: Signals exist but no dominant direction emerges
 * - PATTERN_DETECTED: A clear pattern exists and can be expressed in language
 */
export type AggregationStatus =
  | "INSUFFICIENT_DATA"
  | "NO_CLEAR_PATTERN"
  | "PATTERN_DETECTED";

/**
 * The result of aggregating signals for a single dimension.
 *
 * Per spec:
 * - sentence MUST be null unless status = PATTERN_DETECTED
 * - UI must render output verbatim
 */
export interface AggregationResult {
  readonly dimensionId: string;
  readonly status: AggregationStatus;
  readonly sentence: string | null;
}

/**
 * Direction values from Signal schema.
 * Only MORE, LESS, SAME establish direction.
 * NOT_NOTICED does NOT establish direction (per spec).
 */
export type Direction = "MORE" | "LESS" | "SAME" | "NOT_NOTICED";

/**
 * Directions that count toward pattern detection.
 * NOT_NOTICED is explicitly excluded per spec.
 */
export const ACTIVE_DIRECTIONS: readonly Direction[] = ["MORE", "LESS", "SAME"] as const;

/**
 * Frequency terms — closed set per Meaning Layer v1.0.
 * No modifiers allowed ("very", "mostly", etc.).
 */
export type FrequencyTerm =
  | "commonly"
  | "often"
  | "sometimes"
  | "occasionally"
  | "rarely";

/**
 * Minimal signal shape for aggregation.
 * Aggregation MUST NOT read fields beyond these.
 * Note: direction is string to match Prisma's SQLite output.
 */
export interface AggregationSignal {
  readonly strainId: string;
  readonly doseCategory: string;
  readonly scale: string;
  readonly referenceFrame: string;
  readonly dimensionId: string;
  readonly direction: string;
}

