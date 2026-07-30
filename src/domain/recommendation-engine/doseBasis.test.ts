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

  // KEWL-2492: every case below now carries an explicit unitsPerPack. The
  // suppression cases use a pack large enough that they still fail for the
  // reason they name, not incidentally on an undeterminable pack size.
  it("produces bounded counts for a 444 mg mushroom-material unit", () => {
    expect(computeSuggestedUnits(l4, {
      activeCompound: "psilocybin",
      unitMaterialMassMg: 444,
      materialMassBasis: "mushroom_material",
      unitsPerPack: 8,
    })).toBe("4-8");
  });

  it("produces bounded counts for a 140 mg fruiting-body unit", () => {
    expect(computeSuggestedUnits(l4, {
      activeCompound: "psilocin",
      unitMaterialMassMg: 140,
      materialMassBasis: "fruiting_body",
      unitsPerPack: 25,
    })).toBe("11-25");
  });

  it("suppresses units for a true extract at every dose level", () => {
    for (const level of CANONICAL_DOSE_LEVELS) {
      expect(computeSuggestedUnits(
        { lowMg: level.standardLowMg, highMg: level.standardHighMg },
        {
          activeCompound: "psilocybin",
          unitMaterialMassMg: 1,
          materialMassBasis: "whole_fruit_body_extract",
          unitsPerPack: 10000,
        },
      )).toBeUndefined();
    }
  });

  it("suppresses units when basis is missing", () => {
    expect(computeSuggestedUnits(l4, {
      activeCompound: "psilocybin",
      unitMaterialMassMg: 250,
      unitsPerPack: 25,
    })).toBeUndefined();
  });

  it.each(["unknown", "", null, undefined])(
    "suppresses units for %s compound even with a compatible divisor",
    (activeCompound) => {
      expect(computeSuggestedUnits(l4, {
        activeCompound,
        unitMaterialMassMg: 444,
        materialMassBasis: "mushroom_material",
        unitsPerPack: 8,
      })).toBeUndefined();
    },
  );

  it("requires both a supported compound and compatible basis", () => {
    expect(computeSuggestedUnits(l4, {
      activeCompound: "psilocybin",
      unitMaterialMassMg: 444,
      materialMassBasis: "mushroom_material",
      unitsPerPack: 8,
    })).toBe("4-8");
  });
});

/**
 * KEWL-2492 — rule 2 of Jon's Option A. The divisor is the shipped one
 * (unitMaterialMassMg gated on materialMassBasis), never productUnitMg.
 *
 * The fixture is the real, already-fully-backfilled `Gummies` catalog row:
 * Neau Tropics, psilocybin / mushroom_material / 250 mg per unit / 16 per pack.
 * Nothing here passes because a field was null.
 */
describe("computeSuggestedUnits pack-size rule", () => {
  const GHOST_GUMMIES = {
    activeCompound: "psilocybin",
    unitMaterialMassMg: 250,
    materialMassBasis: "mushroom_material",
    unitsPerPack: 16,
  } as const;

  const windowFor = (level: number) => {
    const l = CANONICAL_DOSE_LEVELS.find(d => d.level === level);
    if (!l) throw new Error(`no canonical level ${level}`);
    return { lowMg: l.standardLowMg, highMg: l.standardHighMg };
  };

  it("suppresses at L5, where the dose needs 14-20 and the pack holds 16", () => {
    // 3500/250 = 14, 5000/250 = 20 → 20 > 16.
    expect(computeSuggestedUnits(windowFor(5), GHOST_GUMMIES)).toBeUndefined();
  });

  it("still emits at L3, where 2-8 fits inside 16", () => {
    // 500/250 = 2, 2000/250 = 8 → 8 <= 16. Not blanket suppression.
    expect(computeSuggestedUnits(windowFor(3), GHOST_GUMMIES)).toBe("2-8");
  });

  it("is per-recommendation: the same row survives low levels and suppresses high ones", () => {
    const emitted = CANONICAL_DOSE_LEVELS
      .filter(l => computeSuggestedUnits(windowFor(l.level), GHOST_GUMMIES) !== undefined)
      .map(l => l.level);
    // L1-L4 need at most 14 units; L5 needs 20 and L6 needs 30.
    expect(emitted).toEqual([1, 2, 3, 4]);
  });

  it("treats the boundary as inclusive — needing exactly the pack size still emits", () => {
    // L4 high 3500/250 = 14. A pack of exactly 14 is satisfiable.
    expect(computeSuggestedUnits(windowFor(4), { ...GHOST_GUMMIES, unitsPerPack: 14 })).toBe("6-14");
    // A pack of 13 is not.
    expect(computeSuggestedUnits(windowFor(4), { ...GHOST_GUMMIES, unitsPerPack: 13 })).toBeUndefined();
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["zero", 0],
    ["negative", -5],
    ["NaN", Number.NaN],
  ])("fails closed on a %s pack size even with a valid divisor", (_label, unitsPerPack) => {
    expect(
      computeSuggestedUnits(windowFor(3), { ...GHOST_GUMMIES, unitsPerPack }),
    ).toBeUndefined();
  });
});
