/**
 * Dosage Curve Service
 *
 * Aggregates trip report data to provide expected intensity curves
 * at different dose levels for each strain.
 */

import { prisma } from "@/lib/prisma";

// =============================================================================
// Types
// =============================================================================

export const DOSE_CATEGORIES = ["MICRODOSE", "LOW", "MODERATE", "HIGH", "HEROIC"] as const;
export type DoseCategory = (typeof DOSE_CATEGORIES)[number];

export interface DoseCurvePoint {
  doseCategory: DoseCategory;
  reportCount: number;
  avgIntensity: number | null;
  intensityRange: [number, number] | null;
  confidenceLevel: "low" | "medium" | "high";
}

export interface DosageCurveResponse {
  strainSlug: string;
  dataPoints: DoseCurvePoint[];
  totalReports: number;
}

// =============================================================================
// Confidence Level Computation
// =============================================================================

function getConfidenceLevel(reportCount: number): "low" | "medium" | "high" {
  if (reportCount >= 10) return "high";
  if (reportCount >= 3) return "medium";
  return "low";
}

// =============================================================================
// Database Operations
// =============================================================================

/**
 * Get dosage curve data for a strain
 */
export async function getDosageCurve(strainSlug: string): Promise<DosageCurveResponse> {
  // First try to get from cache table
  const cached = await prisma.doseCurveData.findMany({
    where: { strainSlug },
    orderBy: { doseCategory: "asc" },
  });

  if (cached.length > 0) {
    const dataPoints: DoseCurvePoint[] = cached.map((c: {
      doseCategory: string;
      reportCount: number;
      avgPeakIntensity: number | null;
      minPeakIntensity: number | null;
      maxPeakIntensity: number | null;
    }) => ({
      doseCategory: c.doseCategory as DoseCategory,
      reportCount: c.reportCount,
      avgIntensity: c.avgPeakIntensity,
      intensityRange:
        c.minPeakIntensity !== null && c.maxPeakIntensity !== null
          ? [c.minPeakIntensity, c.maxPeakIntensity] as [number, number]
          : null,
      confidenceLevel: getConfidenceLevel(c.reportCount),
    }));

    const totalReports = dataPoints.reduce((sum, d) => sum + d.reportCount, 0);

    return { strainSlug, dataPoints, totalReports };
  }

  // Compute from trip reports
  return computeDosageCurve(strainSlug);
}

/**
 * Compute dosage curve from trip reports (and cache result)
 */
export async function computeDosageCurve(strainSlug: string): Promise<DosageCurveResponse> {
  // Aggregate trip reports by dose category
  const reports = await prisma.tripReport.groupBy({
    by: ["doseCategory"],
    where: {
      strainSlug,
      status: "approved",
      peakIntensity: { not: null },
    },
    _count: { id: true },
    _avg: { peakIntensity: true },
    _min: { peakIntensity: true },
    _max: { peakIntensity: true },
  });

  const dataPoints: DoseCurvePoint[] = [];

  // Process each dose category
  for (const category of DOSE_CATEGORIES) {
    const report = reports.find((r: { doseCategory: string }) => r.doseCategory === category);

    if (report) {
      const point: DoseCurvePoint = {
        doseCategory: category,
        reportCount: report._count.id,
        avgIntensity: report._avg.peakIntensity,
        intensityRange:
          report._min.peakIntensity !== null && report._max.peakIntensity !== null
            ? [report._min.peakIntensity, report._max.peakIntensity]
            : null,
        confidenceLevel: getConfidenceLevel(report._count.id),
      };

      dataPoints.push(point);

      // Cache to database
      await prisma.doseCurveData.upsert({
        where: {
          strainSlug_doseCategory: { strainSlug, doseCategory: category },
        },
        update: {
          reportCount: report._count.id,
          avgPeakIntensity: report._avg.peakIntensity,
          minPeakIntensity: report._min.peakIntensity,
          maxPeakIntensity: report._max.peakIntensity,
        },
        create: {
          strainSlug,
          doseCategory: category,
          reportCount: report._count.id,
          avgPeakIntensity: report._avg.peakIntensity,
          minPeakIntensity: report._min.peakIntensity,
          maxPeakIntensity: report._max.peakIntensity,
        },
      });
    } else {
      // No data for this category
      dataPoints.push({
        doseCategory: category,
        reportCount: 0,
        avgIntensity: null,
        intensityRange: null,
        confidenceLevel: "low",
      });
    }
  }

  const totalReports = dataPoints.reduce((sum, d) => sum + d.reportCount, 0);

  return { strainSlug, dataPoints, totalReports };
}

/**
 * Refresh all dosage curves (scheduled job)
 */
export async function refreshAllDosageCurves(): Promise<void> {
  // Get all unique strain slugs with trip reports
  const strains = await prisma.tripReport.findMany({
    where: { status: "approved" },
    select: { strainSlug: true },
    distinct: ["strainSlug"],
  });

  for (const strain of strains) {
    await computeDosageCurve(strain.strainSlug);
  }
}
