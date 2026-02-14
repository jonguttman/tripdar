/**
 * Recommendations Service
 *
 * Generates personalized strain recommendations based on user history
 * and community patterns. Implements "people like you also liked" logic.
 */

import { prisma } from "@/lib/prisma";
import { getAllStrains, getStrainBySlug } from "@/domain/strain/data";

// =============================================================================
// Types
// =============================================================================

export interface RecommendedStrain {
  slug: string;
  name: string;
  score: number;
  reason: string;
  potency: string;
}

export interface RecommendationsResponse {
  recommendations: RecommendedStrain[];
  basedOn: string[];
  algorithm: string;
}

export interface UserPreferences {
  sessionHash: string;
  triedStrains: string[];
  ratedStrains: { slug: string; rating: number }[];
  topVibes: string[];
  avgPotencyPreference: number;
}

export interface StrainSimilarity {
  strainA: string;
  strainB: string;
  score: number;
}

// =============================================================================
// User Profile Operations
// =============================================================================

/**
 * Get or build user preferences from their history
 */
export async function getUserPreferences(sessionHash: string): Promise<UserPreferences> {
  // Get user's strain interactions
  const userStrains = await prisma.userStrainProfile.findMany({
    where: { sessionHash },
  });

  type UserStrainEntry = { strainSlug: string; tried: boolean; rating: number | null };
  const triedStrains = userStrains.filter((s: UserStrainEntry) => s.tried).map((s: UserStrainEntry) => s.strainSlug);
  const ratedStrains = userStrains
    .filter((s: UserStrainEntry) => s.rating !== null)
    .map((s: UserStrainEntry) => ({ slug: s.strainSlug, rating: s.rating! }));

  // Calculate vibe preferences from tried strains
  const vibeCount = new Map<string, number>();
  let totalPotencyScore = 0;
  let potencyCount = 0;

  const allStrains = getAllStrains();
  for (const slug of triedStrains) {
    const strain = allStrains.find(s => s.id === slug);
    if (strain) {
      // Count vibes
      for (const vibe of strain.vibe) {
        vibeCount.set(vibe, (vibeCount.get(vibe) || 0) + 1);
      }
      // Track potency preference
      const potencyMap: Record<string, number> = {
        "Low": 1, "Low-Moderate": 2, "Moderate": 3, "Moderate-High": 4,
        "High": 5, "Very High": 6, "Extreme": 7
      };
      if (potencyMap[strain.potency]) {
        totalPotencyScore += potencyMap[strain.potency];
        potencyCount++;
      }
    }
  }

  // Sort vibes by frequency
  const topVibes = Array.from(vibeCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([vibe]) => vibe);

  return {
    sessionHash,
    triedStrains,
    ratedStrains,
    topVibes,
    avgPotencyPreference: potencyCount > 0 ? totalPotencyScore / potencyCount : 3,
  };
}

/**
 * Record that a user tried a strain
 */
export async function recordStrainTried(sessionHash: string, strainSlug: string): Promise<void> {
  await prisma.userStrainProfile.upsert({
    where: { sessionHash_strainSlug: { sessionHash, strainSlug } },
    update: { tried: true },
    create: { sessionHash, strainSlug, tried: true },
  });
}

/**
 * Record a user rating for a strain
 */
export async function recordStrainRating(
  sessionHash: string,
  strainSlug: string,
  rating: number
): Promise<void> {
  await prisma.userStrainProfile.upsert({
    where: { sessionHash_strainSlug: { sessionHash, strainSlug } },
    update: { rating, tried: true },
    create: { sessionHash, strainSlug, rating, tried: true },
  });
}

// =============================================================================
// Correlation Computation
// =============================================================================

/**
 * Compute strain correlations based on co-occurrence patterns
 */
