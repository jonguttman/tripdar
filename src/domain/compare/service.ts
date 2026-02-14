/**
 * Compare Service
 *
 * Provides side-by-side comparison of multiple strains
 * with computed differences and similarities.
 */

import { getStrainBySlug, InternalStrain } from "@/domain/strain/data";
import { getStrainConfidence } from "@/domain/confidence";
import { findLineagePath } from "@/domain/lineage";

// =============================================================================
// Types
// =============================================================================

export interface CompareAttribute {
  name: string;
  values: (string | number | null)[];
  type: "text" | "number" | "scale" | "list";
  highlights?: number[]; // Indices of "best" or notable values
}

export interface ComparisonResult {
  strains: {
    slug: string;
    name: string;
    potency: string;
    beginner: string;
  }[];
  attributes: CompareAttribute[];
  sharedVibes: string[];
  uniqueVibes: { strain: string; vibes: string[] }[];
  lineageRelation?: {
    related: boolean;
    description?: string;
    distance?: number;
  };
  recommendation?: {
    forBeginners: string | null;
    mostPotent: string | null;
    mostBalanced: string | null;
  };
}

// =============================================================================
// Comparison Logic
// =============================================================================

/**
 * Compare multiple strains side by side
 */
export async function compareStrains(slugs: string[]): Promise<ComparisonResult | null> {
  if (slugs.length < 2 || slugs.length > 5) {
    return null;
  }

  // Get strain data
  const strains: InternalStrain[] = [];
  for (const slug of slugs) {
    const strain = getStrainBySlug(slug);
    if (!strain) return null;
    strains.push(strain);
  }

  // Build basic strain info
  const strainInfo = strains.map(s => ({
    slug: s.id,
    name: s.name,
    potency: s.potency,
    beginner: s.beginner,
  }));

  // Build comparison attributes
  const attributes: CompareAttribute[] = [];

  // Potency comparison
  const potencyOrder = ["Low", "Low-Moderate", "Moderate", "Moderate-High", "High", "Very High", "Extreme"];
  const potencyValues = strains.map(s => s.potency);
  const maxPotencyIdx = potencyValues
    .map((v, i) => ({ v, i }))
    .sort((a, b) => potencyOrder.indexOf(b.v) - potencyOrder.indexOf(a.v))[0].i;
  attributes.push({
    name: "Potency",
    values: potencyValues,
    type: "scale",
    highlights: [maxPotencyIdx],
  });

  // Visual intensity
  attributes.push({
    name: "Visual Intensity",
    values: strains.map(s => s.visual),
    type: "scale",
  });

  // Trip consistency (stability)
  attributes.push({
    name: "Trip Consistency",
    values: strains.map(s => s.stability),
    type: "scale",
  });

  // Beginner friendly
  const beginnerIndices = strains
    .map((s, i) => (s.beginner === "Yes" ? i : -1))
    .filter(i => i >= 0);
  attributes.push({
    name: "Beginner Friendly",
    values: strains.map(s => s.beginner),
    type: "text",
    highlights: beginnerIndices,
  });

  // Confidence
  const confidenceData = await Promise.all(slugs.map(s => getStrainConfidence(s)));
  attributes.push({
    name: "Confidence Score",
    values: confidenceData.map((c, i) => c?.communityConfidence ?? strains[i].confidence),
    type: "number",
  });

  // Generation (lineage)
  attributes.push({
    name: "Generation",
    values: strains.map(s => s.generation ?? "Unknown"),
    type: "number",
  });

  // Experience attributes if available
  if (strains.some(s => s.onsetTime)) {
    attributes.push({
      name: "Onset Time",
      values: strains.map(s => s.onsetTime || null),
      type: "text",
    });
  }

  if (strains.some(s => s.typicalDuration)) {
    attributes.push({
      name: "Duration",
      values: strains.map(s => s.typicalDuration || null),
      type: "text",
    });
  }

  if (strains.some(s => s.bodyHeadBalance)) {
    attributes.push({
      name: "Body/Head Balance",
      values: strains.map(s => s.bodyHeadBalance || null),
      type: "scale",
    });
  }

  if (strains.some(s => s.comeUpIntensity)) {
    attributes.push({
      name: "Come-up Intensity",
      values: strains.map(s => s.comeUpIntensity || null),
      type: "text",
    });
  }

  if (strains.some(s => s.peakCharacter)) {
    attributes.push({
      name: "Peak Character",
      values: strains.map(s => s.peakCharacter || null),
      type: "text",
    });
  }

  // Vibe analysis
  const allVibes = new Set<string>();
  for (const strain of strains) {
    for (const vibe of strain.vibe) {
      allVibes.add(vibe);
    }
  }

  // Find shared vibes (in all strains)
  const sharedVibes = Array.from(allVibes).filter(vibe =>
    strains.every(s => s.vibe.includes(vibe))
  );

  // Find unique vibes (only in one strain)
  const uniqueVibes: { strain: string; vibes: string[] }[] = [];
  for (const strain of strains) {
    const unique = strain.vibe.filter(vibe =>
      !strains.some(other => other.id !== strain.id && other.vibe.includes(vibe))
    );
    if (unique.length > 0) {
      uniqueVibes.push({ strain: strain.name, vibes: unique });
    }
  }

  // Check lineage relation (for 2-strain comparison)
  let lineageRelation: ComparisonResult["lineageRelation"] = undefined;
  if (slugs.length === 2) {
    const path = findLineagePath(slugs[0], slugs[1]);
    if (path) {
      lineageRelation = {
        related: true,
        description: path.relationship,
        distance: path.distance,
      };
    } else {
      lineageRelation = { related: false };
    }
  }

  // Generate recommendations
  const recommendation: ComparisonResult["recommendation"] = {
    forBeginners: null,
    mostPotent: null,
    mostBalanced: null,
  };

  // Best for beginners
  const beginnerFriendly = strains.filter(s => s.beginner === "Yes");
  if (beginnerFriendly.length > 0) {
    // Pick the one with highest confidence among beginner-friendly
    const sorted = beginnerFriendly.sort((a, b) => b.confidence - a.confidence);
    recommendation.forBeginners = sorted[0].name;
  }

  // Most potent
  const sortedByPotency = [...strains].sort(
    (a, b) => potencyOrder.indexOf(b.potency) - potencyOrder.indexOf(a.potency)
  );
  recommendation.mostPotent = sortedByPotency[0].name;

  // Most balanced (moderate potency, good for various settings)
  const balanced = strains.filter(s =>
    ["Moderate", "Moderate-High"].includes(s.potency) &&
    s.stability !== "Low"
  );
  if (balanced.length > 0) {
    recommendation.mostBalanced = balanced[0].name;
  }

  return {
    strains: strainInfo,
    attributes,
    sharedVibes,
    uniqueVibes,
    lineageRelation,
    recommendation,
  };
}

