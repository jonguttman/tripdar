import crypto from "crypto";
import { VIBE_KEYS, emptyVibeScores, type VibeKey, type VibeScores } from "./vibes";

export type EmployeeReviewStatus =
  | "assigned"
  | "opened"
  | "submitted"
  | "not_familiar"
  | "overdue"
  | "expired";

export interface EmployeeReviewAxes {
  clarityCognition: number | null;
  moodSocial: number | null;
  visualPattern: number | null;
  somatic: number | null;
  energyDirection: number | null;
  depthDirection: number | null;
}

export interface EmployeeReviewForAggregation extends EmployeeReviewAxes {
  knowsProduct: boolean;
  confidence: number | null;
}

const FIELD_BY_KEY: Record<VibeKey, keyof EmployeeReviewAxes> = {
  clarity_cognition: "clarityCognition",
  mood_social: "moodSocial",
  visual_pattern: "visualPattern",
  somatic: "somatic",
  energy_direction: "energyDirection",
  depth_direction: "depthDirection",
};

export function normalizeEmployeeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createReviewToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function hashReviewToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function hashUserAgent(userAgent: string | null): string | null {
  if (!userAgent) return null;
  return crypto.createHash("sha256").update(userAgent).digest("hex");
}

export function isTerminalReviewStatus(status: string): boolean {
  return status === "submitted" || status === "not_familiar" || status === "expired";
}

export function effectiveAssignmentStatus(
  status: string,
  expiresAt: Date | null,
  now = new Date()
): EmployeeReviewStatus {
  if (status === "submitted" || status === "not_familiar") return status;
  if (status === "expired") return "expired";
  if (expiresAt && expiresAt.getTime() < now.getTime()) return "overdue";
  if (status === "opened") return "opened";
  return "assigned";
}

export function pointsForReview(input: {
  status: "submitted" | "not_familiar";
  opened: boolean;
  timely: boolean;
  complete: boolean;
}): number {
  let points = input.opened ? 1 : 0;
  points += input.status === "not_familiar" ? 2 : 4;
  if (input.status === "submitted" && input.complete) points += 2;
  if (input.timely) points += 1;
  return points;
}

export interface ParticipationSummary {
  assigned: number;
  opened: number;
  submitted: number;
  notFamiliar: number;
  overdue: number;
  expired: number;
  noResponse: number;
  responseRate: number;
}

export function summarizeAssignments(
  assignments: { status: string; expiresAt: Date | null }[],
  now = new Date()
): ParticipationSummary {
  const summary: ParticipationSummary = {
    assigned: assignments.length,
    opened: 0,
    submitted: 0,
    notFamiliar: 0,
    overdue: 0,
    expired: 0,
    noResponse: 0,
    responseRate: 0,
  };

  for (const assignment of assignments) {
    const status = effectiveAssignmentStatus(assignment.status, assignment.expiresAt, now);
    if (status === "opened") summary.opened += 1;
    if (status === "submitted") summary.submitted += 1;
    if (status === "not_familiar") summary.notFamiliar += 1;
    if (status === "overdue") summary.overdue += 1;
    if (status === "expired") summary.expired += 1;
    if (status === "assigned" || status === "opened" || status === "overdue") summary.noResponse += 1;
  }

  const completed = summary.submitted + summary.notFamiliar;
  summary.responseRate = assignments.length === 0 ? 0 : Math.round((completed / assignments.length) * 100);
  return summary;
}

function sliderToAxis(value: number): number {
  return Math.max(-1, Math.min(1, (value - 50) / 50));
}

export interface EmployeeGuidanceAggregate {
  sampleSize: number;
  axisCounts: Record<VibeKey, number>;
  scores: VibeScores | null;
  confidence: "none" | "low" | "building" | "solid";
  spread: number | null;
  recommendationReady: boolean;
}

export function aggregateEmployeeGuidance(
  reviews: EmployeeReviewForAggregation[],
  options: { minSamples?: number; maxSpread?: number } = {}
): EmployeeGuidanceAggregate {
  const minSamples = options.minSamples ?? 3;
  const maxSpread = options.maxSpread ?? 0.45;
  const known = reviews.filter((review) => review.knowsProduct);
  const sums = emptyVibeScores();
  const squares = emptyVibeScores();
  const axisCounts = {} as Record<VibeKey, number>;
  for (const key of VIBE_KEYS) axisCounts[key] = 0;

  for (const review of known) {
    for (const key of VIBE_KEYS) {
      const raw = review[FIELD_BY_KEY[key]];
      if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
      const value = sliderToAxis(raw);
      sums[key] += value;
      squares[key] += value * value;
      axisCounts[key] += 1;
    }
  }

  const hasAxes = VIBE_KEYS.some((key) => axisCounts[key] > 0);
  if (!hasAxes) {
    return {
      sampleSize: known.length,
      axisCounts,
      scores: null,
      confidence: "none",
      spread: null,
      recommendationReady: false,
    };
  }

  const scores = emptyVibeScores();
  const deviations: number[] = [];
  for (const key of VIBE_KEYS) {
    const n = axisCounts[key];
    if (n === 0) continue;
    const mean = sums[key] / n;
    scores[key] = Math.round(mean * 100) / 100;
    if (n > 1) {
      const variance = Math.max(0, squares[key] / n - mean * mean);
      deviations.push(Math.sqrt(variance));
    }
  }

  const spread =
    deviations.length > 0
      ? Math.round((deviations.reduce((total, value) => total + value, 0) / deviations.length) * 100) / 100
      : null;
  const sampleSize = known.length;
  const agreementOk = spread === null || spread <= maxSpread;
  const confidence =
    sampleSize < minSamples ? "low" : sampleSize >= 8 && agreementOk ? "solid" : agreementOk ? "building" : "low";

  return {
    sampleSize,
    axisCounts,
    scores,
    confidence,
    spread,
    recommendationReady: sampleSize >= minSamples && agreementOk,
  };
}
