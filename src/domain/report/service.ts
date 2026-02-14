/**
 * Trip Report Service
 *
 * Handles all operations for trip reports.
 */

import { prisma } from "@/lib/prisma";
import {
  CreateReportInput,
  ModerateReportInput,
  PublicReport,
  TripReport,
  ReportStatus,
  DOSE_CATEGORIES,
} from "./types";

/**
 * Create a new trip report (goes into moderation queue)
 */
export async function createReport(
  input: CreateReportInput
): Promise<TripReport> {
  // Validate dose category
  if (!DOSE_CATEGORIES.includes(input.doseCategory)) {
    throw new Error(
      `Invalid dose category. Must be one of: ${DOSE_CATEGORIES.join(", ")}`
    );
  }

  // Validate title
  if (input.title.length < 5) {
    throw new Error("Title must be at least 5 characters");
  }

  if (input.title.length > 200) {
    throw new Error("Title must be less than 200 characters");
  }

  // Validate body
  if (input.body.length < 50) {
    throw new Error("Report body must be at least 50 characters");
  }

  if (input.body.length > 10000) {
    throw new Error("Report body must be less than 10000 characters");
  }

  // Validate peak intensity if provided
  if (
    input.peakIntensity !== undefined &&
    (input.peakIntensity < 1 || input.peakIntensity > 10)
  ) {
    throw new Error("Peak intensity must be between 1 and 10");
  }

  const report = await prisma.tripReport.create({
    data: {
      strainSlug: input.strainSlug,
      sessionHash: input.sessionHash,
      partnerId: input.partnerId,
      doseAmount: input.doseAmount,
      doseCategory: input.doseCategory,
      setting: input.setting,
      intention: input.intention || null,
      title: input.title,
      body: input.body,
      duration: input.duration || null,
      peakIntensity: input.peakIntensity || null,
      status: "pending",
    },
  });

  return report as TripReport;
}

/**
 * Get approved reports for a strain
 */
export async function getApprovedReports(
  strainSlug: string,
  limit: number = 10,
  offset: number = 0
): Promise<{ reports: PublicReport[]; total: number }> {
  const [reports, total] = await Promise.all([
    prisma.tripReport.findMany({
      where: { strainSlug, status: "approved" },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        strainSlug: true,
        doseAmount: true,
        doseCategory: true,
        setting: true,
        intention: true,
        title: true,
        body: true,
        duration: true,
        peakIntensity: true,
        createdAt: true,
      },
    }),
    prisma.tripReport.count({
      where: { strainSlug, status: "approved" },
    }),
  ]);

  return {
    reports: reports.map((r: (typeof reports)[number]) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })) as PublicReport[],
    total,
  };
}

/**
 * Get all reports for moderation (admin only)
 */
export async function getReportsForModeration(
  status?: ReportStatus,
  limit: number = 50,
  offset: number = 0
): Promise<{ reports: TripReport[]; total: number }> {
  const where = status ? { status } : {};

  const [reports, total] = await Promise.all([
    prisma.tripReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.tripReport.count({ where }),
  ]);

  return {
    reports: reports as TripReport[],
    total,
  };
}

/**
 * Moderate a report (approve or reject)
 */
export async function moderateReport(
  input: ModerateReportInput
): Promise<TripReport> {
  const report = await prisma.tripReport.update({
    where: { id: input.reportId },
    data: {
      status: input.status,
      moderatedAt: new Date(),
      moderatedBy: input.moderatorId,
    },
  });

  return report as TripReport;
}

/**
 * Get a single report by ID
 */
export async function getReportById(id: string): Promise<TripReport | null> {
  const report = await prisma.tripReport.findUnique({
    where: { id },
  });

  return report as TripReport | null;
}

/**
 * Get report count for a strain
 */
export async function getReportCount(strainSlug: string): Promise<number> {
  return prisma.tripReport.count({
    where: { strainSlug, status: "approved" },
  });
}

/**
 * Check if a session has already submitted a report for a strain
 */
export async function hasSessionReportedStrain(
  sessionHash: string,
  strainSlug: string
): Promise<boolean> {
  const report = await prisma.tripReport.findFirst({
    where: { sessionHash, strainSlug },
  });

  return report !== null;
}
