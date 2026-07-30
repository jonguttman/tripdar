/**
 * Dose-basis and active-compound gates.
 *
 * Two independent safety rules live here, and they must not be confused with
 * each other (that confusion is the KEWL-2346 defect):
 *
 *   1. Active-compound gate — decides whether a product may enter the current
 *      psilocybin-family recommendation engine at all.
 *   2. Ladder-basis gate — decides whether a product carries a divisor that is
 *      like-for-like with CANONICAL_DOSE_BASIS, and may therefore produce a
 *      `suggestedUnits` count.
 *
 * Passing (1) is NOT permission to do (2). A verified 1 mg psilocin unit is a
 * supported active compound, but dividing the dried-mushroom-equivalent ladder
 * by 1 mg yields four-digit unit counts in the overdose direction.
 *
 * The candidacy gate admits legacy unknown/missing compound values so existing
 * catalog products keep their identity, but excludes explicitly unsupported
 * and unrecognized non-null compounds. The dose-output gate remains fail closed.
 *
 * See docs/architecture/2026-07-28-kewl-2346-dose-ladder-basis.md.
 */

import { CANONICAL_DOSE_BASIS } from "./types";

// =============================================================================
// Active compound gate
// =============================================================================

/** Full app-validated vocabulary (KEWL-2033 / KEWL-2341). */
export const ACTIVE_COMPOUNDS = [
  "psilocybin",
  "psilocin",
  "muscimol",
  "functional-only",
  "unknown",
] as const;

/**
 * Compounds the current engine's dose math is built for. `muscimol` and
 * `functional-only` are real, valid catalog values — they are simply not this
 * engine's family and need their own engine before they can be recommended.
 */
export const SUPPORTED_ACTIVE_COMPOUNDS: readonly string[] = ["psilocybin", "psilocin"];

export function isSupportedActiveCompound(value: string | null | undefined): boolean {
  if (!value) return false;
  return SUPPORTED_ACTIVE_COMPOUNDS.includes(value);
}

/**
 * Compounds that must not enter the current psilocybin-family recommender.
 * Legacy unknown/blank/missing values remain candidates, but cannot emit dose
 * output because isSupportedActiveCompound() still rejects them.
 */
export function isCandidacyExcludedCompound(value: string | null | undefined): boolean {
  if (!value || value === "unknown") return false;
  return !SUPPORTED_ACTIVE_COMPOUNDS.includes(value);
}

// =============================================================================
// Ladder basis gate
// =============================================================================

/**
 * Material-mass bases that are dried-mushroom-equivalent, and so may divide the
 * canonical ladder.
 *
 * Deliberately excluded, and why:
 *   - `whole_fruit_body_extract` — an extract is concentrated; its material mass
 *     is not equivalent to the same mass of dried mushroom.
 *   - `proprietary_blend`       — unknown proportion of active material.
 *   - `net_edible_weight`       — chocolate/gummy mass, mostly not mushroom.
 *   - `unknown`, null, ""       — no explicit claim.
 *
 * A non-null `unitMaterialMassMg` on its own never implies compatibility; the
 * basis must say so explicitly.
 */
export const LADDER_COMPATIBLE_MATERIAL_BASES: readonly string[] = [
  CANONICAL_DOSE_BASIS,
  "fruiting_body",
  "mushroom_material",
];

export function isLadderCompatibleMaterialBasis(basis: string | null | undefined): boolean {
  if (!basis) return false;
  return LADDER_COMPATIBLE_MATERIAL_BASES.includes(basis);
}

export interface LadderDivisorInput {
  /** Must be psilocybin-family before any unit count can be emitted. */
  activeCompound?: string | null;
  /** Material mass in mg per consumer unit. */
  unitMaterialMassMg?: number | null;
  /** The basis that mass is stated on. */
  materialMassBasis?: string | null;
  /**
   * Units the package actually holds. Gates the pack-size rule below; absent or
   * null means we cannot determine it, and the count is suppressed.
   */
  unitsPerPack?: number | null;
}

/**
 * Resolve a like-for-like divisor for CANONICAL_DOSE_BASIS, or null when the
 * product cannot safely produce a unit count.
 */
export function resolveLadderDivisorMg(input: LadderDivisorInput): number | null {
  const { unitMaterialMassMg, materialMassBasis } = input;

  if (!isLadderCompatibleMaterialBasis(materialMassBasis)) return null;
  if (typeof unitMaterialMassMg !== "number") return null;
  if (!Number.isFinite(unitMaterialMassMg) || unitMaterialMassMg <= 0) return null;

  return unitMaterialMassMg;
}

/**
 * Format the `suggestedUnits` range for a dose window, or undefined when the
 * product has no basis-compatible divisor, or when the dose we are actually
 * recommending to this customer needs more units than the package holds.
 *
 * The pack-size rule (KEWL-2492, rule 2 of Jon's Option A) is deliberately
 * per-recommendation, not per-product: the same product keeps its count at a
 * dose level it can satisfy and loses it at one it cannot. Telling a customer
 * to take 20 of something sold in packs of 16 is the contradiction it exists
 * to prevent.
 *
 * Suppression here means "no unit count", never "no product" — the caller
 * builds product identity first and attaches the count only if we return one.
 */
export function computeSuggestedUnits(
  doseRange: { lowMg: number; highMg: number },
  divisor: LadderDivisorInput,
): string | undefined {
  if (!isSupportedActiveCompound(divisor.activeCompound)) return undefined;

  const divisorMg = resolveLadderDivisorMg(divisor);
  if (divisorMg === null) return undefined;

  const lowUnits = Math.ceil(doseRange.lowMg / divisorMg);
  const highUnits = Math.ceil(doseRange.highMg / divisorMg);

  // Fail closed on an undeterminable pack size, per the parent guardrail:
  // if the contradiction state cannot be determined, suppress.
  const { unitsPerPack } = divisor;
  if (typeof unitsPerPack !== "number") return undefined;
  if (!Number.isFinite(unitsPerPack) || unitsPerPack <= 0) return undefined;
  if (highUnits > unitsPerPack) return undefined;

  return `${lowUnits}-${highUnits}`;
}
