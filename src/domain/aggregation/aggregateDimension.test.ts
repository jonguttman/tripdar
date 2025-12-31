/**
 * Tripdar Aggregation Engine Tests
 *
 * Meaning Layer v1.0 — These tests prove:
 * 1. ❌ < 3 signals → INSUFFICIENT_DATA
 * 2. ❌ Mixed directions → NO_CLEAR_PATTERN
 * 3. ❌ Mostly NOT_NOTICED → NO_CLEAR_PATTERN
 * 4. ✅ Clear dominance → valid sentence
 * 5. ❌ No sentence returned when silent
 * 6. ❌ No numbers or forbidden terms appear in output
 * 7. ❌ No mutation of input signals
 *
 * Tests assert exact string matches per spec.
 */

import { describe, it, expect } from "vitest";
import { aggregateDimension } from "./aggregateDimension";
import type { AggregationSignal } from "./types";

// Helper to create test signals
function createSignal(
  direction: AggregationSignal["direction"],
  overrides: Partial<AggregationSignal> = {}
): AggregationSignal {
  return {
    strainId: "golden_teacher",
    doseCategory: "MICRODOSE",
    scale: "MICRO",
    referenceFrame: "BASELINE",
    dimensionId: "clarity",
    direction,
    ...overrides,
  };
}

