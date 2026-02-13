/**
 * Analytics Aggregation
 *
 * Pre-computes analytics summaries for efficient querying.
 * This can be run as a scheduled job.
 */

import { prisma } from "@/lib/prisma";
import type { Period } from "./types";

/**
 * Aggregate analytics for a given period
 */
export async function aggregatePeriod(
  period: Period,
  periodStart: Date
): Promise<void> {
  const periodEnd = getPeriodEnd(period, periodStart);

  // Get event counts
  const eventCounts = await prisma.analyticsEvent.groupBy({
    by: ["eventType"],
    where: {
      createdAt: { gte: periodStart, lt: periodEnd },
    },
    _count: { id: true },
  });

  // Get average rating
  const avgRatingResult = await prisma.strainRating.aggregate({
    where: {
      createdAt: { gte: periodStart, lt: periodEnd },
    },
    _avg: { rating: true },
  });

  // Map counts
  const counts: Record<string, number> = {};
  for (const e of eventCounts) {
    counts[e.eventType] = e._count.id;
  }

  // Upsert overall summary
  await prisma.analyticsSummary.upsert({
    where: {
      period_periodStart_strainSlug: {
        period,
        periodStart,
        strainSlug: null,
      },
    },
    create: {
      period,
      periodStart,
      strainSlug: null,
      views: counts.page_view || 0,
      searches: counts.search || 0,
      quizCompletions: counts.quiz_complete || 0,
      ratings: counts.rating || 0,
      reviews: counts.review || 0,
      reports: counts.report || 0,
      avgRating: avgRatingResult._avg.rating,
    },
    update: {
      views: counts.page_view || 0,
      searches: counts.search || 0,
      quizCompletions: counts.quiz_complete || 0,
      ratings: counts.rating || 0,
      reviews: counts.review || 0,
      reports: counts.report || 0,
      avgRating: avgRatingResult._avg.rating,
    },
  });

  // Aggregate per-strain stats
  await aggregateStrainStats(period, periodStart, periodEnd);
}

/**
 * Aggregate stats for each strain
 */
async function aggregateStrainStats(
  period: Period,
  periodStart: Date,
  periodEnd: Date
): Promise<void> {
  // Get all strains with activity in this period
  const strainEvents = await prisma.analyticsEvent.groupBy({
    by: ["entitySlug"],
    where: {
      eventType: "page_view",
      entitySlug: { not: null },
      createdAt: { gte: periodStart, lt: periodEnd },
    },
    _count: { id: true },
  });

  for (const strainEvent of strainEvents) {
    if (!strainEvent.entitySlug) continue;

    const strainSlug = strainEvent.entitySlug;

    // Get counts for this strain
    const [ratingsCount, reviewsCount, reportsCount, avgRatingResult] =
      await Promise.all([
        prisma.strainRating.count({
          where: {
            strainSlug,
            createdAt: { gte: periodStart, lt: periodEnd },
          },
        }),
        prisma.strainReview.count({
          where: {
            strainSlug,
            status: "approved",
            createdAt: { gte: periodStart, lt: periodEnd },
          },
        }),
        prisma.tripReport.count({
          where: {
            strainSlug,
            status: "approved",
            createdAt: { gte: periodStart, lt: periodEnd },
          },
        }),
        prisma.strainRating.aggregate({
          where: {
            strainSlug,
            createdAt: { gte: periodStart, lt: periodEnd },
          },
          _avg: { rating: true },
        }),
      ]);

    // Upsert strain summary
    await prisma.analyticsSummary.upsert({
      where: {
        period_periodStart_strainSlug: {
          period,
          periodStart,
          strainSlug,
        },
      },
      create: {
        period,
        periodStart,
        strainSlug,
        views: strainEvent._count.id,
        searches: 0,
        quizCompletions: 0,
        ratings: ratingsCount,
        reviews: reviewsCount,
        reports: reportsCount,
        avgRating: avgRatingResult._avg.rating,
      },
      update: {
        views: strainEvent._count.id,
        ratings: ratingsCount,
        reviews: reviewsCount,
        reports: reportsCount,
        avgRating: avgRatingResult._avg.rating,
      },
    });
  }
}

/**
 * Get the end date for a period
 */
function getPeriodEnd(period: Period, start: Date): Date {
  const end = new Date(start);

  switch (period) {
    case "daily":
      end.setDate(end.getDate() + 1);
      break;
    case "weekly":
      end.setDate(end.getDate() + 7);
      break;
    case "monthly":
      end.setMonth(end.getMonth() + 1);
      break;
  }

  return end;
}

/**
 * Run daily aggregation for yesterday
 */
export async function runDailyAggregation(): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  await aggregatePeriod("daily", yesterday);
}

/**
 * Run weekly aggregation for last week
 */
export async function runWeeklyAggregation(): Promise<void> {
  const lastWeekStart = new Date();
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  lastWeekStart.setHours(0, 0, 0, 0);

  // Align to start of week (Sunday)
  const dayOfWeek = lastWeekStart.getDay();
  lastWeekStart.setDate(lastWeekStart.getDate() - dayOfWeek);

  await aggregatePeriod("weekly", lastWeekStart);
}
