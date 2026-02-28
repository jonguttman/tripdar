/**
 * Analytics Service
 *
 * Handles analytics event creation and retrieval.
 */

import { prisma } from "@/lib/prisma";
import type {
  CreateEventInput,
  EventType,
  OverviewStats,
  StrainStats,
  TrendDataPoint,
} from "./types";

/**
 * Record an analytics event
 */
export async function recordEvent(input: CreateEventInput): Promise<void> {
  await prisma.analyticsEvent.create({
    data: {
      eventType: input.eventType,
      entitySlug: input.entitySlug || null,
      partnerId: input.partnerId,
      sessionHash: input.sessionHash,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}

/**
 * Get overview stats for a given period
 */
export async function getOverviewStats(
  days: number = 7
): Promise<OverviewStats> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const previousPeriodStart = new Date(
    periodStart.getTime() - days * 24 * 60 * 60 * 1000
  );

  // Get current period counts
  const currentCounts = await getEventCounts(periodStart, now);
  const previousCounts = await getEventCounts(previousPeriodStart, periodStart);

  // Calculate trends (combine page_view and strain_view for total views)
  const currentViews = currentCounts.page_view + currentCounts.strain_view;
  const previousViews = previousCounts.page_view + previousCounts.strain_view;

  const viewsTrend = calculateTrend(previousViews, currentViews);
  const ratingsTrend = calculateTrend(
    previousCounts.rating,
    currentCounts.rating
  );

  // Get average rating
  const avgRating = await getAverageRating(periodStart, now);

  return {
    period: `${days}d`,
    totalViews: currentViews,
    totalSearches: currentCounts.search,
    totalQuizCompletions: currentCounts.quiz_complete,
    totalRatings: currentCounts.rating,
    totalReviews: currentCounts.review,
    totalReports: currentCounts.report,
    avgRating,
    viewsTrend,
    ratingsTrend,
  };
}

/**
 * Get top strains by activity
 */
export async function getTopStrains(
  days: number = 7,
  limit: number = 10
): Promise<StrainStats[]> {
  const periodStart = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000
  );

  // Get strain view counts (both page_view and strain_view)
  const strainViews = await prisma.analyticsEvent.groupBy({
    by: ["entitySlug"],
    where: {
      eventType: { in: ["page_view", "strain_view"] },
      entitySlug: { not: null },
      createdAt: { gte: periodStart },
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: limit,
  });

  // Get additional stats for each strain
  const results: StrainStats[] = [];

  for (const strain of strainViews) {
    if (!strain.entitySlug) continue;

    const [ratingsCount, reviewsCount, reportsCount, avgRatingResult] =
      await Promise.all([
        prisma.strainRating.count({
          where: {
            strainSlug: strain.entitySlug,
            createdAt: { gte: periodStart },
          },
        }),
        prisma.strainReview.count({
          where: {
            strainSlug: strain.entitySlug,
            status: "approved",
            createdAt: { gte: periodStart },
          },
        }),
        prisma.tripReport.count({
          where: {
            strainSlug: strain.entitySlug,
            status: "approved",
            createdAt: { gte: periodStart },
          },
        }),
        prisma.strainRating.aggregate({
          where: {
            strainSlug: strain.entitySlug,
            createdAt: { gte: periodStart },
          },
          _avg: { rating: true },
        }),
      ]);

    results.push({
      strainSlug: strain.entitySlug,
      views: strain._count.id,
      ratings: ratingsCount,
      reviews: reviewsCount,
      reports: reportsCount,
      avgRating: avgRatingResult._avg.rating,
    });
  }

  return results;
}

/**
 * Get trend data points for charting
 */
export async function getTrendData(days: number = 7): Promise<TrendDataPoint[]> {
  const now = new Date();
  const dataPoints: TrendDataPoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const counts = await getEventCounts(dayStart, dayEnd);

    dataPoints.push({
      date: dayStart.toISOString().split("T")[0],
      views: counts.page_view + counts.strain_view,
      ratings: counts.rating,
      reviews: counts.review,
      reports: counts.report,
    });
  }

  return dataPoints;
}

/**
 * Get recent activity events
 */
export async function getRecentActivity(limit: number = 20) {
  const events = await prisma.analyticsEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      eventType: true,
      entitySlug: true,
      createdAt: true,
    },
  });

  return events.map((e: typeof events[number]) => ({
    eventType: e.eventType as EventType,
    entitySlug: e.entitySlug,
    createdAt: e.createdAt.toISOString(),
  }));
}

// Helper functions

async function getEventCounts(
  start: Date,
  end: Date
): Promise<Record<EventType, number>> {
  const counts = await prisma.analyticsEvent.groupBy({
    by: ["eventType"],
    where: {
      createdAt: { gte: start, lte: end },
    },
    _count: { id: true },
  });

  const result: Record<EventType, number> = {
    page_view: 0,
    quiz_complete: 0,
    search: 0,
    rating: 0,
    review: 0,
    report: 0,
    strain_tried: 0,
    strain_view: 0,
    dosing_guide_created: 0,
    dosing_guide_downloaded: 0,
  };

  for (const count of counts) {
    const eventType = count.eventType as EventType;
    if (eventType in result) {
      result[eventType] = count._count.id;
    }
  }

  return result;
}

async function getAverageRating(
  start: Date,
  end: Date
): Promise<number | null> {
  const result = await prisma.strainRating.aggregate({
    where: {
      createdAt: { gte: start, lte: end },
    },
    _avg: { rating: true },
  });

  return result._avg.rating;
}

function calculateTrend(previous: number, current: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 100);
}
