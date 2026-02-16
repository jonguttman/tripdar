/**
 * Feedback Collection System
 *
 * Stores and aggregates user feedback on strain descriptions.
 * All data is anonymous - no PII collected.
 */

import { FeedbackRating, FeedbackSurvey, DEFAULT_SURVEY_QUESTIONS, SurveyQuestion } from "./quiz.types";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

// =============================================================================
// In-Memory Storage (Replace with database in production)
// =============================================================================

const feedbackRatings: FeedbackRating[] = [];
const feedbackSurveys: FeedbackSurvey[] = [];

// Buffer for batch writes
const BUFFER_FLUSH_SIZE = 50;

// =============================================================================
// Rating Collection
// =============================================================================

/**
 * Record a match rating
 */
export async function recordRating(
  partnerId: string,
  sessionHash: string,
  strainSlug: string,
  matchRating: number
): Promise<{ id: string; needsSurvey: boolean }> {
  // Validate rating is between 0 and 1
  const normalizedRating = Math.max(0, Math.min(1, matchRating));

  // Convert 0-1 rating to 1-5 stars for database
  // 0.0 → 1, 0.25 → 2, 0.5 → 3, 0.75 → 4, 1.0 → 5
  const starRating = Math.round(normalizedRating * 4) + 1;

  // Save to database
  const dbRating = await prisma.strainRating.create({
    data: {
      strainSlug,
      rating: starRating,
      sessionHash,
      partnerId,
    },
  });

  const rating: FeedbackRating = {
    partnerId,
    sessionHash,
    strainSlug,
    matchRating: normalizedRating,
    timestamp: new Date(),
  };

  feedbackRatings.push(rating);

  // Flush if buffer is full
  if (feedbackRatings.length >= BUFFER_FLUSH_SIZE) {
    flushRatings();
  }

  // Determine if we should prompt for survey (rating < 70%)
  const needsSurvey = normalizedRating < 0.7;

  return {
    id: dbRating.id,
    needsSurvey,
  };
}

/**
 * Flush ratings to persistent storage
 */
export function flushRatings(): void {
  if (feedbackRatings.length === 0) return;

  // In production: write to database
  console.log(`[Feedback] Flushing ${feedbackRatings.length} ratings`);

  // Keep in memory for now (would clear after DB write)
  // feedbackRatings.length = 0;
}

// =============================================================================
// Survey Collection
// =============================================================================

/**
 * Record a detailed survey response
 */
export function recordSurvey(
  partnerId: string,
  sessionHash: string,
  strainSlug: string,
  matchRating: number,
  responses: Record<string, string | string[]>,
  freeformText?: string
): { id: string } {
  const survey: FeedbackSurvey = {
    partnerId,
    sessionHash,
    strainSlug,
    matchRating,
    responses,
    freeformText,
    timestamp: new Date(),
  };

  feedbackSurveys.push(survey);

  // Flush if buffer is full
  if (feedbackSurveys.length >= BUFFER_FLUSH_SIZE) {
    flushSurveys();
  }

  return {
    id: randomBytes(8).toString("hex"),
  };
}

/**
 * Flush surveys to persistent storage
 */
export function flushSurveys(): void {
  if (feedbackSurveys.length === 0) return;

  // In production: write to database
  console.log(`[Feedback] Flushing ${feedbackSurveys.length} surveys`);

  // Keep in memory for now
  // feedbackSurveys.length = 0;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate a rating submission
 */
export function validateRating(data: {
  strainSlug?: string;
  matchRating?: number;
}): string[] {
  const errors: string[] = [];

  if (!data.strainSlug || typeof data.strainSlug !== "string") {
    errors.push("strainSlug is required");
  }

  if (data.matchRating === undefined || typeof data.matchRating !== "number") {
    errors.push("matchRating is required and must be a number");
  } else if (data.matchRating < 0 || data.matchRating > 1) {
    errors.push("matchRating must be between 0 and 1");
  }

  return errors;
}

/**
 * Validate a survey submission
 */
export function validateSurvey(data: {
  strainSlug?: string;
  matchRating?: number;
  responses?: Record<string, string | string[]>;
}): string[] {
  const errors: string[] = [];

  // Base validation
  const ratingErrors = validateRating(data);
  errors.push(...ratingErrors);

  if (!data.responses || typeof data.responses !== "object") {
    errors.push("responses object is required");
  } else {
    // Validate required questions are answered
    const requiredQuestions = DEFAULT_SURVEY_QUESTIONS.filter(q => q.required);
    for (const question of requiredQuestions) {
      if (!data.responses[question.id]) {
        errors.push(`Required question "${question.id}" is not answered`);
      }
    }
  }

  return errors;
}

// =============================================================================
// Aggregation (for internal analysis)
// =============================================================================

/**
 * Get aggregate stats for a strain
 */
export function getStrainFeedbackStats(strainSlug: string): {
  totalRatings: number;
  averageMatch: number;
  surveyCount: number;
  topFactors: Record<string, number>;
} {
  const strainRatings = feedbackRatings.filter(r => r.strainSlug === strainSlug);
  const strainSurveys = feedbackSurveys.filter(s => s.strainSlug === strainSlug);

  const averageMatch =
    strainRatings.length > 0
      ? strainRatings.reduce((sum, r) => sum + r.matchRating, 0) / strainRatings.length
      : 0;

  // Aggregate survey factors
  const factorCounts: Record<string, number> = {};
  for (const survey of strainSurveys) {
    for (const [questionId, answer] of Object.entries(survey.responses)) {
      const key = `${questionId}:${Array.isArray(answer) ? answer.join(",") : answer}`;
      factorCounts[key] = (factorCounts[key] || 0) + 1;
    }
  }

  // Sort by count and take top 5
  const topFactors: Record<string, number> = {};
  Object.entries(factorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([key, count]) => {
      topFactors[key] = count;
    });

  return {
    totalRatings: strainRatings.length,
    averageMatch,
    surveyCount: strainSurveys.length,
    topFactors,
  };
}

/**
 * Get all feedback data for export (admin only)
 */
export function exportFeedbackData(): {
  ratings: FeedbackRating[];
  surveys: FeedbackSurvey[];
} {
  return {
    ratings: [...feedbackRatings],
    surveys: [...feedbackSurveys],
  };
}

// =============================================================================
// Survey Questions Export
// =============================================================================

/**
 * Get the default survey questions
 */
export function getSurveyQuestions(): SurveyQuestion[] {
  return DEFAULT_SURVEY_QUESTIONS;
}
