/**
 * Deterministic dose curve for product recommendations.
 *
 * Audrey sets general dose guidance per product (brand dose tiers); the
 * suggestion for a specific user follows a predictable curve from their
 * stated depth (intensity) and experience level, expressed on the brand's
 * own micro/mini/macro ladder. Strength offset shifts guidance toward the
 * lower or upper end of the tier's range — never off the ladder.
 *
 * Copy rules (from the Myco spec): always a range, never "we recommend",
 * offset disclaimer is visible, "start low and go slow" everywhere.
 */

import type { ExperienceLevel } from "@/domain/recommendation-engine/types";
import { isSupportedActiveCompound } from "@/domain/recommendation-engine/doseBasis";

export type DoseIntensity = "gentle" | "moderate" | "deep";
export type StrengthOffsetValue = "standard" | "stronger" | "lighter";

const TIER_LADDER = ["micro", "mini", "macro"] as const;
export type DoseTierCategory = (typeof TIER_LADDER)[number];

const TIER_FALLBACK_LABELS: Record<DoseTierCategory, string> = {
  micro: "Microdose",
  mini: "Mini-dose",
  macro: "Macro dose",
};

export interface DoseProductInput {
  format: string;
  activeCompound: string | null;
  productUnitMg: number | null;
  brandDoseTiers: unknown;
  brandMicroUnits: number | null;
  brandMiniUnits: number | null;
  brandMacroUnits: number | null;
  strengthOffset: StrengthOffsetValue;
  strengthRationale?: string | null;
}

export interface DoseGuidance {
  tierCategory: DoseTierCategory;
  tierLabel: string;
  unitsText: string; // e.g. "1–2 capsules"
  mgLow: number | null;
  mgHigh: number | null;
  guidanceText: string;
  offsetNote?: string;
  steppedNote?: string;
}

interface ResolvedTier {
  category: DoseTierCategory;
  label: string;
  quantityMin: number;
  quantityMax: number | null;
  unit: string;
}

function unitForFormat(format: string): string {
  if (format === "capsule") return "capsule";
  if (format === "edible") return "gummy";
  if (format === "tincture") return "dropper";
  return "unit";
}

function readBrandTiers(input: DoseProductInput): ResolvedTier[] {
  const tiers: ResolvedTier[] = [];

  if (Array.isArray(input.brandDoseTiers)) {
    for (const raw of input.brandDoseTiers) {
      if (!raw || typeof raw !== "object") continue;
      const tier = raw as Record<string, unknown>;
      const category = tier.category;
      if (category !== "micro" && category !== "mini" && category !== "macro") continue;
      const quantityMin = typeof tier.quantityMin === "number" ? tier.quantityMin : null;
      if (!quantityMin || quantityMin <= 0) continue;
      tiers.push({
        category,
        label: typeof tier.label === "string" && tier.label ? tier.label : TIER_FALLBACK_LABELS[category],
        quantityMin,
        quantityMax: typeof tier.quantityMax === "number" ? tier.quantityMax : null,
        unit: typeof tier.unit === "string" && tier.unit ? tier.unit : unitForFormat(input.format),
      });
    }
  }

  if (tiers.length > 0) return tiers;

  const unit = unitForFormat(input.format);
  const legacy: [DoseTierCategory, number | null][] = [
    ["micro", input.brandMicroUnits],
    ["mini", input.brandMiniUnits],
    ["macro", input.brandMacroUnits],
  ];
  for (const [category, units] of legacy) {
    if (units && units > 0) {
      tiers.push({
        category,
        label: TIER_FALLBACK_LABELS[category],
        quantityMin: units,
        quantityMax: null,
        unit,
      });
    }
  }
  return tiers;
}

/**
 * The predictable curve: depth picks the rung, experience caps it.
 * New explorers never start above mini, and a depth request shifts down one
 * rung for them (with a stepped-path note explaining why).
 */
export function resolveTierCategory(
  experience: ExperienceLevel,
  intensity: DoseIntensity
): { category: DoseTierCategory; stepped: boolean } {
  const intensityIndex = intensity === "gentle" ? 0 : intensity === "moderate" ? 1 : 2;
  const experienceShift = experience === "new" ? -1 : 0;
  const experienceCap = experience === "new" ? 1 : 2;
  const index = Math.max(0, Math.min(experienceCap, intensityIndex + experienceShift));
  return { category: TIER_LADDER[index], stepped: index < intensityIndex };
}

function formatUnits(quantity: number): string {
  if (quantity === 0.25) return "1/4";
  if (quantity === 0.5) return "1/2";
  if (quantity === 0.75) return "3/4";
  return quantity % 1 === 0 ? String(quantity) : String(quantity);
}

function pluralize(unit: string, quantity: number): string {
  if (!unit) return "";
  return quantity === 1 || quantity < 1 ? unit : `${unit}s`;
}

export function computeDoseGuidance(
  product: DoseProductInput,
  experience: ExperienceLevel,
  intensity: DoseIntensity
): DoseGuidance | null {
  // Unknown/blank compounds may keep a legacy product card visible during the
  // KEWL-2378 compatibility phase, but they cannot emit dose units or mg.
  if (!isSupportedActiveCompound(product.activeCompound)) return null;

  const tiers = readBrandTiers(product);
  if (tiers.length === 0) return null;

  const { category: targetCategory, stepped } = resolveTierCategory(experience, intensity);

  // Use the target rung if the brand defines it; otherwise step DOWN the
  // ladder to the nearest defined tier (never up — lower is the safe miss).
  const targetIndex = TIER_LADDER.indexOf(targetCategory);
  let tier: ResolvedTier | undefined;
  for (let i = targetIndex; i >= 0; i--) {
    tier = tiers.find((t) => t.category === TIER_LADDER[i]);
    if (tier) break;
  }
  if (!tier) tier = tiers[0];

  const low = tier.quantityMin;
  const high = tier.quantityMax;
  const unitsText =
    high && high !== low
      ? `${formatUnits(low)}–${formatUnits(high)} ${pluralize(tier.unit, high)}`
      : `${formatUnits(low)} ${pluralize(tier.unit, low)}`;

  const mgLow = product.productUnitMg ? Math.round(low * product.productUnitMg) : null;
  const mgHigh = product.productUnitMg ? Math.round((high ?? low) * product.productUnitMg) : null;

  const mgText =
    mgLow !== null ? (mgHigh !== null && mgHigh !== mgLow ? ` (${mgLow}–${mgHigh}mg)` : ` (${mgLow}mg)`) : "";
  const guidanceText = `A typical ${tier.label.toLowerCase()} starting point for this product is ${unitsText}${mgText}.`;

  let offsetNote: string | undefined;
  if (product.strengthOffset === "stronger") {
    offsetNote =
      "Community feedback suggests this product hits stronger than standard guidance — consider starting at the lower end of the range.";
  } else if (product.strengthOffset === "lighter") {
    offsetNote =
      "Community feedback suggests this product hits lighter than standard guidance. Still, start low — you can always take more next time.";
  }

  const steppedNote = stepped
    ? "You mentioned wanting to go deep. For where you are right now, community wisdom suggests building familiarity at this level first — the depth often surprises people."
    : undefined;

  return {
    tierCategory: tier.category,
    tierLabel: tier.label,
    unitsText,
    mgLow,
    mgHigh,
    guidanceText,
    offsetNote,
    steppedNote,
  };
}
