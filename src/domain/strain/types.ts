/**
 * Strain Types
 *
 * Type definitions for strain data.
 */

/**
 * Internal strain representation (stored in blob)
 */
export interface InternalStrain {
  id: string;
  name: string;
  potency: string;
  stability: string;
  beginner: string;
  visual: string;
  vibe: string[];
  confidence: number;
  description: string;
  origin?: string;
  createdAt?: string;
  updatedAt?: string;

  // Lineage fields
  parentStrains?: string[];    // IDs of parent strains (e.g., ["penis-envy", "b-plus"])
  lineageNotes?: string;       // Breeding/cross notes (e.g., "Cross of PE × B+")
  generation?: number;         // Distance from wild type (0 = wild, 1 = F1, etc.)

  // Experiential attributes (Feature 6)
  onsetTime?: string;          // Time to first effects
  typicalDuration?: string;    // Total experience duration
  bodyHeadBalance?: string;    // Body vs head effects balance
  emotionalCharacter?: string[]; // Emotional qualities
  comeUpIntensity?: string;    // How the come-up feels
  peakCharacter?: string;      // Peak experience pattern

  // Dose experience descriptions (6-element array, one per dose level)
  doseExperiences?: string[];

  // Image URL from blob storage (populated at runtime, not stored)
  imageUrl?: string;
}

/**
 * Lineage tree node for API response
 */
export interface StrainLineageNode {
  id: string;
  name: string;
  potency: string;
  beginner: string;
  parents: StrainLineageNode[];
  children: string[];          // Just IDs for children to avoid circular refs
  lineageNotes?: string;
  generation?: number;
}

/**
 * Strain data file structure in Vercel Blob
 */
export interface StrainDataFile {
  version: string;
  updatedAt: string;
  updatedBy: string;
  strains: InternalStrain[];
}

/**
 * Potency options
 */
export const POTENCY_OPTIONS = [
  "Low",
  "Low-Moderate",
  "Moderate",
  "Moderate-High",
  "High",
  "High-Very High",
  "Very High",
  "Variable",
] as const;

/**
 * Stability options
 */
export const STABILITY_OPTIONS = [
  "Low",
  "Medium",
  "High",
  "Variable",
] as const;

/**
 * Beginner suitability options
 */
export const BEGINNER_OPTIONS = [
  "Yes",
  "Maybe",
  "No",
] as const;

/**
 * Visual intensity options
 */
export const VISUAL_OPTIONS = [
  "Low",
  "Low-Medium",
  "Medium",
  "Medium-High",
  "High",
  "Very High",
] as const;

/**
 * Onset time options
 */
export const ONSET_TIME_OPTIONS = [
  "15-30 min",
  "30-45 min",
  "45-60 min",
  "60-90 min",
  "Variable",
] as const;

/**
 * Duration options
 */
export const DURATION_OPTIONS = [
  "2-3 hours",
  "3-4 hours",
  "4-6 hours",
  "6-8 hours",
  "8+ hours",
  "Variable",
] as const;

/**
 * Body/head balance options
 */
export const BODY_HEAD_OPTIONS = [
  "Body-heavy",
  "Body-leaning",
  "Balanced",
  "Head-leaning",
  "Head-heavy",
  "Head-dominant",
] as const;

/**
 * Emotional character options (multi-select)
 */
export const EMOTIONAL_CHARACTER_OPTIONS = [
  "Euphoric",
  "Grounding",
  "Challenging",
  "Playful",
  "Contemplative",
  "Cathartic",
  "Mystical",
  "Loving",
  "Energizing",
  "Calming",
] as const;

/**
 * Come-up intensity options
 */
export const COME_UP_OPTIONS = [
  "Gentle",
  "Gradual",
  "Moderate",
  "Intense",
  "Variable",
] as const;

/**
 * Peak character options
 */
export const PEAK_CHARACTER_OPTIONS = [
  "Sustained plateau",
  "Rolling waves",
  "Sharp peak",
  "Multiple peaks",
  "Variable",
] as const;
