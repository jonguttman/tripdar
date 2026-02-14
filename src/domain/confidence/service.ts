/**
 * Confidence Service
 *
 * Manages community-validated confidence scores for strains.
 * Aggregates strain_tried events, ratings, and reports to compute
 * dynamic confidence levels.
 */

import { prisma } from "@/lib/prisma";

// =============================================================================
// Types
// =============================================================================

export type VerifiedTier = "emerging" | "developing" | "established" | "verified";

export interface ConfidenceMetrics {
  strainSlug: string;
  baseConfidence: number;
  triedCount: number;
  ratingCount: number;
  reportCount: number;
  avgRating: number | null;
  computedConfidence: number;
  verifiedTier: VerifiedTier;
  lastUpdated: Date;
}

export interface ConfidenceResponse {
  strainSlug: string;
  baseConfidence: number;
  communityConfidence: number;
  verifiedBy: number;
  ratingCount: number;
  reportCount: number;
  tier: VerifiedTier;
}

// =============================================================================
// Confidence Computation
// =============================================================================

/**
 * Compute the verified tier based on engagement metrics
 */
export function computeVerifiedTier(
  triedCount: number,
  ratingCount: number,
  reportCount: number,
  avgRating: number | null
): VerifiedTier {
  const totalEngagements = triedCount + ratingCount + reportCount;

  // Verified: High engagement + good ratings
  if (totalEngagements >= 50 && avgRating !== null && avgRating >= 3.5) {
    return "verified";
  }

  // Established: Solid engagement
  if (totalEngagements >= 20) {
    return "established";
  }

  // Developing: Some engagement
  if (totalEngagements >= 5) {
    return "developing";
  }

  // Emerging: Little to no engagement
  return "emerging";
}

/**
 * Compute the overall confidence score (0-100)
 *
 * Formula:
 * - Base confidence from strain data: 40% weight
 * - Community score: 60% weight
 *   - tried factor: 30% of community score
 *   - rating factor: 50% of community score
 *   - report factor: 20% of community score
 */
export function computeConfidenceScore(
  baseConfidence: number,
  triedCount: number,
  ratingCount: number,
  reportCount: number,
  avgRating: number | null
): number {
  // Normalize counts to 0-1 scale (cap at 100 for tried, 50 for ratings, 20 for reports)
  const triedFactor = Math.min(triedCount / 100, 1);
  const ratingFactor = Math.min(ratingCount / 50, 1);
  const reportFactor = Math.min(reportCount / 20, 1);

  // Rating quality factor (0-1 based on avg rating)
  const ratingQuality = avgRating !== null ? (avgRating - 1) / 4 : 0.5;

  // Community score (0-100)
  const communityScore =
    (triedFactor * 0.3 + ratingFactor * 0.5 * ratingQuality + reportFactor * 0.2) * 100;

  // Weighted combination
  const computed = baseConfidence * 0.4 + communityScore * 0.6;

  return Math.round(Math.max(0, Math.min(100, computed)));
}

// =============================================================================
// Database Operations
// =============================================================================

/**
 * Get confidence metrics for a strain
 */
export async function getStrainConfidence(strainSlug: string): Promise<ConfidenceResponse | null> {
  const confidence = await prisma.strainConfidence.findUnique({
    where: { strainSlug },
  });

  if (!confidence) {
    return null;
  }

  return {
    strainSlug: confidence.strainSlug,
    baseConfidence: confidence.baseConfidence,
    communityConfidence: confidence.computedConfidence,
    verifiedBy: confidence.triedCount,
    ratingCount: confidence.ratingCount,
    reportCount: confidence.reportCount,
    tier: confidence.verifiedTier as VerifiedTier,
  };
}

/**
 * Refresh confidence metrics for a single strain
 */
export async function refreshStrainConfidence(
  strainSlug: string,
  baseConfidence: number
): Promise<ConfidenceMetrics> {
  // Count strain_tried events
  const triedCount = await prisma.analyticsEvent.count({
    where: {
      eventType: "strain_tried",
      entitySlug: strainSlug,
    },
  });

  // Count and average ratings
  const ratingAgg = await prisma.strainRating.aggregate({
    where: { strainSlug },
    _count: { id: true },
    _avg: { rating: true },
  });

  // Count approved reports
  const reportCount = await prisma.tripReport.count({
    where: {
      strainSlug,
      status: "approved",
    },
  });

  const ratingCount = ratingAgg._count.id;
  const avgRating = ratingAgg._avg.rating;

  // Compute metrics
  const verifiedTier = computeVerifiedTier(triedCount, ratingCount, reportCount, avgRating);
  const computedConfidence = computeConfidenceScore(
    baseConfidence,
    triedCount,
    ratingCount,
    reportCount,
    avgRating
  );

  // Upsert to database
  const result = await prisma.strainConfidence.upsert({
    where: { strainSlug },
    update: {
      triedCount,
      ratingCount,
      reportCount,
      avgRating,
      computedConfidence,
      verifiedTier,
    },
    create: {
      strainSlug,
      baseConfidence,
      triedCount,
      ratingCount,
      reportCount,
      avgRating,
      computedConfidence,
      verifiedTier,
    },
  });

  return {
    strainSlug: result.strainSlug,
    baseConfidence: result.baseConfidence,
    triedCount: result.triedCount,
    ratingCount: result.ratingCount,
    reportCount: result.reportCount,
    avgRating: result.avgRating,
    computedConfidence: result.computedConfidence,
    verifiedTier: result.verifiedTier as VerifiedTier,
    lastUpdated: result.lastUpdated,
  };
}

/**
 * Get all confidence metrics (for admin dashboard)
 */
export async function getAllConfidenceMetrics(): Promise<ConfidenceMetrics[]> {
  const results = await prisma.strainConfidence.findMany({
    orderBy: { computedConfidence: "desc" },
  });

  return results.map((r: {
    strainSlug: string;
    baseConfidence: number;
    triedCount: number;
    ratingCount: number;
    reportCount: number;
    avgRating: number | null;
    computedConfidence: number;
    verifiedTier: string;
    lastUpdated: Date;
  }) => ({
    strainSlug: r.strainSlug,
    baseConfidence: r.baseConfidence,
    triedCount: r.triedCount,
    ratingCount: r.ratingCount,
    reportCount: r.reportCount,
    avgRating: r.avgRating,
    computedConfidence: r.computedConfidence,
    verifiedTier: r.verifiedTier as VerifiedTier,
    lastUpdated: r.lastUpdated,
  }));
}
