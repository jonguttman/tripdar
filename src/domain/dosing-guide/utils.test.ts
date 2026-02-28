import { describe, expect, it } from "vitest";
import {
  generateDosingGuideToken,
  formatDoseForCard,
  calculateAllDoseRanges,
} from "./utils";

describe("generateDosingGuideToken", () => {
  it("should generate a token starting with dg_", () => {
    const token = generateDosingGuideToken();
    expect(token.startsWith("dg_")).toBe(true);
  });

  it("should generate unique tokens", () => {
    const tokens = new Set(
      Array.from({ length: 100 }, () => generateDosingGuideToken())
    );
    expect(tokens.size).toBe(100);
  });

  it("should be 15 characters long (dg_ + 12 chars)", () => {
    const token = generateDosingGuideToken();
    expect(token.length).toBe(15);
  });
});

describe("formatDoseForCard", () => {
  it("should format microdose in mg only", () => {
    const result = formatDoseForCard(1, 50, 250);
    expect(result).toEqual({ primary: "50-250 mg", secondary: null });
  });

  it("should format mini-dose in grams with mg secondary", () => {
    const result = formatDoseForCard(2, 250, 750);
    expect(result).toEqual({
      primary: "0.25-0.75 g",
      secondary: "250-750 mg",
    });
  });

  it("should round grams to nearest 0.25", () => {
    const result = formatDoseForCard(2, 212, 637);
    expect(result).toEqual({
      primary: "0.25-0.75 g",
      secondary: "250-750 mg",
    });
  });

  it("should handle heroic dose ranges", () => {
    const result = formatDoseForCard(6, 4250, 6375);
    expect(result).toEqual({
      primary: "4.25-6.5 g",
      secondary: "4250-6500 mg",
    });
  });
});

describe("calculateAllDoseRanges", () => {
  it("should return 6 dose levels for gentle sensitivity", () => {
    const ranges = calculateAllDoseRanges("gentle");
    expect(ranges).toHaveLength(6);
    expect(ranges[0].name).toBe("Microdose");
    expect(ranges[0].lowMg).toBe(50);
    expect(ranges[0].highMg).toBe(250);
  });

  it("should apply medium sensitivity modifier (0.85x)", () => {
    const ranges = calculateAllDoseRanges("medium");
    expect(ranges[0].lowMg).toBeLessThan(50);
  });

  it("should apply very_steep sensitivity modifier (0.55x)", () => {
    const ranges = calculateAllDoseRanges("very_steep");
    const gentleRanges = calculateAllDoseRanges("gentle");
    for (let i = 0; i < 6; i++) {
      expect(ranges[i].highMg).toBeLessThan(gentleRanges[i].highMg);
    }
  });

  it("should include formatted display strings", () => {
    const ranges = calculateAllDoseRanges("gentle");
    expect(ranges[0].display.primary).toBe("50-250 mg");
    expect(ranges[0].display.secondary).toBeNull();
    expect(ranges[1].display.primary).toBe("0.25-0.75 g");
    expect(ranges[1].display.secondary).toBe("250-750 mg");
  });
});