describe("aggregateDimension", () => {
  // -------------------------------------------------------------------------
  // 1. ❌ < 3 signals → INSUFFICIENT_DATA
  // -------------------------------------------------------------------------
  describe("minimum signal requirement", () => {
    it("returns INSUFFICIENT_DATA for 0 signals", () => {
      const result = aggregateDimension([], "Golden Teacher");
      expect(result.status).toBe("INSUFFICIENT_DATA");
      expect(result.sentence).toBeNull();
    });

    it("returns INSUFFICIENT_DATA for 1 signal", () => {
      const signals = [createSignal("MORE")];
      const result = aggregateDimension(signals, "Golden Teacher");
      expect(result.status).toBe("INSUFFICIENT_DATA");
      expect(result.sentence).toBeNull();
    });

    it("returns INSUFFICIENT_DATA for 2 signals", () => {
      const signals = [createSignal("MORE"), createSignal("MORE")];
      const result = aggregateDimension(signals, "Golden Teacher");
      expect(result.status).toBe("INSUFFICIENT_DATA");
      expect(result.sentence).toBeNull();
    });

    it("allows aggregation with exactly 3 signals", () => {
      const signals = [
        createSignal("MORE"),
        createSignal("MORE"),
        createSignal("MORE"),
      ];
      const result = aggregateDimension(signals, "Golden Teacher");
      expect(result.status).toBe("PATTERN_DETECTED");
      expect(result.sentence).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 2. ❌ Mixed directions → NO_CLEAR_PATTERN
  // -------------------------------------------------------------------------
  describe("directional coherence", () => {
    it("returns NO_CLEAR_PATTERN when directions are evenly split", () => {
      const signals = [
        createSignal("MORE"),
        createSignal("LESS"),
        createSignal("SAME"),
      ];
      const result = aggregateDimension(signals, "Golden Teacher");
      expect(result.status).toBe("NO_CLEAR_PATTERN");
      expect(result.sentence).toBeNull();
    });

    it("returns NO_CLEAR_PATTERN when no direction dominates (40/40/20)", () => {
      const signals = [
        createSignal("MORE"),
        createSignal("MORE"),
        createSignal("LESS"),
        createSignal("LESS"),
        createSignal("SAME"),
      ];
      const result = aggregateDimension(signals, "Golden Teacher");
      expect(result.status).toBe("NO_CLEAR_PATTERN");
      expect(result.sentence).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 3. ❌ Mostly NOT_NOTICED → NO_CLEAR_PATTERN
  // -------------------------------------------------------------------------
  describe("NOT_NOTICED handling", () => {
    it("returns NO_CLEAR_PATTERN when all signals are NOT_NOTICED", () => {
      const signals = [
        createSignal("NOT_NOTICED"),
        createSignal("NOT_NOTICED"),
        createSignal("NOT_NOTICED"),
      ];
      const result = aggregateDimension(signals, "Golden Teacher");
      expect(result.status).toBe("NO_CLEAR_PATTERN");
      expect(result.sentence).toBeNull();
    });

    it("returns NO_CLEAR_PATTERN when mostly NOT_NOTICED with no clear active pattern", () => {
      // 3 NOT_NOTICED + 1 MORE + 1 LESS + 1 SAME = evenly split active signals
      const signals = [
        createSignal("NOT_NOTICED"),
        createSignal("NOT_NOTICED"),
        createSignal("NOT_NOTICED"),
        createSignal("MORE"),
        createSignal("LESS"),
        createSignal("SAME"),
      ];
      const result = aggregateDimension(signals, "Golden Teacher");
      expect(result.status).toBe("NO_CLEAR_PATTERN");
      expect(result.sentence).toBeNull();
    });

    it("detects pattern when active signals dominate despite NOT_NOTICED presence", () => {
      const signals = [
        createSignal("MORE"),
        createSignal("MORE"),
        createSignal("MORE"),
        createSignal("NOT_NOTICED"),
      ];
      const result = aggregateDimension(signals, "Golden Teacher");
      expect(result.status).toBe("PATTERN_DETECTED");
      expect(result.sentence).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 4. ✅ Clear dominance → valid sentence
  // -------------------------------------------------------------------------
  describe("pattern detection", () => {
    it("produces valid sentence for clear MORE dominance", () => {
      const signals = [
        createSignal("MORE"),
        createSignal("MORE"),
        createSignal("MORE"),
      ];
      const result = aggregateDimension(signals, "Golden Teacher");
      expect(result.status).toBe("PATTERN_DETECTED");
      expect(result.sentence).toBe(
        "Golden Teacher at microdose is commonly described as more clarity than usual."
      );
    });

    it("produces valid sentence for clear LESS dominance", () => {
      const signals = [
        createSignal("LESS"),
        createSignal("LESS"),
        createSignal("LESS"),
      ];
      const result = aggregateDimension(signals, "Golden Teacher");
      expect(result.status).toBe("PATTERN_DETECTED");
      expect(result.sentence).toBe(
        "Golden Teacher at microdose is commonly described as less clarity than usual."
      );
    });

    it("produces valid sentence for clear SAME dominance", () => {
      const signals = [
        createSignal("SAME"),
        createSignal("SAME"),
        createSignal("SAME"),
      ];
      const result = aggregateDimension(signals, "Golden Teacher");
      expect(result.status).toBe("PATTERN_DETECTED");
      expect(result.sentence).toBe(
        "Golden Teacher at microdose is commonly described as similar clarity to usual."
      );
    });

    it("uses 'often' for moderate dominance (60%)", () => {
      const signals = [
        createSignal("MORE"),
        createSignal("MORE"),
        createSignal("MORE"),
        createSignal("LESS"),
        createSignal("SAME"),
      ];
      const result = aggregateDimension(signals, "Golden Teacher");
      expect(result.status).toBe("PATTERN_DETECTED");
      expect(result.sentence).toBe(
        "Golden Teacher at microdose is often described as more clarity than usual."
      );
    });

    it("handles different dose categories", () => {
      const signals = [
        createSignal("MORE", { doseCategory: "MODERATE" }),
        createSignal("MORE", { doseCategory: "MODERATE" }),
        createSignal("MORE", { doseCategory: "MODERATE" }),
      ];
      const result = aggregateDimension(signals, "Penis Envy");
      expect(result.status).toBe("PATTERN_DETECTED");
      expect(result.sentence).toBe(
        "Penis Envy at moderate dose is commonly described as more clarity than usual."
      );
    });

    it("handles different dimensions", () => {
      const signals = [
        createSignal("MORE", { dimensionId: "calm" }),
        createSignal("MORE", { dimensionId: "calm" }),
        createSignal("MORE", { dimensionId: "calm" }),
      ];
      const result = aggregateDimension(signals, "Golden Teacher");
      expect(result.status).toBe("PATTERN_DETECTED");
      expect(result.sentence).toBe(
        "Golden Teacher at microdose is commonly described as more calm than usual."
      );
    });
  });

  // -------------------------------------------------------------------------
  // 5. ❌ No sentence returned when silent
  // -------------------------------------------------------------------------
  describe("silence rules", () => {
    it("sentence is null for INSUFFICIENT_DATA", () => {
      const signals = [createSignal("MORE")];
      const result = aggregateDimension(signals, "Golden Teacher");
      expect(result.status).toBe("INSUFFICIENT_DATA");
      expect(result.sentence).toBeNull();
    });

    it("sentence is null for NO_CLEAR_PATTERN", () => {
      const signals = [
        createSignal("MORE"),
        createSignal("LESS"),
        createSignal("SAME"),
      ];
      const result = aggregateDimension(signals, "Golden Teacher");
      expect(result.status).toBe("NO_CLEAR_PATTERN");
      expect(result.sentence).toBeNull();
    });

    it("sentence is ONLY present for PATTERN_DETECTED", () => {
      const signals = [
        createSignal("MORE"),
        createSignal("MORE"),
        createSignal("MORE"),
      ];
      const result = aggregateDimension(signals, "Golden Teacher");
      expect(result.status).toBe("PATTERN_DETECTED");
      expect(result.sentence).not.toBeNull();
      expect(typeof result.sentence).toBe("string");
    });
  });

  // -------------------------------------------------------------------------
  // 6. ❌ No numbers or forbidden terms appear in output
  // -------------------------------------------------------------------------
  describe("forbidden language", () => {
    const forbiddenPatterns = [
      // Numbers
      /\d+%/,
      /\d+\s+out\s+of/i,
      /\d+\s+(signals?|reports?|users?)/i,
      // Forbidden terms from TRIPDAR_AGGREGATION_LANGUAGE.md
      /\bbest\b/i,
      /\bmost effective\b/i,
      /\brecommended\b/i,
      /\bideal\b/i,
      /\bsuperior\b/i,
      /\bvery\b/i,
      /\bextremely\b/i,
      /\bstrongly\b/i,
      /\bsignificantly\b/i,
      /\bdramatically\b/i,
      /\bworks\b/i,
      /\bhelps\b/i,
      /\bimproves\b/i,
      /\btreats\b/i,
      /\bcures\b/i,
      /\bbenefits\b/i,
      /\beffectiveness\b/i,
      /\bstrongest\b/i,
      /\boptimal\b/i,
    ];

    it("detected pattern sentence contains no forbidden terms", () => {
      const signals = [
        createSignal("MORE"),
        createSignal("MORE"),
        createSignal("MORE"),
      ];
      const result = aggregateDimension(signals, "Golden Teacher");

      expect(result.sentence).not.toBeNull();
      for (const pattern of forbiddenPatterns) {
        expect(result.sentence).not.toMatch(pattern);
      }
    });

    it("sentence uses only allowed frequency terms", () => {
      const allowedTerms = [
        "commonly",
        "often",
        "sometimes",
        "occasionally",
        "rarely",
      ];
      const signals = [
        createSignal("MORE"),
        createSignal("MORE"),
        createSignal("MORE"),
      ];
      const result = aggregateDimension(signals, "Golden Teacher");

      expect(result.sentence).not.toBeNull();
      const hasAllowedTerm = allowedTerms.some((term) =>
        result.sentence!.includes(term)
      );
      expect(hasAllowedTerm).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 7. ❌ No mutation of input signals
  // -------------------------------------------------------------------------
  describe("immutability", () => {
    it("does not mutate input signals", () => {
      const originalSignals = [
        createSignal("MORE"),
        createSignal("MORE"),
        createSignal("MORE"),
      ];
      const signalsCopy = JSON.stringify(originalSignals);

      aggregateDimension(originalSignals, "Golden Teacher");

      expect(JSON.stringify(originalSignals)).toBe(signalsCopy);
    });

    it("does not modify signal properties", () => {
      const signals = [
        createSignal("MORE"),
        createSignal("MORE"),
        createSignal("MORE"),
      ];
      const originalDirection = signals[0].direction;

      aggregateDimension(signals, "Golden Teacher");

      expect(signals[0].direction).toBe(originalDirection);
    });
  });

  // -------------------------------------------------------------------------
  // Additional edge cases
  // -------------------------------------------------------------------------
  describe("edge cases", () => {
    it("handles unknown dimension gracefully", () => {
      const signals = [
        createSignal("MORE", { dimensionId: "unknown_dimension" }),
        createSignal("MORE", { dimensionId: "unknown_dimension" }),
        createSignal("MORE", { dimensionId: "unknown_dimension" }),
      ];
      const result = aggregateDimension(signals, "Golden Teacher");
      // Unknown dimension has no phrase map → NO_CLEAR_PATTERN
      expect(result.status).toBe("NO_CLEAR_PATTERN");
      expect(result.sentence).toBeNull();
    });

    it("preserves dimensionId in result", () => {
      const signals = [
        createSignal("MORE", { dimensionId: "presence" }),
        createSignal("MORE", { dimensionId: "presence" }),
        createSignal("MORE", { dimensionId: "presence" }),
      ];
      const result = aggregateDimension(signals, "Golden Teacher");
      expect(result.dimensionId).toBe("presence");
    });
  });
});

