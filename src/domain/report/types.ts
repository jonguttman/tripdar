/**
 * Trip Report Types
 */

export type ReportStatus = "pending" | "approved" | "rejected";

export type DoseCategory = "MICRODOSE" | "LOW" | "MODERATE" | "HIGH" | "HEROIC";

export interface TripReport {
  id: string;
  strainSlug: string;
  sessionHash: string;
  partnerId: string;

  // Dosing info
  doseAmount: string;
  doseCategory: DoseCategory;

  // Experience context
  setting: string;
  intention: string | null;

  // The report itself
  title: string;
  body: string;
  duration: string | null;
  peakIntensity: number | null;

  // Moderation
  status: ReportStatus;
  createdAt: Date;
  moderatedAt: Date | null;
  moderatedBy: string | null;
}

export interface CreateReportInput {
  strainSlug: string;
  sessionHash: string;
  partnerId: string;
  doseAmount: string;
  doseCategory: DoseCategory;
  setting: string;
  intention?: string;
  title: string;
  body: string;
  duration?: string;
  peakIntensity?: number;
}

export interface ModerateReportInput {
  reportId: string;
  status: "approved" | "rejected";
  moderatorId: string;
}

// Public view of a report (approved only, no session/partner info)
export interface PublicReport {
  id: string;
  strainSlug: string;
  doseAmount: string;
  doseCategory: DoseCategory;
  setting: string;
  intention: string | null;
  title: string;
  body: string;
  duration: string | null;
  peakIntensity: number | null;
  createdAt: string; // ISO string
}

// Valid dose categories for validation
export const DOSE_CATEGORIES: DoseCategory[] = [
  "MICRODOSE",
  "LOW",
  "MODERATE",
  "HIGH",
  "HEROIC",
];

// Common settings for the form
export const SETTINGS = [
  "nature",
  "home",
  "ceremony",
  "social",
  "solo",
  "therapeutic",
  "creative",
  "other",
];
