/**
 * Strain Profile Vector Generator
 *
 * Maps existing strain data into profile vectors for cosine similarity scoring.
 * Weights derived from the Tripdar Strain Experience Guide descriptor clusters.
 */

import type { InternalStrain } from "@/domain/strain/types";
import type { StrainProfileVector, DoseSensitivity } from "./types";

// =============================================================================
// Keyword-to-Weight Mappings (from Strain Experience Guide descriptor clusters)
// =============================================================================

const CLARITY_KEYWORDS = [
  "focused", "clear-headed", "lucid", "philosophical", "introspective",
  "creative", "analytical", "contemplative", "mindful",
];

const MOOD_KEYWORDS = [
  "giggly", "euphoric", "social", "playful", "warm", "heart-opening",
  "connected", "loving", "joyful", "uplifting",
];

const VISUAL_KEYWORDS = [
  "visual", "kaleidoscopic", "immersive", "patterning", "vivid",
  "fractal", "colorful", "geometric", "psychedelic",
];

const SOMATIC_KEYWORDS = [
  "body", "grounded", "relaxation", "wave-like", "tactile",
  "tingling", "warmth", "physical", "sedating", "heavy",
];

const ENERGY_POSITIVE_KEYWORDS = [
  "energizing", "stimulating", "uplifting", "activating", "electric",
  "dynamic", "euphoric", "social", "giggly", "playful",
];

const ENERGY_NEGATIVE_KEYWORDS = [
  "calming", "relaxing", "sedating", "grounding", "peaceful",
  "gentle", "mellow", "soothing", "contemplative", "introspective",
];

const DEPTH_POSITIVE_KEYWORDS = [
  "dreamy", "mystical", "visionary", "transcendent", "psychedelic",
  "immersive", "kaleidoscopic", "ego-dissolving", "transformative", "visual",
];

const DEPTH_NEGATIVE_KEYWORDS = [
  "clear-headed", "lucid", "focused", "functional", "subtle",
  "crisp", "alert", "analytical",
];

// =============================================================================
// Potency → DoseSensitivity Mapping
// =============================================================================

export function mapDoseSensitivity(potency: string, strainName: string): DoseSensitivity {
  const name = strainName.toLowerCase();

  // PE-family strains are very steep (from Strain Experience Guide)
  if (name.includes("penis envy") || name.includes("pe ") ||
      name === "ape" || name === "pe6" || name === "pe7" ||
      name.includes("albino penis")) {
    return "very_steep";
  }

  switch (potency) {
    case "Very High":
    case "High-Very High":
      return "steep";
    case "High":
    case "Moderate-High":
      return "medium";
    default:
      return "gentle";
  }
}

// =============================================================================
// Vector Computation
// =============================================================================

function computeKeywordWeight(vibes: string[], emotionalCharacter: string[], keywords: string[]): number {
  const allTerms = [...vibes, ...emotionalCharacter].map(v => v.toLowerCase());
  let matches = 0;
  for (const keyword of keywords) {
    for (const term of allTerms) {
      if (term.includes(keyword) || keyword.includes(term)) {
        matches++;
        break;
      }
    }
  }
  // Normalize to 0-1 range, capped
  return Math.min(1, matches / Math.max(3, keywords.length * 0.4));
}

function computeEnergyDirection(
  vibes: string[],
  emotionalCharacter: string[],
  comeUpIntensity?: string,
  potency?: string,
): number {
  const positive = computeKeywordWeight(vibes, emotionalCharacter, ENERGY_POSITIVE_KEYWORDS);
  const negative = computeKeywordWeight(vibes, emotionalCharacter, ENERGY_NEGATIVE_KEYWORDS);

  let energy = positive - negative;

  // Come-up intensity shifts energy
  if (comeUpIntensity === "Intense") energy += 0.15;
  if (comeUpIntensity === "Gentle") energy -= 0.15;

  // High potency tends toward intensity
  if (potency === "Very High" || potency === "High-Very High") energy += 0.1;

  return Math.max(-1, Math.min(1, energy));
}

function computeDepthDirection(
  vibes: string[],
  emotionalCharacter: string[],
  visual: string,
  peakCharacter?: string,
): number {
  const dreamy = computeKeywordWeight(vibes, emotionalCharacter, DEPTH_POSITIVE_KEYWORDS);
  const clear = computeKeywordWeight(vibes, emotionalCharacter, DEPTH_NEGATIVE_KEYWORDS);

  let depth = dreamy - clear;

  // Visual intensity shifts toward dreamy
  const visualMap: Record<string, number> = {
    "Very High": 0.3, "High": 0.2, "Medium-High": 0.1,
    "Medium": 0.0, "Low-Medium": -0.1, "Low": -0.2,
  };
  depth += visualMap[visual] ?? 0;

  // Peak character influences depth
  if (peakCharacter === "Multiple peaks" || peakCharacter === "Rolling waves") depth += 0.1;
  if (peakCharacter === "Sustained plateau") depth -= 0.05;

  return Math.max(-1, Math.min(1, depth));
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate a profile vector from internal strain data
 */
export function strainToProfileVector(strain: InternalStrain): StrainProfileVector {
  const vibes = strain.vibe || [];
  const emotional = strain.emotionalCharacter || [];
  const slug = strain.id || strain.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  return {
    strainSlug: slug,
    strainName: strain.name,
    clarity_cognition: computeKeywordWeight(vibes, emotional, CLARITY_KEYWORDS),
    mood_social: computeKeywordWeight(vibes, emotional, MOOD_KEYWORDS),
    visual_pattern: computeKeywordWeight(vibes, emotional, VISUAL_KEYWORDS),
    somatic: computeKeywordWeight(vibes, emotional, SOMATIC_KEYWORDS),
    energy_direction: computeEnergyDirection(vibes, emotional, strain.comeUpIntensity, strain.potency),
    depth_direction: computeDepthDirection(vibes, emotional, strain.visual, strain.peakCharacter),
    potencyTier: strain.potency,
    doseSensitivity: mapDoseSensitivity(strain.potency, strain.name),
    experienceStability: strain.stability,
    beginnerFriendly: strain.beginner,
  };
}

/**
 * Generate profile vectors for all provided strains
 */
export function generateAllProfiles(strains: InternalStrain[]): StrainProfileVector[] {
  return strains.map(strainToProfileVector);
}
