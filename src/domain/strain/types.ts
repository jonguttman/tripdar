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
