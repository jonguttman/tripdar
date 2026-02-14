/**
 * Setting Insights Service
 *
 * Analyzes trip reports by setting to surface insights like
 * "Best rated in nature settings" or "Popular for ceremonies".
 */

import { prisma } from "@/lib/prisma";

// =============================================================================
// Types
// =============================================================================

export const SETTINGS = [
  "nature",
  "home",
  "ceremony",
  "social",
  "solo",
  "therapeutic",
  "creative",
  "other",
] as const;

export type Setting = (typeof SETTINGS)[number];

export interface SettingInsightData {
  setting: Setting;
  reportCount: number;
  avgIntensity: number | null;
  sentiment: "positive" | "neutral" | "mixed";
  recommendation: string | null;
}

export interface SettingInsightsResponse {
  strainSlug: string;
  insights: SettingInsightData[];
  primarySetting: Setting | null;
  totalReports: number;
}

export interface TopStrainForSetting {
  strainSlug: string;
  reportCount: number;
  avgIntensity: number | null;
  suitabilityScore: number;
}

// =============================================================================
// Helpers
// =============================================================================

function determineSentiment(avgIntensity: number | null): "positive" | "neutral" | "mixed" {
  if (avgIntensity === null) return "neutral";
  if (avgIntensity <= 4) return "positive"; // Gentle = good for that setting
  if (avgIntensity <= 7) return "neutral";
  return "mixed"; // Very intense may be challenging
}

function generateRecommendation(
  setting: string,
  reportCount: number,
  avgIntensity: number | null
): string | null {
  if (reportCount < 3) return null;

  const settingLabel = setting.charAt(0).toUpperCase() + setting.slice(1);

  if (avgIntensity !== null && avgIntensity <= 5) {
    return `Gentle experience in ${settingLabel.toLowerCase()} settings`;
  }
  if (avgIntensity !== null && avgIntensity >= 7) {
    return `Intense - prepare well for ${settingLabel.toLowerCase()} use`;
  }
  if (reportCount >= 5) {
    return `Popular for ${settingLabel.toLowerCase()} experiences`;
  }

  return null;
}

// =============================================================================
// Database Operations
// =============================================================================

/**
 * Get setting insights for a strain
 */
export async function getSettingInsights(strainSlug: string): Promise<SettingInsightsResponse> {
  // Try to get from cache first
  const cached = await prisma.settingInsight.findMany({
    where: { strainSlug },
    orderBy: { recommendationScore: "desc" },
  });

  if (cached.length > 0) {
    const insights: SettingInsightData[] = cached.map((c: {
      setting: string;
      reportCount: number;
      avgIntensity: number | null;
    }) => ({
      setting: c.setting as Setting,
      reportCount: c.reportCount,
      avgIntensity: c.avgIntensity,
      sentiment: determineSentiment(c.avgIntensity),
      recommendation: generateRecommendation(c.setting, c.reportCount, c.avgIntensity),
    }));

    const totalReports = insights.reduce((sum, i) => sum + i.reportCount, 0);
    const primarySetting = insights.length > 0 && insights[0].reportCount >= 3
      ? insights[0].setting
      : null;

    return { strainSlug, insights, primarySetting, totalReports };
  }

  // Compute from trip reports
  return computeSettingInsights(strainSlug);
}

/**
 * Compute setting insights from trip reports
 */
export async function computeSettingInsights(strainSlug: string): Promise<SettingInsightsResponse> {
  const reports = await prisma.tripReport.groupBy({
    by: ["setting"],
    where: {
      strainSlug,
      status: "approved",
    },
    _count: { id: true },
    _avg: { peakIntensity: true },
  });

  const insights: SettingInsightData[] = [];

  for (const setting of SETTINGS) {
    const report = reports.find((r: { setting: string }) => r.setting === setting);

    if (report) {
      const insight: SettingInsightData = {
        setting,
        reportCount: report._count.id,
        avgIntensity: report._avg.peakIntensity,
        sentiment: determineSentiment(report._avg.peakIntensity),
        recommendation: generateRecommendation(setting, report._count.id, report._avg.peakIntensity),
      };

      insights.push(insight);

      // Cache to database
      const recommendationScore = report._count.id * (report._avg.peakIntensity ? (10 - report._avg.peakIntensity) / 10 : 0.5);

      await prisma.settingInsight.upsert({
        where: {
          strainSlug_setting: { strainSlug, setting },
        },
        update: {
          reportCount: report._count.id,
          avgIntensity: report._avg.peakIntensity,
          recommendationScore,
        },
        create: {
          strainSlug,
          setting,
          reportCount: report._count.id,
          avgIntensity: report._avg.peakIntensity,
          recommendationScore,
        },
      });
    }
  }

  // Sort by report count
  insights.sort((a, b) => b.reportCount - a.reportCount);

  const totalReports = insights.reduce((sum, i) => sum + i.reportCount, 0);
  const primarySetting = insights.length > 0 && insights[0].reportCount >= 3
    ? insights[0].setting
    : null;

  return { strainSlug, insights, primarySetting, totalReports };
}

/**
 * Get top strains for a specific setting
 */
export async function getTopStrainsForSetting(
  setting: Setting,
  limit: number = 10
): Promise<TopStrainForSetting[]> {
  const results = await prisma.settingInsight.findMany({
    where: {
      setting,
      reportCount: { gte: 3 },
    },
    orderBy: { recommendationScore: "desc" },
    take: limit,
  });

  return results.map((r: {
    strainSlug: string;
    reportCount: number;
    avgIntensity: number | null;
    recommendationScore: number;
  }) => ({
    strainSlug: r.strainSlug,
    reportCount: r.reportCount,
    avgIntensity: r.avgIntensity,
    suitabilityScore: r.recommendationScore,
  }));
}
