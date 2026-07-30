/**
 * Recommendation Scoring Engine
 *
 * Layer 1: Rule-based scoring using cosine similarity between intent vectors
 * and strain profile vectors, with experience level modifiers, dose calculation,
 * stepped path detection, and caution generation.
 */

import type {
  IntentVector,
  ExperienceLevel,
  StrainProfileVector,
  ScoredRecommendation,
  DoseSensitivity,
} from "./types";
import { CANONICAL_DOSE_LEVELS, DOSE_SENSITIVITY_MODIFIERS } from "./types";
import { computeSuggestedUnits } from "./doseBasis";

// =============================================================================
// Cosine Similarity
// =============================================================================

const VECTOR_KEYS: (keyof IntentVector)[] = [
  "clarity_cognition", "mood_social", "visual_pattern",
  "somatic", "energy_direction", "depth_direction",
];

function cosineSimilarity(a: IntentVector, b: StrainProfileVector): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const key of VECTOR_KEYS) {
    const va = a[key];
    const vb = b[key] ?? 0;
    dotProduct += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  // Cosine similarity returns -1 to 1; normalize to 0-100
  const raw = dotProduct / denominator;
  return Math.round(((raw + 1) / 2) * 100);
}

// =============================================================================
// Experience Level Modifier
// =============================================================================

const EXPERIENCE_MODIFIERS: Record<ExperienceLevel, { beginnerBoost: number; beginnerPenalty: number }> = {
  new:              { beginnerBoost: 15, beginnerPenalty: -15 },
  few_times:        { beginnerBoost: 8,  beginnerPenalty: -8 },
  experienced:      { beginnerBoost: -5, beginnerPenalty: 5 },
  very_experienced: { beginnerBoost: -10, beginnerPenalty: 10 },
};

function applyExperienceModifier(
  baseScore: number,
  experienceLevel: ExperienceLevel,
  beginnerFriendly: string,
): number {
  const mods = EXPERIENCE_MODIFIERS[experienceLevel];
  if (beginnerFriendly === "Yes") {
    return baseScore + mods.beginnerBoost;
  }
  if (beginnerFriendly === "No") {
    return baseScore + mods.beginnerPenalty;
  }
  return baseScore; // "Maybe" — no modifier
}

// =============================================================================
// Dose Calculation
// =============================================================================

/**
 * Determine target dose level from intent intensity and experience level
 */
export function determineDoseLevel(intentVector: IntentVector, experienceLevel: ExperienceLevel): number {
  // Compute overall intensity from the intent vector
  const absValues = VECTOR_KEYS.map(k => Math.abs(intentVector[k]));
  const avgIntensity = absValues.reduce((a, b) => a + b, 0) / absValues.length;

  // Map average intensity to dose level
  let level: number;
  if (avgIntensity < 0.2) level = 1;
  else if (avgIntensity < 0.35) level = 2;
  else if (avgIntensity < 0.5) level = 3;
  else if (avgIntensity < 0.65) level = 4;
  else if (avgIntensity < 0.8) level = 5;
  else level = 6;

  // Cap by experience level
  const maxLevelByExperience: Record<ExperienceLevel, number> = {
    new: 3,
    few_times: 4,
    experienced: 6,
    very_experienced: 6,
  };

  return Math.min(level, maxLevelByExperience[experienceLevel]);
}

/**
 * Calculate strain-adjusted dose range
 */
export function calculateDoseRange(
  doseLevel: number,
  doseSensitivity: DoseSensitivity,
): { lowMg: number; highMg: number } {
  const canonical = CANONICAL_DOSE_LEVELS.find(d => d.level === doseLevel);
  if (!canonical) {
    return { lowMg: 0, highMg: 0 };
  }

  const modifier = DOSE_SENSITIVITY_MODIFIERS[doseSensitivity];
  return {
    lowMg: Math.round(canonical.standardLowMg * modifier),
    highMg: Math.round(canonical.standardHighMg * modifier),
  };
}

// =============================================================================
// Stepped Path Detection
// =============================================================================

function detectSteppedPath(
  experienceLevel: ExperienceLevel,
  targetDoseLevel: number,
  strainName: string,
): string | undefined {
  if (
    (experienceLevel === "new" || experienceLevel === "few_times") &&
    targetDoseLevel >= 4
  ) {
    const suggestedLevel = experienceLevel === "new" ? 2 : 3;
    return `Based on what you're looking for, experienced users often explore this at Level ${targetDoseLevel}. ` +
      `For your experience level, community wisdom suggests starting at Level ${suggestedLevel} ` +
      `with ${strainName} to build familiarity first. Many users say the depth surprised them even at this level.`;
  }
  return undefined;
}

// =============================================================================
// Caution Generation
// =============================================================================

function generateCautions(
  profile: StrainProfileVector,
  adminCautions?: string,
): string[] {
  const cautions: string[] = [];

  if (profile.doseSensitivity === "steep" || profile.doseSensitivity === "very_steep") {
    cautions.push(
      "Community reports suggest this strain responds more strongly per mg than standard varieties. " +
      "Many users recommend starting at the lower end of the range."
    );
  }

  if (profile.experienceStability === "Variable" || profile.experienceStability === "Low") {
    cautions.push(
      "Experiences with this strain are reported as less predictable than some alternatives. " +
      "Set and setting may play a larger role than usual."
    );
  }

  if (adminCautions) {
    cautions.push(adminCautions);
  }

  return cautions;
}

// =============================================================================
// Main Scoring Function
// =============================================================================

