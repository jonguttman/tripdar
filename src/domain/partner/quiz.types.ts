/**
 * Quiz & Recommendation Types
 *
 * Handles the mystical strain prediction engine.
 */

// =============================================================================
// Quiz Types
// =============================================================================

/**
 * A quiz question definition (configurable by partner)
 */
export interface QuizQuestion {
  id: string;
  text: string;
  /** What strain characteristic this maps to */
  dimension: "intention" | "depth" | "experience" | "custom";
  answers: QuizAnswer[];
}

/**
 * A quiz answer option
 */
export interface QuizAnswer {
  id: string;
  text: string;
  /** Tags that influence strain matching */
  tags: string[];
}

/**
 * Quiz submission from partner site
 */
export interface QuizSubmission {
  /** Partner making the request */
  partnerId: string;
  /** User's answers: questionId -> answerId */
  answers: Record<string, string>;
  /** Strains the partner has in stock (filter results to these) */
  availableStrains: string[];
  /** Session hash for anonymous tracking */
  sessionHash: string;
}

/**
 * Quiz recommendation result
 */
export interface QuizRecommendation {
  /** The recommended strain (public view) */
  strain: import("./types").StrainPublicView;
  /** Score (0-100) - not exposed to user, used internally */
  score: number;
  /** Human-readable reasoning for the recommendation */
  reasoning: string;
  /** Runner-up strains (if requested) */
  alternatives?: import("./types").StrainPublicView[];
}

// =============================================================================
// Feedback Types
// =============================================================================

/**
 * Match rating submission
 */
export interface FeedbackRating {
  partnerId: string;
  sessionHash: string;
  strainSlug: string;
  /** 0.0 = "Not at all", 1.0 = "Spot on" */
  matchRating: number;
  timestamp: Date;
}

/**
 * Detailed survey submission (for mismatched experiences)
 */
export interface FeedbackSurvey {
  partnerId: string;
  sessionHash: string;
  strainSlug: string;
  matchRating: number;
  /** Survey responses: questionId -> answer(s) */
  responses: Record<string, string | string[]>;
  /** Optional freeform text */
  freeformText?: string;
  timestamp: Date;
}

/**
 * Survey question definition
 */
export interface SurveyQuestion {
  id: string;
  text: string;
  type: "single" | "multiple" | "freeform";
  options?: SurveyOption[];
  required: boolean;
}

/**
 * Survey option for multiple choice
 */
export interface SurveyOption {
  id: string;
  text: string;
  icon?: string;
}

// =============================================================================
// Default Quiz Questions
// =============================================================================

export const DEFAULT_QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "intention",
    text: "What calls to you today?",
    dimension: "intention",
    answers: [
      { id: "clarity", text: "Clarity", tags: ["clarity", "focus", "mental", "teacher-like", "insightful"] },
      { id: "wonder", text: "Wonder", tags: ["visual", "creative", "awe", "dreamy", "immersive"] },
      { id: "connection", text: "Connection", tags: ["social", "warm", "friendly", "uplifting"] },
      { id: "release", text: "Release", tags: ["deep", "introspective", "ceremonial", "profound"] },
    ],
  },
  {
    id: "depth",
    text: "How deep do you wish to journey?",
    dimension: "depth",
    answers: [
      { id: "gentle", text: "A gentle wade", tags: ["beginner-yes", "low-moderate", "gentle"] },
      { id: "swim", text: "A full swim", tags: ["moderate", "balanced"] },
      { id: "deep", text: "The deep end", tags: ["high", "intense", "powerful"] },
    ],
  },
  {
    id: "experience",
    text: "Your experience with sacred medicines?",
    dimension: "experience",
    answers: [
      { id: "first", text: "This would be my first", tags: ["beginner-yes", "gentle", "stable"] },
      { id: "few", text: "A few journeys", tags: ["beginner-maybe", "moderate"] },
      { id: "seasoned", text: "Seasoned traveler", tags: ["beginner-no", "high", "variable"] },
    ],
  },
];

// =============================================================================
// Default Survey Questions
// =============================================================================

export const DEFAULT_SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "dose",
    text: "What was your dose?",
    type: "single",
    required: true,
    options: [
      { id: "micro", text: "Microdose", icon: "💧" },
      { id: "light", text: "Light (0.5-1g)", icon: "🌱" },
      { id: "moderate", text: "Moderate (1-2.5g)", icon: "🍄" },
      { id: "strong", text: "Strong (2.5-4g)", icon: "🔥" },
      { id: "heroic", text: "Heroic (4g+)", icon: "🚀" },
    ],
  },
  {
    id: "setting",
    text: "What was your setting?",
    type: "single",
    required: true,
    options: [
      { id: "home-alone", text: "Home alone", icon: "🏠" },
      { id: "friends", text: "With close friends", icon: "👥" },
      { id: "nature", text: "In nature", icon: "🌲" },
      { id: "event", text: "Event/festival", icon: "🎉" },
      { id: "ceremony", text: "Ceremonial/guided", icon: "🕯️" },
    ],
  },
  {
    id: "recency",
    text: "How recently had you journeyed before this?",
    type: "single",
    required: true,
    options: [
      { id: "first", text: "First time ever", icon: "✨" },
      { id: "month-plus", text: "More than a month ago", icon: "📅" },
      { id: "within-month", text: "Within the past month", icon: "🌙" },
      { id: "within-week", text: "Within the past week", icon: "⚡" },
    ],
  },
  {
    id: "stomach",
    text: "What was in your stomach?",
    type: "single",
    required: false,
    options: [
      { id: "empty", text: "Empty", icon: "○" },
      { id: "light", text: "Light snack", icon: "◐" },
      { id: "full", text: "Full meal", icon: "●" },
    ],
  },
  {
    id: "freeform",
    text: "Anything else you'd like to share?",
    type: "freeform",
    required: false,
  },
];
