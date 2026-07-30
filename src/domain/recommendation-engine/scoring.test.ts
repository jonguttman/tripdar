/**
 * KEWL-2356 / KEWL-2346 regression tests.
 *
 * The canonical ladder is dried-mushroom-equivalent mg. These tests pin the rule
 * that only a same-basis divisor may turn it into a unit count, and that an
 * active-compound allowlist is never permission to divide it.
 */

import { describe, expect, it } from "vitest";
import { scoreStrains, type ScoreOptions } from "./scoring";
import type { IntentVector, StrainProfileVector } from "./types";

type AdminConfig = NonNullable<ScoreOptions["adminConfigs"]> extends Map<string, infer V> ? V : never;

const SLUG = "golden-teacher";

/** All axes at 0.6 → avg intensity 0.6 → dose level 4 (1500-3500 mg). */
const L4_INTENT: IntentVector = {
  clarity_cognition: 0.6,
  mood_social: 0.6,
  visual_pattern: 0.6,
  somatic: 0.6,
  energy_direction: 0.6,
  depth_direction: 0.6,
};

/** All axes at 0.1 → avg intensity 0.1 → dose level 1 (50-250 mg). */
const L1_INTENT: IntentVector = {
  clarity_cognition: 0.1,
  mood_social: 0.1,
  visual_pattern: 0.1,
  somatic: 0.1,
  energy_direction: 0.1,
  depth_direction: 0.1,
};

/** All axes at 0.4 → avg intensity 0.4 → dose level 3 (500-2000 mg). */
const L3_INTENT: IntentVector = {
  clarity_cognition: 0.4,
  mood_social: 0.4,
  visual_pattern: 0.4,
  somatic: 0.4,
  energy_direction: 0.4,
  depth_direction: 0.4,
};

/** All axes at 0.7 → avg intensity 0.7 → dose level 5 (3500-5000 mg). */
const L5_INTENT: IntentVector = {
  clarity_cognition: 0.7,
  mood_social: 0.7,
  visual_pattern: 0.7,
  somatic: 0.7,
  energy_direction: 0.7,
  depth_direction: 0.7,
};

/** doseSensitivity "gentle" keeps the modifier at 1.0 so ranges stay canonical. */
function profile(): StrainProfileVector {
  return {
    strainSlug: SLUG,
    strainName: "Golden Teacher",
    clarity_cognition: 0.5,
    mood_social: 0.5,
    visual_pattern: 0.5,
    somatic: 0.5,
    energy_direction: 0.5,
    depth_direction: 0.5,
    potencyTier: "Moderate",
    doseSensitivity: "gentle",
    experienceStability: "High",
    beginnerFriendly: "Maybe",
  };
}

function score(config: Partial<AdminConfig>, intentVector: IntentVector = L4_INTENT) {
  const [result] = scoreStrains({
    intentVector,
    experienceLevel: "experienced",
    profiles: [profile()],
    adminConfigs: new Map([[SLUG, config as AdminConfig]]),
  });
  return result;
}

const PRODUCT_IDENTITY = {
  productName: "Golden Teacher Capsules",
  productUrl: "https://example.test/gt",
  productPhotoUrl: "https://example.test/gt.jpg",
  productFormat: "capsule",
  activeCompound: "psilocybin",
  /**
   * KEWL-2492: a pack size large enough not to trip the pack-size rule on its
   * own. It lives on the shared fixture deliberately — without it, every
   * suppression test below would pass for two reasons at once (its own rule AND
   * an undeterminable pack size), and would keep passing even if the rule it
   * names were deleted. Tests that exercise the pack rule override it.
   */
  productUnitsPerPack: 25,
};