export async function computeStrainCorrelations(): Promise<number> {
  // Get all user profiles grouped by session
  const profiles = await prisma.userStrainProfile.findMany({
    where: { tried: true },
  });

  // Group by session
  const sessionStrains = new Map<string, string[]>();
  for (const profile of profiles) {
    const existing = sessionStrains.get(profile.sessionHash) || [];
    existing.push(profile.strainSlug);
    sessionStrains.set(profile.sessionHash, existing);
  }

  // Count co-occurrences
  const coOccurrence = new Map<string, { count: number; ratingsA: number[]; ratingsB: number[] }>();

  for (const strains of sessionStrains.values()) {
    // For each pair of strains in this session
    for (let i = 0; i < strains.length; i++) {
      for (let j = i + 1; j < strains.length; j++) {
        // Always store with alphabetically first strain as strainA
        const [strainA, strainB] = [strains[i], strains[j]].sort();
        const key = `${strainA}|${strainB}`;

        const existing = coOccurrence.get(key) || { count: 0, ratingsA: [], ratingsB: [] };
        existing.count++;
        coOccurrence.set(key, existing);
      }
    }
  }

  // Update database
  let updatedCount = 0;
  for (const [key, data] of coOccurrence.entries()) {
    const [strainA, strainB] = key.split("|");

    // Compute similarity score (simple co-occurrence for now)
    // Could be enhanced with rating correlation, shared vibes, etc.
    const similarityScore = Math.min(data.count / 10, 1) * 100;

    await prisma.strainCorrelation.upsert({
      where: { strainA_strainB: { strainA, strainB } },
      update: {
        coOccurrenceCount: data.count,
        similarityScore,
      },
      create: {
        strainA,
        strainB,
        coOccurrenceCount: data.count,
        similarityScore,
      },
    });
    updatedCount++;
  }

  return updatedCount;
}

// =============================================================================
// Recommendation Generation
// =============================================================================

/**
 * Get personalized recommendations for a user
 */
export async function getRecommendations(
  sessionHash: string,
  limit: number = 5
): Promise<RecommendationsResponse> {
  const prefs = await getUserPreferences(sessionHash);

  // If user has no history, return popular strains
  if (prefs.triedStrains.length === 0) {
    return getPopularRecommendations(limit);
  }

  // Get correlated strains based on what user has tried
  const correlations = await prisma.strainCorrelation.findMany({
    where: {
      OR: [
        { strainA: { in: prefs.triedStrains } },
        { strainB: { in: prefs.triedStrains } },
      ],
    },
    orderBy: { similarityScore: "desc" },
    take: 50,
  });

  // Score candidate strains
  const candidateScores = new Map<string, { score: number; reasons: string[] }>();

  for (const corr of correlations) {
    // Find the strain that's NOT in user's tried list
    let candidateSlug: string;
    let triedSlug: string;

    if (prefs.triedStrains.includes(corr.strainA)) {
      if (prefs.triedStrains.includes(corr.strainB)) continue; // Already tried both
      candidateSlug = corr.strainB;
      triedSlug = corr.strainA;
    } else {
      candidateSlug = corr.strainA;
      triedSlug = corr.strainB;
    }

    const existing = candidateScores.get(candidateSlug) || { score: 0, reasons: [] };
    existing.score += corr.similarityScore;

    const triedStrain = getStrainBySlug(triedSlug);
    if (triedStrain) {
      existing.reasons.push(`Similar to ${triedStrain.name}`);
    }

    candidateScores.set(candidateSlug, existing);
  }

  // Boost scores based on vibe matching
  const allStrains = getAllStrains();
  for (const strain of allStrains) {
    if (prefs.triedStrains.includes(strain.id)) continue;

    const existing = candidateScores.get(strain.id) || { score: 0, reasons: [] };

    // Vibe matching bonus
    const matchingVibes = strain.vibe.filter(v => prefs.topVibes.includes(v));
    if (matchingVibes.length > 0) {
      existing.score += matchingVibes.length * 10;
      existing.reasons.push(`Matches your vibes: ${matchingVibes.join(", ")}`);
    }

    // Potency preference alignment
    const potencyMap: Record<string, number> = {
      "Low": 1, "Low-Moderate": 2, "Moderate": 3, "Moderate-High": 4,
      "High": 5, "Very High": 6, "Extreme": 7
    };
    const strainPotency = potencyMap[strain.potency] || 3;
    const potencyDiff = Math.abs(strainPotency - prefs.avgPotencyPreference);
    if (potencyDiff <= 1) {
      existing.score += 15;
    }

    candidateScores.set(strain.id, existing);
  }

  // Sort and get top recommendations
  const sorted = Array.from(candidateScores.entries())
    .filter(([_, data]) => data.score > 0)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit);

  const recommendations: RecommendedStrain[] = sorted.map(([slug, data]) => {
    const strain = getStrainBySlug(slug);
    return {
      slug,
      name: strain?.name || slug,
      score: Math.round(data.score),
      reason: data.reasons[0] || "Based on your preferences",
      potency: strain?.potency || "Unknown",
    };
  });

  return {
    recommendations,
    basedOn: prefs.triedStrains.slice(0, 3),
    algorithm: "collaborative-filtering-v1",
  };
}

