/**
 * Admin: Recommendation Engine Dashboard
 *
 * GET /api/v1/admin/recommend/dashboard
 *
 * Returns global engine health metrics: mapped strain count,
 * total recommendations, feedback rate, match distribution, alerts.
 * Requires partner authentication with admin access.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
  createMeta,
  ApiSuccessResponse,
} from "@/domain/partner";
import { loadStrainData } from "@/domain/strain/blob-store";

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context } = auth;

  return withLogging(context, "/api/v1/admin/recommend/dashboard", async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Run queries in parallel
    const [
      allStrains,
      mappedConfigs,
      recentSessions,
      allFeedback,
      feedbackAggregates,
    ] = await Promise.all([
      loadStrainData(),
      prisma.strainRecommendationConfig.findMany({
        where: { productName: { not: null } },
      }),
      prisma.recommendationSession.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.recommendationFeedback.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { quickRating: true },
      }),
      prisma.feedbackAggregate.findMany(),
    ]);

    const totalStrains = allStrains.length;
    const mappedCount = mappedConfigs.length;

    // Feedback distribution
    const distribution = { nailed_it: 0, pretty_close: 0, missed: 0 };
    for (const fb of allFeedback) {
      if (fb.quickRating in distribution) {
        distribution[fb.quickRating as keyof typeof distribution]++;
      }
    }

    const totalResults30d = recentSessions * 3; // ~3 results per session
    const feedbackRate = totalResults30d > 0
      ? Math.round((allFeedback.length / totalResults30d) * 100)
      : 0;

    // Alerts
    const alerts: string[] = [];

    // Alert: Unmapped strains
    const unmappedCount = totalStrains - mappedCount;
    if (unmappedCount > 0) {
      alerts.push(`${unmappedCount} strain${unmappedCount > 1 ? "s" : ""} not mapped to products`);
    }

    // Alert: Negative feedback trends
    for (const agg of feedbackAggregates) {
      if (agg.totalRatings >= 10 && agg.feedbackMod < -10) {
        alerts.push(`${agg.strainSlug} has negative feedback trend for "${agg.intentCategory}" intent`);
      }
    }

    // Alert: Low feedback rate
    if (recentSessions > 20 && feedbackRate < 20) {
      alerts.push(`Feedback rate is ${feedbackRate}% — consider adjusting prompt timing`);
    }

    const response = NextResponse.json<ApiSuccessResponse<{
      totalStrains: number;
      mappedStrains: number;
      mappedPercentage: number;
      recommendations30d: number;
      feedbackCount30d: number;
      feedbackRate: number;
      matchDistribution: typeof distribution;
      alerts: string[];
      meta: ReturnType<typeof createMeta>;
    }>>({
      success: true,
      data: {
        totalStrains,
        mappedStrains: mappedCount,
        mappedPercentage: totalStrains > 0 ? Math.round((mappedCount / totalStrains) * 100) : 0,
        recommendations30d: recentSessions,
        feedbackCount30d: allFeedback.length,
        feedbackRate,
        matchDistribution: distribution,
        alerts,
        meta: createMeta(),
      },
    });

    return addPartnerHeaders(response, partner, context);
  });
}