describe("scoreStrains dose ladder basis guard", () => {
  it("emits the L4 window the tests are calibrated against", () => {
    const result = score({});
    expect(result.doseLevel).toBe(4);
    expect(result.doseLowMg).toBe(1500);
    expect(result.doseHighMg).toBe(3500);
  });

  describe("compatible material mass", () => {
    // Pack sizes below are the real live values for the products these fixtures
    // were modelled on (KEWL-2492). Two are exact boundary cases — highUnits
    // equals the pack — which pins the rule as `>` and not `>=`.
    it("keeps unit counts for a 444 mg mushroom-material unit", () => {
      const result = score({
        ...PRODUCT_IDENTITY,
        productUnitMaterialMassMg: 444,
        productMaterialMassBasis: "mushroom_material",
        productUnitsPerPack: 8, // Fun Guy Chocolate Bar: needs exactly 8, pack holds 8.
      });
      expect(result.product?.suggestedUnits).toBe("4-8");
    });

    it("keeps unit counts for a 140 mg fruiting-body unit", () => {
      const result = score({
        ...PRODUCT_IDENTITY,
        productUnitMaterialMassMg: 140,
        productMaterialMassBasis: "fruiting_body",
        productUnitsPerPack: 25, // Cubiq Microdose Gummies: needs exactly 25, pack holds 25.
      });
      expect(result.product?.suggestedUnits).toBe("11-25");
    });

    it("scales with the dose level rather than echoing raw mg", () => {
      const result = score(
        {
          ...PRODUCT_IDENTITY,
          productUnitMaterialMassMg: 250,
          productMaterialMassBasis: "mushroom_material",
          productUnitsPerPack: 16, // Neau Tropics Ghost Gummies.
        },
        L1_INTENT,
      );
      expect(result.doseLevel).toBe(1);
      expect(result.product?.suggestedUnits).toBe("1-1");
    });
  });

  describe("true extracts and active-compound-only rows", () => {
    it("does not turn a 1 mg psilocin unit into four-digit counts", () => {
      const result = score({
        ...PRODUCT_IDENTITY,
        productUnitMg: 1, // verified active compound
        productUnitMaterialMassMg: 1,
        productMaterialMassBasis: "whole_fruit_body_extract",
      });
      expect(result.product?.suggestedUnits).toBeUndefined();
      // The exact overdose-direction output this guard exists to prevent.
      expect(result.product?.suggestedUnits).not.toBe("1500-3500");
    });

    it("does not turn a 5 mg psilocybin unit into 300-700 counts", () => {
      const result = score({
        ...PRODUCT_IDENTITY,
        productUnitMg: 5,
      });
      expect(result.product?.suggestedUnits).toBeUndefined();
      expect(result.product?.suggestedUnits).not.toBe("300-700");
    });

    it("suppresses units for an extract at every dose level", () => {
      for (const intent of [L1_INTENT, L4_INTENT]) {
        const result = score(
          {
            ...PRODUCT_IDENTITY,
            productUnitMg: 1,
            productMaterialMassBasis: "whole_fruit_body_extract",
            productUnitMaterialMassMg: 1,
          },
          intent,
        );
        expect(result.product?.suggestedUnits).toBeUndefined();
      }
    });

    it("treats active_compound_mg_per_unit basis as incompatible", () => {
      const result = score({
        ...PRODUCT_IDENTITY,
        productUnitMg: 1,
        productUnitMaterialMassMg: 1,
        productMaterialMassBasis: "active_compound_mg_per_unit",
      });
      expect(result.product?.suggestedUnits).toBeUndefined();
    });

    it("never infers compatibility from a bare material mass", () => {
      const result = score({
        ...PRODUCT_IDENTITY,
        productUnitMaterialMassMg: 444,
      });
      expect(result.product?.suggestedUnits).toBeUndefined();
    });
  });

  describe("product recommendation survives unit suppression", () => {
    it.each(["unknown", "", undefined, "muscimol", "functional-only", "lions-mane"])(
      "retains product identity but suppresses units for %s compound",
      (activeCompound) => {
        const result = score({
          ...PRODUCT_IDENTITY,
          activeCompound,
          productUnitMaterialMassMg: 444,
          productMaterialMassBasis: "mushroom_material",
        });

        expect(result.product?.name).toBe("Golden Teacher Capsules");
        expect(result.product?.suggestedUnits).toBeUndefined();
      },
    );

    it("retains name, url, photo, and format when units are suppressed", () => {
      const result = score({
        ...PRODUCT_IDENTITY,
        productUnitMg: 1,
        productMaterialMassBasis: "whole_fruit_body_extract",
        productUnitMaterialMassMg: 1,
      });

      expect(result.product).toBeDefined();
      expect(result.product?.name).toBe("Golden Teacher Capsules");
      expect(result.product?.url).toBe("https://example.test/gt");
      expect(result.product?.photoUrl).toBe("https://example.test/gt.jpg");
      expect(result.product?.format).toBe("capsule");
      expect(result.product?.suggestedUnits).toBeUndefined();
    });

    it("omits the key entirely rather than serializing a null/empty count", () => {
      const result = score({
        ...PRODUCT_IDENTITY,
        productUnitMg: 1,
      });
      expect(Object.keys(result.product ?? {})).not.toContain("suggestedUnits");
      // Round-trip the way the WP plugin receives it.
      expect(JSON.parse(JSON.stringify(result.product))).not.toHaveProperty("suggestedUnits");
    });

    it("still omits the product entirely when there is no mapped product", () => {
      expect(score({}).product).toBeUndefined();
    });
  });

  /**
   * KEWL-2492 — rule 2 of Jon's Option A: when the level we are recommending to
   * THIS customer needs more units than the package holds, keep the product and
   * drop the count.
   *
   * The fixture is the real, already-fully-backfilled `Gummies` catalog row
   * (Neau Tropics — psilocybin / mushroom_material / 250 mg per unit / 16 per
   * pack). Every dose-provenance field is populated, so these tests cannot pass
   * merely because something was null.
   */
  describe("pack-size rule (per-recommendation, not per-product)", () => {
    const REAL_BACKFILLED_ROW = {
      ...PRODUCT_IDENTITY,
      productName: "Ghost Gummies",
      activeCompound: "psilocybin",
      productUnitMaterialMassMg: 250,
      productMaterialMassBasis: "mushroom_material",
      productUnitsPerPack: 16,
    };

    it("suppresses the count at L5, where the dose needs 14-20 but the pack holds 16", () => {
      const result = score(REAL_BACKFILLED_ROW, L5_INTENT);

      expect(result.doseLevel).toBe(5);
      expect(result.doseLowMg).toBe(3500);
      expect(result.doseHighMg).toBe(5000);
      // 3500/250 = 14, 5000/250 = 20. 20 > 16 → contradiction, so no count.
      expect(result.product?.suggestedUnits).toBeUndefined();
    });

    it("keeps full product identity when the pack rule suppresses the count", () => {
      const result = score(REAL_BACKFILLED_ROW, L5_INTENT);

      expect(result.product).toBeDefined();
      expect(result.product?.name).toBe("Ghost Gummies");
      expect(result.product?.url).toBe("https://example.test/gt");
      expect(result.product?.photoUrl).toBe("https://example.test/gt.jpg");
      expect(result.product?.format).toBe("capsule");
      // The key is omitted, not serialized as null — same contract as every
      // other suppression path.
      expect(JSON.parse(JSON.stringify(result.product))).not.toHaveProperty("suggestedUnits");
    });

    it("still emits the count for the same row at L3, where 2-8 fits in 16", () => {
      const result = score(REAL_BACKFILLED_ROW, L3_INTENT);

      expect(result.doseLevel).toBe(3);
      // 500/250 = 2, 2000/250 = 8. 8 <= 16 → the pack can satisfy it.
      expect(result.product?.suggestedUnits).toBe("2-8");
    });

    it("suppresses the count when the pack size is unknown, even if everything else is valid", () => {
      const result = score({
        ...REAL_BACKFILLED_ROW,
        productUnitsPerPack: undefined,
      });

      expect(result.product?.name).toBe("Ghost Gummies");
      expect(result.product?.suggestedUnits).toBeUndefined();
    });
  });
});
