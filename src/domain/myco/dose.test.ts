import { describe, expect, it } from "vitest";
import {
  computeDoseGuidance,
  resolveTierCategory,
  type DoseProductInput,
  type DoseIntensity,
} from "./dose";
import type { ExperienceLevel } from "@/domain/recommendation-engine/types";

const EXPERIENCES: ExperienceLevel[] = ["new", "few_times", "experienced", "very_experienced"];
const INTENSITIES: DoseIntensity[] = ["gentle", "moderate", "deep"];

function productWithTiers(): DoseProductInput {
  return {
    format: "capsule",
    productUnitMg: 100,
    brandDoseTiers: [
      { category: "micro", label: "Micro", quantityText: "1", quantityMin: 1, quantityMax: null, unit: "capsule" },
      { category: "mini", label: "Mini", quantityText: "2-3", quantityMin: 2, quantityMax: 3, unit: "capsule" },
      { category: "macro", label: "Macro", quantityText: "5-8", quantityMin: 5, quantityMax: 8, unit: "capsule" },
    ],
    brandMicroUnits: null,
    brandMiniUnits: null,
    brandMacroUnits: null,
    strengthOffset: "standard",
  };
}

describe("resolveTierCategory (the predictable curve)", () => {
  it("is deterministic across the full experience x intensity matrix", () => {
    const expected: Record<ExperienceLevel, Record<DoseIntensity, string>> = {
      new: { gentle: "micro", moderate: "micro", deep: "mini" },
      few_times: { gentle: "micro", moderate: "mini", deep: "macro" },
      experienced: { gentle: "micro", moderate: "mini", deep: "macro" },
      very_experienced: { gentle: "micro", moderate: "mini", deep: "macro" },
    };
    for (const experience of EXPERIENCES) {
      for (const intensity of INTENSITIES) {
        expect(resolveTierCategory(experience, intensity).category).toBe(
          expected[experience][intensity]
        );
      }
    }
  });

  it("flags the stepped path when experience caps the requested depth", () => {
    expect(resolveTierCategory("new", "deep").stepped).toBe(true);
    expect(resolveTierCategory("new", "moderate").stepped).toBe(true);
    expect(resolveTierCategory("new", "gentle").stepped).toBe(false);
    expect(resolveTierCategory("experienced", "deep").stepped).toBe(false);
  });
});

describe("computeDoseGuidance", () => {
  it("uses the brand tier for the resolved rung with units and mg range", () => {
    const guidance = computeDoseGuidance(productWithTiers(), "experienced", "moderate");
    expect(guidance).not.toBeNull();
    expect(guidance!.tierCategory).toBe("mini");
    expect(guidance!.unitsText).toBe("2–3 capsules");
    expect(guidance!.mgLow).toBe(200);
    expect(guidance!.mgHigh).toBe(300);
    expect(guidance!.guidanceText).toContain("typical");
    expect(guidance!.guidanceText).not.toContain("we recommend");
  });

  it("steps DOWN to the nearest defined tier when the target rung is missing", () => {
    const product = productWithTiers();
    product.brandDoseTiers = [
      { category: "micro", label: "Micro", quantityText: "1", quantityMin: 1, quantityMax: null, unit: "capsule" },
    ];
    const guidance = computeDoseGuidance(product, "experienced", "deep");
    expect(guidance!.tierCategory).toBe("micro");
  });

  it("falls back to legacy brand units when no structured tiers exist", () => {
    const product: DoseProductInput = {
      ...productWithTiers(),
      brandDoseTiers: null,
      brandMicroUnits: 1,
      brandMiniUnits: 2,
      brandMacroUnits: 5,
    };
    const guidance = computeDoseGuidance(product, "experienced", "deep");
    expect(guidance!.tierCategory).toBe("macro");
    expect(guidance!.unitsText).toBe("5 capsules");
    expect(guidance!.mgLow).toBe(500);
  });

  it("returns null when the product has no dose guidance at all", () => {
    const product: DoseProductInput = {
      ...productWithTiers(),
      brandDoseTiers: null,
      brandMicroUnits: null,
      brandMiniUnits: null,
      brandMacroUnits: null,
    };
    expect(computeDoseGuidance(product, "new", "gentle")).toBeNull();
  });

  it("adds the offset disclaimer for stronger and lighter products", () => {
    const stronger = computeDoseGuidance(
      { ...productWithTiers(), strengthOffset: "stronger" },
      "experienced",
      "moderate"
    );
    expect(stronger!.offsetNote).toContain("hits stronger");
    expect(stronger!.offsetNote).toContain("lower end");

    const lighter = computeDoseGuidance(
      { ...productWithTiers(), strengthOffset: "lighter" },
      "experienced",
      "moderate"
    );
    expect(lighter!.offsetNote).toContain("hits lighter");

    const standard = computeDoseGuidance(productWithTiers(), "experienced", "moderate");
    expect(standard!.offsetNote).toBeUndefined();
  });

  it("adds the stepped note for new explorers asking for depth", () => {
    const guidance = computeDoseGuidance(productWithTiers(), "new", "deep");
    expect(guidance!.tierCategory).toBe("mini");
    expect(guidance!.steppedNote).toContain("building familiarity");
  });

  it("formats fractional quantities as fractions", () => {
    const product = productWithTiers();
    product.brandDoseTiers = [
      { category: "micro", label: "Micro", quantityText: "1/2", quantityMin: 0.5, quantityMax: null, unit: "gummy" },
    ];
    const guidance = computeDoseGuidance(product, "new", "gentle");
    expect(guidance!.unitsText).toBe("1/2 gummy");
    expect(guidance!.mgLow).toBe(50);
  });
});
