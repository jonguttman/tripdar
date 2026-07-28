import { describe, expect, it } from "vitest";
import {
  computeSuggestedUnits,
  isLadderCompatibleMaterialBasis,
  isSupportedActiveCompound,
  resolveLadderDivisorMg,
} from "./doseBasis";
import { CANONICAL_DOSE_BASIS, CANONICAL_DOSE_LEVELS } from "./types";

describe("CANONICAL_DOSE_BASIS", () => {
  it("declares the ladder as dried-mushroom-equivalent mass, not active compound", () => {
    expect(CANONICAL_DOSE_BASIS).toBe("dried_mushroom_equivalent_mg");
  });

  it("matches the gram-scale ladder it describes", () => {
    // If these stop being gram-scale the basis constant is lying.
    const l1 = CANONICAL_DOSE_LEVELS.find(d => d.level === 1);
    const l6 = CANONICAL_DOSE_LEVELS.find(d => d.level === 6);
    expect(l1).toMatchObject({ standardLowMg: 50, standardHighMg: 250 });
    expect(l6).toMatchObject({ standardLowMg: 5000, standardHighMg: 7500 });
  });
});

describe("isSupportedActiveCompound", () => {
  it("admits the psilocybin family", () => {
    expect(isSupportedActiveCompound("psilocybin")).toBe(true);
    expect(isSupportedActiveCompound("psilocin")).toBe(true);
  });

  it.each([
    ["unknown", "unknown"],
    ["muscimol", "muscimol"],
    ["functional-only", "functional-only"],
    ["unrecognized value", "lions-mane"],
    ["empty string", ""],
  ])("fails closed on %s", (_label, value) => {
    expect(isSupportedActiveCompound(value)).toBe(false);
  });

  it("fails closed on null and undefined", () => {
    expect(isSupportedActiveCompound(null)).toBe(false);
    expect(isSupportedActiveCompound(undefined)).toBe(false);
  });
});

describe("isLadderCompatibleMaterialBasis", () => {
  it("admits dried-mushroom-equivalent bases", () => {
    expect(isLadderCompatibleMaterialBasis("fruiting_body")).toBe(true);
    expect(isLadderCompatibleMaterialBasis("mushroom_material")).toBe(true);
    expect(isLadderCompatibleMaterialBasis(CANONICAL_DOSE_BASIS)).toBe(true);
  });

  it.each([
    ["true extract — concentrated, not equivalent mass", "whole_fruit_body_extract"],
    ["proprietary blend — unknown active proportion", "proprietary_blend"],
    ["net edible weight — mostly chocolate/gummy", "net_edible_weight"],
    ["explicit unknown", "unknown"],
    ["active-compound basis is a different basis entirely", "active_compound_mg_per_unit"],
    ["unrecognized value", "something_new"],
  ])("fails closed on %s", (_label, basis) => {
    expect(isLadderCompatibleMaterialBasis(basis)).toBe(false);
  });

  it("fails closed on missing basis", () => {
    expect(isLadderCompatibleMaterialBasis(null)).toBe(false);
    expect(isLadderCompatibleMaterialBasis(undefined)).toBe(false);
    expect(isLadderCompatibleMaterialBasis("")).toBe(false);
  });
});

describe("resolveLadderDivisorMg", () => {
  it("returns the mass when the basis is explicitly compatible", () => {
    expect(
      resolveLadderDivisorMg({ unitMaterialMassMg: 444, materialMassBasis: "mushroom_material" }),
    ).toBe(444);
  });

  it("never infers compatibility from a non-null mass alone", () => {
    expect(resolveLadderDivisorMg({ unitMaterialMassMg: 444 })).toBeNull();
    expect(
      resolveLadderDivisorMg({ unitMaterialMassMg: 444, materialMassBasis: null }),
    ).toBeNull();
  });

  it("rejects non-positive and non-finite masses", () => {
    for (const mass of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        resolveLadderDivisorMg({ unitMaterialMassMg: mass, materialMassBasis: "fruiting_body" }),
      ).toBeNull();
    }
  });
});

describe("computeSuggestedUnits", () => {
  const l4 = { lowMg: 1500, highMg: 3500 };

  it("produces bounded counts for a 444 mg mushroom-material unit", () => {
    expect(computeSuggestedUnits(l4, {
      unitMaterialMassMg: 444,
      materialMassBasis: "mushroom_material",
    })).toBe("4-8");
  });

  it("produces bounded counts for a 140 mg fruiting-body unit", () => {
    expect(computeSuggestedUnits(l4, {
      unitMaterialMassMg: 140,
      materialMassBasis: "fruiting_body",
    })).toBe("11-25");
  });

  it("suppresses units for a true extract at every dose level", () => {
    for (const level of CANONICAL_DOSE_LEVELS) {
      expect(computeSuggestedUnits(
        { lowMg: level.standardLowMg, highMg: level.standardHighMg },
        { unitMaterialMassMg: 1, materialMassBasis: "whole_fruit_body_extract" },
      )).toBeUndefined();
    }
  });

  it("suppresses units when basis is missing", () => {
    expect(computeSuggestedUnits(l4, { unitMaterialMassMg: 250 })).toBeUndefined();
  });
});