/**
 * Get popular strain recommendations (for new users)
 */
export async function getPopularRecommendations(limit: number = 5): Promise<RecommendationsResponse> {
  // Get most-tried strains
  const popularStrains = await prisma.userStrainProfile.groupBy({
    by: ["strainSlug"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: limit,
  });

  const allStrains = getAllStrains();
  const recommendations: RecommendedStrain[] = [];

  // If no data, fall back to beginner-friendly strains
  if (popularStrains.length === 0) {
    const beginnerStrains = allStrains
      .filter(s => s.beginner === "Yes")
      .slice(0, limit);

    for (const strain of beginnerStrains) {
      recommendations.push({
        slug: strain.id,
        name: strain.name,
        score: 100,
        reason: "Beginner-friendly classic",
        potency: strain.potency,
      });
    }
  } else {
    for (const pop of popularStrains) {
      const strain = getStrainBySlug(pop.strainSlug);
      if (strain) {
        recommendations.push({
          slug: strain.id,
          name: strain.name,
          score: pop._count.id * 10,
          reason: `Popular choice (${pop._count.id} tries)`,
          potency: strain.potency,
        });
      }
    }
  }

  return {
    recommendations,
    basedOn: [],
    algorithm: "popular-strains",
  };
}

/**
 * Get similar strains to a given strain
 */
export async function getSimilarStrains(
  strainSlug: string,
  limit: number = 5
): Promise<RecommendedStrain[]> {
  const strain = getStrainBySlug(strainSlug);
  if (!strain) return [];

  // Get correlation-based similarities
  const correlations = await prisma.strainCorrelation.findMany({
    where: {
      OR: [{ strainA: strainSlug }, { strainB: strainSlug }],
    },
    orderBy: { similarityScore: "desc" },
    take: limit * 2,
  });

  const candidateScores = new Map<string, number>();

  for (const corr of correlations) {
    const otherSlug = corr.strainA === strainSlug ? corr.strainB : corr.strainA;
    candidateScores.set(otherSlug, corr.similarityScore);
  }

  // Also consider attribute similarity
  const allStrains = getAllStrains();
  for (const candidate of allStrains) {
    if (candidate.id === strainSlug) continue;

    let attrScore = candidateScores.get(candidate.id) || 0;

    // Same potency level
    if (candidate.potency === strain.potency) {
      attrScore += 20;
    }

    // Shared vibes
    const sharedVibes = candidate.vibe.filter(v => strain.vibe.includes(v));
    attrScore += sharedVibes.length * 10;

    // Same lineage (siblings or parent/child)
    if (strain.parentStrains?.some(p => candidate.parentStrains?.includes(p))) {
      attrScore += 30; // Siblings
    }
    if (strain.parentStrains?.includes(candidate.id) || candidate.parentStrains?.includes(strainSlug)) {
      attrScore += 25; // Parent/child
    }

    if (attrScore > 0) {
      candidateScores.set(candidate.id, attrScore);
    }
  }

  // Sort and return top similar
  const sorted = Array.from(candidateScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  return sorted.map(([slug, score]) => {
    const s = getStrainBySlug(slug);
    return {
      slug,
      name: s?.name || slug,
      score: Math.round(score),
      reason: "Similar characteristics",
      potency: s?.potency || "Unknown",
    };
  });
}
