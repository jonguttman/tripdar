import { describe, expect, it } from "vitest";
import { computeReadiness, type ReadinessInput } from "./readiness";

function completeProduct(): ReadinessInput {
  return {
    format: "capsule",
    brand: null,
    brandId: "brand_1",
    productUnitMg: 100,
    unitsPerPack: 10,
    totalDoseMg: 1000,
    onsetMinutes: 30,
    durationMinutes: 240,
    brandMicroUnits: 1,
    brandMiniUnits: 2,
    brandMacroUnits: 5,
    brandDoseTiers: null,
    photoUrl: null,
    photoCount: 2,
    vibeScores: { clarity_cognition: 0.8, energy_direction: 0.3 },
    strengthOffset: { offset: "standard", confirmed: true },
  };
}

describe("computeReadiness", () => {
  it("marks a fully filled product ready with no missing items", () => {
    const result = computeReadiness(completeProduct());
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("requires a photo (legacy photoUrl also counts)", () => {
    const product = { ...completeProduct(), photoCount: 0 };
    expect(computeReadiness(product).missing).toContain("photo");
    expect(computeReadiness({ ...product, photoUrl: "https://x/y.jpg" }).ready).toBe(true);
  });

  it("accepts legacy free-text brand when no brandId is set", () => {
    const product = { ...completeProduct(), brandId: null };
    expect(computeReadiness(product).missing).toContain("brand");
    expect(computeReadiness({ ...product, brand: "Psilly" }).ready).toBe(true);
  });

  it("treats an all-zero vibe profile as missing", () => {
    const product = {
      ...completeProduct(),
      vibeScores: { clarity_cognition: 0, mood_social: 0 },
    };
    expect(computeReadiness(product).missing).toContain("vibe profile");
  });

  it("requires the strength offset to be confirmed, not just present", () => {
    const product = {
      ...completeProduct(),
      strengthOffset: { offset: "stronger", confirmed: false },
    };
    expect(computeReadiness(product).missing).toContain("strength offset confirmation");
    expect(computeReadiness({ ...completeProduct(), strengthOffset: null }).missing).toContain(
      "strength offset confirmation"
    );
  });

  it("requires dose guidance from tiers or legacy brand units", () => {
    const product = {
      ...completeProduct(),
      brandMicroUnits: null,
      brandMiniUnits: null,
      brandMacroUnits: null,
    };
    expect(computeReadiness(product).missing).toContain("brand dose guidance");
    expect(
      computeReadiness({
        ...product,
        brandDoseTiers: [{ category: "micro", label: "Micro", quantityMin: 1, unit: "capsule" }],
      }).ready
    ).toBe(true);
  });

  it("collects every missing field for the admin checklist", () => {
    const result = computeReadiness({
      format: "capsule",
      brand: null,
      brandId: null,
      productUnitMg: null,
      unitsPerPack: null,
      totalDoseMg: null,
      onsetMinutes: null,
      durationMinutes: null,
      brandMicroUnits: null,
      brandMiniUnits: null,
      brandMacroUnits: null,
      brandDoseTiers: null,
      photoUrl: null,
      photoCount: 0,
      vibeScores: null,
      strengthOffset: null,
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual([
      "photo",
      "brand",
      "mg per unit",
      "units per pack",
      "onset",
      "duration",
      "vibe profile",
      "brand dose guidance",
      "strength offset confirmation",
    ]);
  });

  it("warns on dose math mismatch without blocking readiness", () => {
    const result = computeReadiness({ ...completeProduct(), totalDoseMg: 900 });
    expect(result.ready).toBe(true);
    expect(result.warnings[0]).toContain("Dose math mismatch");
  });

  it("warns on outlier per-unit doses", () => {
    expect(
      computeReadiness({ ...completeProduct(), productUnitMg: 5000, totalDoseMg: 50000 }).warnings[0]
    ).toContain("unusually high");
    expect(
      computeReadiness({ ...completeProduct(), productUnitMg: 5, totalDoseMg: 50 }).warnings[0]
    ).toContain("unusually low");
  });
});
