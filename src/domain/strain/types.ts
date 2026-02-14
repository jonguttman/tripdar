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
