/**
 * Tripdar API Client
 *
 * Minimal fetch layer for server communication.
 * No transformation, caching, or interpretation.
 * Returns raw JSON exactly as received.
 */

/**
 * Signal creation input.
 * All fields required per Meaning Layer v1.0.
 */
export interface SignalInput {
  strainId: string;
  doseCategory: string;
  scale: string;
  referenceFrame: string;
  dimensionId: string;
  direction: string;
  sessionId: string;
  reportId: string;
}

/**
 * Server response for signal creation.
 */
export type CreateSignalResponse = { id: string } | { error: string };

/**
 * Server response for aggregation.
 */
export type AggregationResponse =
  | { status: "INSUFFICIENT_DATA" }
  | { status: "NO_CLEAR_PATTERN" }
  | { status: "PATTERN_DETECTED"; sentence: string };

/**
 * POST /api/signals
 * Creates a signal via server domain guard.
 * Returns raw JSON exactly as received.
 */
export async function createSignal(
  input: SignalInput
): Promise<CreateSignalResponse> {
  const res = await fetch("/api/signals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json();
}

/**
 * GET /api/aggregation
 * Fetches aggregation for a dimension.
 * Returns raw JSON exactly as received.
 */
export async function getAggregation(
  dimensionId: string
): Promise<AggregationResponse> {
  const res = await fetch(`/api/aggregation?dimensionId=${encodeURIComponent(dimensionId)}`);
  return res.json();
}