/**
 * Get quick comparison highlights for two strains
 */
export function getQuickComparison(slugA: string, slugB: string): { winner: string; reason: string }[] {
  const strainA = getStrainBySlug(slugA);
  const strainB = getStrainBySlug(slugB);

  if (!strainA || !strainB) return [];

  const highlights: { winner: string; reason: string }[] = [];

  // Potency comparison
  const potencyOrder = ["Low", "Low-Moderate", "Moderate", "Moderate-High", "High", "Very High", "Extreme"];
  const potencyA = potencyOrder.indexOf(strainA.potency);
  const potencyB = potencyOrder.indexOf(strainB.potency);

  if (potencyA > potencyB) {
    highlights.push({ winner: strainA.name, reason: "Higher potency" });
  } else if (potencyB > potencyA) {
    highlights.push({ winner: strainB.name, reason: "Higher potency" });
  }

  // Beginner friendliness
  if (strainA.beginner === "Yes" && strainB.beginner !== "Yes") {
    highlights.push({ winner: strainA.name, reason: "Better for beginners" });
  } else if (strainB.beginner === "Yes" && strainA.beginner !== "Yes") {
    highlights.push({ winner: strainB.name, reason: "Better for beginners" });
  }

  // Confidence
  if (strainA.confidence > strainB.confidence + 10) {
    highlights.push({ winner: strainA.name, reason: "More well-documented" });
  } else if (strainB.confidence > strainA.confidence + 10) {
    highlights.push({ winner: strainB.name, reason: "More well-documented" });
  }

  // Visual intensity
  const visualOrder = ["Low", "Low-Moderate", "Moderate", "Moderate-High", "High"];
  const visualA = visualOrder.indexOf(strainA.visual);
  const visualB = visualOrder.indexOf(strainB.visual);

  if (visualA > visualB) {
    highlights.push({ winner: strainA.name, reason: "Stronger visuals" });
  } else if (visualB > visualA) {
    highlights.push({ winner: strainB.name, reason: "Stronger visuals" });
  }

  return highlights;
}
