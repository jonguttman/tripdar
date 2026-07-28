import { describe, expect, it } from "vitest";
import {
  ACTIVE_COMPOUNDS,
  LADDER_COMPATIBLE_MATERIAL_BASES,
} from "@/domain/recommendation-engine/doseBasis";
import { sanitizeDoseProvenanceInput } from "./doseProvenance";

describe("sanitizeDoseProvenanceInput", () => {
  it("accepts the shared active compound and material basis vocabularies", () => {
    const result = sanitizeDoseProvenanceInput({
      activeCompound: "psilocybin",
      activeCompoundSource: "Jon 2026-07-28 note",
      materialMassBasis: "mushroom_material",
      materialMassSource: "Jon 2026-07-28 note",
      packageMaterialMassMg: "4000",
      unitMaterialMassMg: "250",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        activeCompound: "psilocybin",
        activeCompoundSource: "Jon 2026-07-28 note",
        materialMassBasis: "mushroom_material",
        materialMassSource: "Jon 2026-07-28 note",
        packageMaterialMassMg: 4000,
        unitMaterialMassMg: 250,
      },
    });
  });

  it("rejects out-of-vocabulary activeCompound with accepted values in the message", () => {
    const result = sanitizeDoseProvenanceInput({ activeCompound: "amanita" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain(ACTIVE_COMPOUNDS.join(", "));
    }
  });

  it("rejects out-of-vocabulary materialMassBasis with accepted values in the message", () => {
    const result = sanitizeDoseProvenanceInput({ materialMassBasis: "total mushroom material" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain(LADDER_COMPATIBLE_MATERIAL_BASES.join(", "));
    }
  });

  it("normalizes nullish activeCompound to unknown and nullable material fields to null", () => {
    const result = sanitizeDoseProvenanceInput({
      activeCompound: "",
      materialMassBasis: "",
      unitMaterialMassMg: null,
      packageMaterialMassMg: "",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        activeCompound: "unknown",
        materialMassBasis: null,
        unitMaterialMassMg: null,
        packageMaterialMassMg: null,
      },
    });
  });

  it("rejects non-integer material mass values", () => {
    const result = sanitizeDoseProvenanceInput({ unitMaterialMassMg: 250.5 });

    expect(result).toEqual({
      ok: false,
      message: "unitMaterialMassMg must be a positive integer or null",
    });
  });
});
