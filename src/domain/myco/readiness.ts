/**
 * Product readiness — defines what "recommendation-ready" means.
 *
 * A product only becomes a customer-facing recommendation candidate when it
 * is active, not archived, AND ready per this checklist. The same function
 * powers the admin completeness view, so what Audrey sees is exactly what
 * the engine enforces.
 */

import { hasMeaningfulVibeProfile } from "./vibes";

export interface ReadinessInput {
  format: string;
  brand: string | null;
  brandId: string | null;
  productUnitMg: number | null;
  unitsPerPack: number | null;
  totalDoseMg: number | null;
  onsetMinutes: number | null;
  durationMinutes: number | null;
  brandMicroUnits: number | null;
  brandMiniUnits: number | null;
  brandMacroUnits: number | null;
  brandDoseTiers: unknown;
  photoUrl: string | null;
  photoCount: number;
  vibeScores: unknown;
  strengthOffset: { offset: string; confirmed: boolean } | null;
}

export interface ProductReadiness {
  ready: boolean;
  missing: string[];
  warnings: string[];
}

function hasDoseGuidance(input: ReadinessInput): boolean {
  if (Array.isArray(input.brandDoseTiers) && input.brandDoseTiers.length > 0) return true;
  return Boolean(input.brandMicroUnits || input.brandMiniUnits || input.brandMacroUnits);
}

export function computeReadiness(input: ReadinessInput): ProductReadiness {
  const missing: string[] = [];
  const warnings: string[] = [];

  if (input.photoCount === 0 && !input.photoUrl) missing.push("photo");
  if (!input.brandId && !input.brand) missing.push("brand");
  if (!input.format) missing.push("format");
  if (!input.productUnitMg) missing.push("mg per unit");
  if (!input.unitsPerPack) missing.push("units per pack");
  if (!input.onsetMinutes) missing.push("onset");
  if (!input.durationMinutes) missing.push("duration");
  if (!hasMeaningfulVibeProfile(input.vibeScores)) missing.push("vibe profile");
  if (!hasDoseGuidance(input)) missing.push("brand dose guidance");
  if (!input.strengthOffset?.confirmed) missing.push("strength offset confirmation");

  if (
    input.productUnitMg &&
    input.unitsPerPack &&
    input.totalDoseMg &&
    input.productUnitMg * input.unitsPerPack !== input.totalDoseMg
  ) {
    warnings.push(
      `Dose math mismatch: ${input.unitsPerPack} × ${input.productUnitMg}mg = ` +
        `${input.productUnitMg * input.unitsPerPack}mg, but total dose is ${input.totalDoseMg}mg`
    );
  }

  if (input.productUnitMg && input.productUnitMg > 2000) {
    warnings.push(
      `Per-unit dose of ${input.productUnitMg}mg is unusually high — double-check this is mg of psilocybin per unit`
    );
  }
  if (input.productUnitMg && input.productUnitMg < 10) {
    warnings.push(
      `Per-unit dose of ${input.productUnitMg}mg is unusually low — double-check this is mg of psilocybin per unit`
    );
  }

  return { ready: missing.length === 0, missing, warnings };
}
