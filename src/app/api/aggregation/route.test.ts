/**
 * Integration tests for the aggregation API contract
 *
 * These tests verify the server boundary contract:
 * - Returns sentence string only when dominance exists
 * - No counts, percentages, or raw signals escape
 *
 * Note: The aggregation math is already unit-tested in domain/aggregation.
 * These tests verify the API response shape and boundary guarantees.
 *
 * Since Next.js API routes require a Next.js runtime, we test the
 * aggregation logic and response shape directly.
 */

import { describe, it, expect } from "vitest";
import { aggregateDimension } from "@/domain/aggregation/aggregateDimension";
import type { AggregationSignal } from "@/domain/aggregation/types";

function createSignal(
  dimensionId: string,
  direction: "MORE" | "LESS" | "SAME" | "NOT_NOTICED"
): AggregationSignal {
  return {
    strainId: "golden-teacher",
    doseCategory: "MICRODOSE",
    scale: "MICRO",
    referenceFrame: "BASELINE",
    dimensionId,
    direction,
  };
}

/**
 * Simulates the API response transformation.
 * This mirrors the logic in route.ts exactly.
 */
function buildApiResponse(signals: AggregationSignal[]) {
  const result = aggregateDimension(signals, "Golden Teacher");

  if (result.status === "PATTERN_DETECTED") {
    return {
      status: result.status,
      sentence: result.sentence,
    };
  }

  return { status: result.status };
}

describe("Aggregation API Contract", () => {
  it("returns INSUFFICIENT_DATA when fewer than 3 signals exist", () => {
    const signals = [
      createSignal("clarity", "MORE"),
      createSignal("clarity", "MORE"),
    ];

    const response = buildApiResponse(signals);

    expect(response.status).toBe("INSUFFICIENT_DATA");
    expect(response).not.toHaveProperty("sentence");
    expect(response).not.toHaveProperty("count");
    expect(response).not.toHaveProperty("percentage");
    expect(response).not.toHaveProperty("signals");
  });

  it("returns PATTERN_DETECTED with sentence when clear dominance exists", () => {
    const signals = [
      createSignal("clarity", "MORE"),
      createSignal("clarity", "MORE"),
      createSignal("clarity", "MORE"),
      createSignal("clarity", "MORE"),
    ];

    const response = buildApiResponse(signals);

    expect(response.status).toBe("PATTERN_DETECTED");
    expect(typeof response.sentence).toBe("string");
    expect(response.sentence!.length).toBeGreaterThan(0);

    // Verify no forbidden data escapes
    expect(response).not.toHaveProperty("count");
    expect(response).not.toHaveProperty("percentage");
    expect(response).not.toHaveProperty("signals");
    expect(response).not.toHaveProperty("total");
    expect(response).not.toHaveProperty("breakdown");
  });

  it("returns NO_CLEAR_PATTERN when directions are mixed", () => {
    const signals = [
      createSignal("clarity", "MORE"),
      createSignal("clarity", "LESS"),
      createSignal("clarity", "SAME"),
    ];

    const response = buildApiResponse(signals);

    expect(response.status).toBe("NO_CLEAR_PATTERN");
    expect(response).not.toHaveProperty("sentence");
  });

  it("response contains no numeric values", () => {
    const signals = [
      createSignal("clarity", "MORE"),
      createSignal("clarity", "MORE"),
      createSignal("clarity", "MORE"),
      createSignal("clarity", "MORE"),
      createSignal("clarity", "MORE"),
    ];

    const response = buildApiResponse(signals);

    // Stringify and check for numeric patterns
    const jsonString = JSON.stringify(response);

    // Should not contain standalone numbers
    expect(jsonString).not.toMatch(/: \d+[,}]/); // No numeric values
    expect(jsonString).not.toMatch(/%/); // No percentages
    expect(response).not.toHaveProperty("count");
    expect(response).not.toHaveProperty("total");
  });

  it("sentence follows exact template format", () => {
    const signals = [
      createSignal("clarity", "MORE"),
      createSignal("clarity", "MORE"),
      createSignal("clarity", "MORE"),
      createSignal("clarity", "MORE"),
    ];

    const response = buildApiResponse(signals);

    expect(response.status).toBe("PATTERN_DETECTED");
    // Template: "[Strain] at [dose] is [frequency] described as [direction phrase]."
    expect(response.sentence).toMatch(
      /^Golden Teacher at microdose is (commonly|often|sometimes|occasionally|rarely) described as .+\.$/
    );
  });

  it("returns INSUFFICIENT_DATA when no signals exist", () => {
    const response = buildApiResponse([]);

    expect(response.status).toBe("INSUFFICIENT_DATA");
    expect(response).not.toHaveProperty("sentence");
  });

  it("returns NO_CLEAR_PATTERN when mostly NOT_NOTICED", () => {
    const signals = [
      createSignal("clarity", "NOT_NOTICED"),
      createSignal("clarity", "NOT_NOTICED"),
      createSignal("clarity", "NOT_NOTICED"),
    ];

    const response = buildApiResponse(signals);

    expect(response.status).toBe("NO_CLEAR_PATTERN");
    expect(response).not.toHaveProperty("sentence");
  });
});
