/**
 * Product-first recommendation scoring.
 *
 * Scores StoreProductCatalog items directly against the user's 6-axis intent
 * vector (the strain engine scores strains; this scores real shelf products).
 * When a product is strain-specific and that strain also fits the intent,
 * the product is flagged as a strain-specific match for highlighting.
 */

import type { ExperienceLevel } from "@/domain/recommendation-engine/types";
import { vibeSimilarityScore, topVibes, type VibeScores, type VibeKey } from "./vibes";
import {
  computeDoseGuidance,
  type DoseGuidance,
  type DoseIntensity,
  type DoseProductInput,
  type StrengthOffsetValue,
} from "./dose";

export interface ProductCandidate {
  id: string;
  productName: string;
  format: string;
  brandName: string | null;
  strainSlug: string | null;
  photoUrl: string | null;
  ingredients: string[];
  flavors: string[];
  onsetMinutes: number | null;
  durationMinutes: number | null;
  brandDoseInstructions: string | null;
  vibeScores: VibeScores;
  strengthOffset: StrengthOffsetValue;
  strengthRationale: string | null;
  dose: Omit<DoseProductInput, "strengthOffset" | "strengthRationale">;
}

export interface ScoredProduct {
  candidate: ProductCandidate;
  matchScore: number;
  baseScore: number;
  formatBoost: number;
  strainMatch: boolean;
  strainName: string | null;
  doseGuidance: DoseGuidance | null;
  keyVibes: { key: VibeKey; label: string; value: number }[];
}

export interface ScoreProductsOptions {
  intentVector: VibeScores;
  experienceLevel: ExperienceLevel;
  intensity: DoseIntensity;
  formatPreference: string | null; // null / "no_preference" = no boost
  candidates: ProductCandidate[];
  // strainSlug -> { vector, name } for strain-specific highlighting
  strainProfiles?: Map<string, { vector: VibeScores; name: string }>;
}

const FORMAT_MATCH_BOOST = 8;
const STRAIN_MATCH_THRESHOLD = 60;

export function scoreProducts(options: ScoreProductsOptions): ScoredProduct[] {
  const { intentVector, experienceLevel, intensity, formatPreference, candidates, strainProfiles } =
    options;

  const scored = candidates.map((candidate): ScoredProduct => {
    const baseScore = vibeSimilarityScore(intentVector, candidate.vibeScores);

    const formatBoost =
      formatPreference && formatPreference !== "no_preference" && candidate.format === formatPreference
        ? FORMAT_MATCH_BOOST
        : 0;

    let strainMatch = false;
    let strainName: string | null = null;
    if (candidate.strainSlug && strainProfiles?.has(candidate.strainSlug)) {
      const strain = strainProfiles.get(candidate.strainSlug)!;
      if (vibeSimilarityScore(intentVector, strain.vector) >= STRAIN_MATCH_THRESHOLD) {
        strainMatch = true;
        strainName = strain.name;
      }
    }

    const doseGuidance = computeDoseGuidance(
      {
        ...candidate.dose,
        strengthOffset: candidate.strengthOffset,
        strengthRationale: candidate.strengthRationale,
      },
      experienceLevel,
      intensity
    );

    return {
      candidate,
      matchScore: Math.max(0, Math.min(100, baseScore + formatBoost)),
      baseScore,
      formatBoost,
      strainMatch,
      strainName,
      doseGuidance,
      keyVibes: topVibes(candidate.vibeScores),
    };
  });

  // Strain-specific matches surface first among near-equal scores.
  scored.sort((a, b) => {
    if (Math.abs(b.matchScore - a.matchScore) < 3 && a.strainMatch !== b.strainMatch) {
      return a.strainMatch ? -1 : 1;
    }
    return b.matchScore - a.matchScore;
  });

  return scored;
}
