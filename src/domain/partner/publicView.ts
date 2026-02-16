/**
 * Public View Mapping Layer
 *
 * This is the ONLY path from internal strain data to external responses.
 * All transformations, filtering, and sanitization happen here.
 */

import { StrainPublicView } from "./types";

// API version for attribution
export const API_VERSION = "1.0.0";

// =============================================================================
// Internal Strain Type (what Tripdar owns)
// =============================================================================

/**
 * Internal strain record - this mirrors STRAIN_DATA structure
 * but is explicitly typed here to document what we transform FROM
 */
interface InternalStrain {
  id: string;
  name: string;
  potency: string;
  stability: string;
  beginner: string;
  visual: string;
  vibe: string[];
  confidence: number;
  description: string;
  // Lineage fields
  parentStrains?: string[];
  lineageNotes?: string;
  generation?: number;
  // Experiential attributes (Feature 6)
  onsetTime?: string;
  typicalDuration?: string;
  bodyHeadBalance?: string;
  emotionalCharacter?: string[];
  comeUpIntensity?: string;
  peakCharacter?: string;
  // Future internal fields that should NEVER be exposed:
  // rawScores?: Record<string, number>;
  // modelVersion?: string;
  // adminNotes?: string;
  // tuningParams?: Record<string, unknown>;
}

// =============================================================================
// Mapping Functions
// =============================================================================

/**
 * Convert raw potency string to coarse tier
 */
function mapPotencyTier(potency: string): StrainPublicView["characteristics"]["potencyTier"] {
  const p = potency.toLowerCase();
  if (p.includes("very high")) return "very-high";
  if (p.includes("high")) return "high";
  if (p.includes("moderate") || p.includes("medium")) return "moderate";
  if (p.includes("low")) return "low";
  if (p.includes("variable")) return "variable";
  return "moderate";
}

/**
 * Convert visual intensity string to tier
 */
function mapVisualIntensity(visual: string): StrainPublicView["characteristics"]["visualIntensity"] {
  const v = visual.toLowerCase();
  if (v.includes("very high")) return "very-high";
  if (v.includes("high")) return "high";
  if (v.includes("medium") || v.includes("moderate")) return "medium";
  return "low";
}

/**
 * Convert stability string to tier
 */
function mapStability(stability: string): StrainPublicView["characteristics"]["experienceStability"] {
  const s = stability.toLowerCase();
  if (s.includes("high")) return "high";
  if (s.includes("medium") || s.includes("moderate")) return "medium";
  if (s.includes("variable")) return "variable";
  return "low";
}

/**
 * Convert beginner string to tier
 */
function mapBeginnerSuitable(beginner: string): StrainPublicView["characteristics"]["beginnerSuitable"] {
  const b = beginner.toLowerCase();
  if (b === "yes") return "yes";
  if (b === "no") return "no";
  return "maybe";
}

/**
 * Map potency to dose sensitivity
 */
function mapDoseSensitivity(potency: string): StrainPublicView["characteristics"]["doseSensitivity"] {
  const p = potency.toLowerCase();
  if (p.includes("very high")) return "steep";
  if (p.includes("high")) return "moderate";
  return "gentle";
}

/**
 * Convert raw confidence score (0-100) to coarse tier
 * This prevents reverse-engineering of internal scoring
 */
function mapConfidenceTier(confidence: number): StrainPublicView["confidenceTier"] {
  if (confidence >= 80) return "high-confidence";
  if (confidence >= 70) return "established";
  if (confidence >= 60) return "developing";
  return "emerging";
}

/**
 * Generate URL-safe slug from name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Sanitize vibes - remove any that might leak internal info
 */
function sanitizeVibes(vibes: string[]): string[] {
  // Filter out any vibes that look like internal tags
  const blocklist = ["internal", "test", "debug", "admin", "raw", "score"];
  return vibes.filter(v => {
    const lower = v.toLowerCase();
    return !blocklist.some(blocked => lower.includes(blocked));
  });
}

// =============================================================================
// Main Mapping Function
// =============================================================================

/**
 * Map body/head balance to typed value
 */
function mapBodyHeadBalance(balance?: string): "body-heavy" | "body-leaning" | "balanced" | "head-leaning" | "head-heavy" | "head-dominant" | null {
  if (!balance) return null;
  const b = balance.toLowerCase().replace(/[^a-z]/g, "");
  if (b.includes("bodyheavy")) return "body-heavy";
  if (b.includes("bodyleaning")) return "body-leaning";
  if (b.includes("headdominant")) return "head-dominant";
  if (b.includes("headheavy")) return "head-heavy";
  if (b.includes("headleaning")) return "head-leaning";
  return "balanced";
}

/**
 * Transform an internal strain record to a public view.
 * This is the ONLY function that should create StrainPublicView objects.
 */
export function toPublicView(
  internal: InternalStrain,
  visualizationRef?: string
): StrainPublicView {
  const view: StrainPublicView = {
    slug: generateSlug(internal.name),
    name: internal.name,
    species: "Psilocybe cubensis",
    description: internal.description,
    origin: "Various", // Could be enhanced with real origin data
    characteristics: {
      potencyTier: mapPotencyTier(internal.potency),
      visualIntensity: mapVisualIntensity(internal.visual),
      experienceStability: mapStability(internal.stability),
      beginnerSuitable: mapBeginnerSuitable(internal.beginner),
      doseSensitivity: mapDoseSensitivity(internal.potency),
    },
    vibes: sanitizeVibes(internal.vibe),
    confidenceTier: mapConfidenceTier(internal.confidence),
    visualizationRef,
    // Experiential profile (Feature 6)
    experienceProfile: {
      onsetTime: internal.onsetTime || null,
      typicalDuration: internal.typicalDuration || null,
      bodyHeadBalance: mapBodyHeadBalance(internal.bodyHeadBalance),
      emotionalCharacter: internal.emotionalCharacter || [],
      comeUpIntensity: internal.comeUpIntensity || null,
      peakCharacter: internal.peakCharacter || null,
    },
    // Lineage information
    lineage: (internal.parentStrains || internal.lineageNotes || internal.generation !== undefined) ? {
      parentStrains: internal.parentStrains || [],
      lineageNotes: internal.lineageNotes || null,
      generation: internal.generation ?? null,
    } : undefined,
    attribution: {
      source: "tripdar",
      version: API_VERSION,
      generatedAt: new Date().toISOString(),
    },
  };
  return Object.freeze(view) as StrainPublicView;
}

/**
 * Transform multiple strains to public views
 */
export function toPublicViewList(
  internals: InternalStrain[],
  getVisualizationRef?: (id: string) => string | undefined
): StrainPublicView[] {
  return internals.map(internal =>
    toPublicView(internal, getVisualizationRef?.(internal.id))
  );
}

/**
 * Find a strain by slug from internal data
 */
export function findBySlug(
  internals: InternalStrain[],
  slug: string
): InternalStrain | undefined {
  return internals.find(s => generateSlug(s.name) === slug);
}

/**
 * Create response metadata
 */
export function createMeta() {
  return {
    source: "tripdar" as const,
    version: API_VERSION,
    generatedAt: new Date().toISOString(),
  };
}