export interface ScoreOptions {
  intentVector: IntentVector;
  experienceLevel: ExperienceLevel;
  profiles: StrainProfileVector[];
  feedbackMods?: Map<string, number>;
  adminConfigs?: Map<string, {
    intentOverrides?: Record<string, string>;
    cautionFlags?: { show_sensitivity?: boolean; custom?: string };
    productName?: string;
    productUrl?: string;
    /** Compound family gates dose output, not legacy product-card visibility. */
    activeCompound?: string;
    /**
     * Verified active-compound mg per unit. Active-dose fact only — NEVER a
     * divisor for the dried-mushroom-equivalent canonical ladder.
     */
    productUnitMg?: number;
    /** Material mass in mg per unit; the only candidate ladder divisor. */
    productUnitMaterialMassMg?: number;
    /** Basis that productUnitMaterialMassMg is stated on. Must be explicit. */
    productMaterialMassBasis?: string;
    /** Units the package holds. Suppresses counts the pack cannot satisfy. */
    productUnitsPerPack?: number;
    productFormat?: string;
    productPhotoUrl?: string;
    strengthOffset?: "standard" | "stronger" | "lighter";
    strengthRationale?: string;
  }>;
}

export function scoreStrains(options: ScoreOptions): ScoredRecommendation[] {
  const { intentVector, experienceLevel, profiles, feedbackMods, adminConfigs } = options;
  const targetDoseLevel = determineDoseLevel(intentVector, experienceLevel);

  const scored: ScoredRecommendation[] = profiles.map(profile => {
    // Layer 1: Base cosine similarity
    let baseScore = cosineSimilarity(intentVector, profile);
    baseScore = applyExperienceModifier(baseScore, experienceLevel, profile.beginnerFriendly);

    // Layer 2: Feedback modifier (stub or real)
    const feedbackMod = feedbackMods?.get(profile.strainSlug) ?? 0;

    // Layer 3: Admin overrides
    const adminConfig = adminConfigs?.get(profile.strainSlug);
    let adminMod = 0;
    if (adminConfig?.intentOverrides) {
      // Check each mood tile / intent category for overrides
      for (const override of Object.values(adminConfig.intentOverrides)) {
        if (override === "boost") adminMod += 10;
        else if (override === "suppress") adminMod -= 20;
        else if (override === "pin") adminMod += 100;
      }
    }

    const matchScore = Math.max(0, Math.min(100, baseScore + feedbackMod + adminMod));

    // Dose calculation
    const baseDoseRange = calculateDoseRange(targetDoseLevel, profile.doseSensitivity);
    const doseInfo = CANONICAL_DOSE_LEVELS.find(d => d.level === targetDoseLevel);
    const strengthOffset = adminConfig?.strengthOffset ?? "standard";
    const strengthMultiplier =
      strengthOffset === "stronger" ? 0.8 :
      strengthOffset === "lighter" ? 1.15 :
      1;
    const doseRange = {
      lowMg: Math.round(baseDoseRange.lowMg * strengthMultiplier),
      highMg: Math.round(baseDoseRange.highMg * strengthMultiplier),
    };

    // Product recommendation — eligibility is separate from unit-count emission.
    // A mapped product always gets name/photo/link; the unit count is added only
    // when the product carries a divisor on the same basis as the ladder.
    let product: ScoredRecommendation["product"] | undefined;
    if (adminConfig?.productName) {
      product = {
        name: adminConfig.productName,
        url: adminConfig.productUrl || "",
        format: adminConfig.productFormat || "capsule",
        photoUrl: adminConfig.productPhotoUrl,
        strengthOffset,
        strengthRationale: adminConfig.strengthRationale,
      };

      // Like-for-like guard. productUnitMg (active-compound mg) is deliberately
      // not consulted here: dividing dried-mushroom mg by active-compound mg is
      // the KEWL-2346 defect and overstates counts by orders of magnitude.
      // The pack-size rule is applied against THIS recommendation's doseRange,
      // so a product keeps its count at a level the pack can satisfy.
      const suggestedUnits = computeSuggestedUnits(doseRange, {
        activeCompound: adminConfig.activeCompound,
        unitMaterialMassMg: adminConfig.productUnitMaterialMassMg,
        materialMassBasis: adminConfig.productMaterialMassBasis,
        unitsPerPack: adminConfig.productUnitsPerPack,
      });
      if (suggestedUnits) {
        product.suggestedUnits = suggestedUnits;
      }
    }

    // Cautions
    const adminCautionText = adminConfig?.cautionFlags?.custom;
    const cautions = generateCautions(profile, adminCautionText);
    const doseGuidanceNote = strengthOffset === "standard"
      ? undefined
      : `Community feedback suggests this product hits ${strengthOffset === "stronger" ? "stronger" : "lighter"} than standard guidance. ${adminConfig?.strengthRationale ? `${adminConfig.strengthRationale} ` : ""}Adjust accordingly.`;
    if (doseGuidanceNote) {
      cautions.push(doseGuidanceNote);
    }

    // Stepped path
    const steppedPathNotice = detectSteppedPath(experienceLevel, targetDoseLevel, profile.strainName);

    return {
      strainSlug: profile.strainSlug,
      strainName: profile.strainName,
      matchScore,
      baseScore,
      feedbackMod,
      adminMod,
      doseLevel: targetDoseLevel,
      doseLevelName: doseInfo?.name ?? `Level ${targetDoseLevel}`,
      doseLowMg: doseRange.lowMg,
      doseHighMg: doseRange.highMg,
      product,
      description: `Often described as ${profile.potencyTier.toLowerCase()} potency with ${profile.experienceStability.toLowerCase()} experience stability.`,
      tags: {
        stability: profile.experienceStability,
        doseSensitivity: profile.doseSensitivity,
        beginnerFriendly: profile.beginnerFriendly,
      },
      cautions,
      doseGuidanceNote,
      steppedPathNotice,
    };
  });

  // Sort by matchScore descending
  scored.sort((a, b) => b.matchScore - a.matchScore);

  return scored;
}
