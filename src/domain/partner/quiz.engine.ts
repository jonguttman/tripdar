/**
 * Quiz Recommendation Engine
 *
 * Matches quiz answers to strains using tag-based scoring.
 */

import { QuizSubmission, QuizRecommendation, DEFAULT_QUIZ_QUESTIONS } from "./quiz.types";
import { toPublicView } from "./publicView";
import { getAllStrains } from "../strain/data";
import type { InternalStrain } from "../strain/data";

// =============================================================================
// Tag Mapping
// =============================================================================

/**
 * Maps internal strain attributes to matchable tags
 */
function getStrainTags(strain: InternalStrain): string[] {
  const tags: string[] = [];

  // Add vibe tags directly
  tags.push(...strain.vibe.map(v => v.toLowerCase()));

  // Map potency to tags
  const potency = strain.potency.toLowerCase();
  if (potency.includes("low")) tags.push("low-moderate", "gentle");
  if (potency.includes("moderate") && !potency.includes("high")) tags.push("moderate", "balanced");
  if (potency.includes("high") && !potency.includes("very")) tags.push("high", "intense");
  if (potency.includes("very high")) tags.push("very-high", "powerful", "intense");
  if (potency.includes("variable")) tags.push("variable");

  // Map beginner suitability
  const beginner = strain.beginner.toLowerCase();
  if (beginner === "yes") tags.push("beginner-yes", "gentle", "stable");
  if (beginner === "maybe") tags.push("beginner-maybe");
  if (beginner === "no") tags.push("beginner-no", "experienced");

  // Map stability
  const stability = strain.stability.toLowerCase();
  if (stability === "high") tags.push("stable", "dependable");
  if (stability === "variable") tags.push("variable", "unpredictable");

  // Map visual intensity
  const visual = strain.visual.toLowerCase();
  if (visual.includes("high") || visual.includes("very")) tags.push("visual", "immersive");
  if (visual.includes("low")) tags.push("subtle");

  return tags;
}

// =============================================================================
// Scoring Engine
// =============================================================================

interface ScoredStrain {
  strain: InternalStrain;
  score: number;
  matchedTags: string[];
}

/**
 * Score a strain against the user's quiz answers
 */
function scoreStrain(strain: InternalStrain, answerTags: string[]): ScoredStrain {
  const strainTags = getStrainTags(strain);
  const matchedTags: string[] = [];
  let score = 0;

  // Base score from confidence
  score += strain.confidence * 0.2; // Up to 20 points from confidence

  // Tag matching (up to 80 points)
  for (const tag of answerTags) {
    const normalizedTag = tag.toLowerCase();
    if (strainTags.includes(normalizedTag)) {
      matchedTags.push(tag);
      score += 10; // 10 points per matched tag
    }
  }

  // Bonus for multiple tag matches (synergy)
  if (matchedTags.length >= 3) score += 15;
  if (matchedTags.length >= 5) score += 10;

  // Cap at 100
  score = Math.min(100, score);

  return { strain, score, matchedTags };
}

/**
 * Collect all tags from the user's quiz answers
 */
function collectAnswerTags(answers: Record<string, string>): string[] {
  const tags: string[] = [];

  for (const [questionId, answerId] of Object.entries(answers)) {
    // Find the question
    const question = DEFAULT_QUIZ_QUESTIONS.find(q => q.id === questionId);
    if (!question) continue;

    // Find the answer
    const answer = question.answers.find(a => a.id === answerId);
    if (!answer) continue;

    // Collect tags
    tags.push(...answer.tags);
  }

  return tags;
}

// =============================================================================
// Reasoning Generator
// =============================================================================

/**
 * Generate human-readable reasoning for the recommendation
 */
function generateReasoning(
  strain: InternalStrain,
  _matchedTags: string[],
  answers: Record<string, string>
): string {
  const parts: string[] = [];

  // Intention-based reasoning
  if (answers.intention === "clarity") {
    parts.push("your quest for clarity");
  } else if (answers.intention === "wonder") {
    parts.push("your openness to wonder");
  } else if (answers.intention === "connection") {
    parts.push("your desire for connection");
  } else if (answers.intention === "release") {
    parts.push("your readiness to go deep");
  }

  // Depth-based reasoning
  if (answers.depth === "gentle") {
    parts.push("preference for a gentle approach");
  } else if (answers.depth === "deep") {
    parts.push("willingness to explore the depths");
  }

  // Experience-based reasoning
  if (answers.experience === "first") {
    parts.push("this being your first journey");
  } else if (answers.experience === "seasoned") {
    parts.push("your seasoned experience");
  }

  // Construct the sentence
  let reasoning = `${strain.name} emerged from the codex based on `;

  if (parts.length === 1) {
    reasoning += parts[0] + ".";
  } else if (parts.length === 2) {
    reasoning += parts.join(" and ") + ".";
  } else {
    reasoning += parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1] + ".";
  }

  // Add a vibe flourish
  if (strain.vibe.length > 0) {
    const vibeWord = strain.vibe[0];
    reasoning += ` This strain is known for its ${vibeWord} nature.`;
  }

  return reasoning;
}

// =============================================================================
// Main Recommendation Function
// =============================================================================

/**
 * Generate a strain recommendation from quiz answers
 */
export function generateRecommendation(submission: QuizSubmission): QuizRecommendation | null {
  const { answers, availableStrains } = submission;

  // Get all strains
  let strains = getAllStrains();

  // Filter to only available strains if specified
  if (availableStrains && availableStrains.length > 0) {
    strains = strains.filter(s => {
      const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return availableStrains.includes(slug) || availableStrains.includes(s.id);
    });
  }

  // If no strains available, return null
  if (strains.length === 0) {
    return null;
  }

  // Collect tags from answers
  const answerTags = collectAnswerTags(answers);

  // Score all strains
  const scoredStrains = strains.map(strain => scoreStrain(strain, answerTags));

  // Sort by score (highest first)
  scoredStrains.sort((a, b) => b.score - a.score);

  // Get the top recommendation
  const top = scoredStrains[0];

  // Generate reasoning
  const reasoning = generateReasoning(top.strain, top.matchedTags, answers);

  // Get alternatives (next 2)
  const alternatives = scoredStrains
    .slice(1, 3)
    .map(s => toPublicView(s.strain));

  return {
    strain: toPublicView(top.strain),
    score: top.score,
    reasoning,
    alternatives: alternatives.length > 0 ? alternatives : undefined,
  };
}

/**
 * Validate quiz submission
 */
export function validateQuizSubmission(submission: Partial<QuizSubmission>): string[] {
  const errors: string[] = [];

  if (!submission.partnerId) {
    errors.push("partnerId is required");
  }

  if (!submission.answers || Object.keys(submission.answers).length === 0) {
    errors.push("At least one answer is required");
  }

  if (!submission.sessionHash) {
    errors.push("sessionHash is required");
  }

  // Validate that availableStrains, if provided, is an array
  if (submission.availableStrains !== undefined && !Array.isArray(submission.availableStrains)) {
    errors.push("availableStrains must be an array");
  }

  return errors;
}
