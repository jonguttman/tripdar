/**
 * Partner Integration Module
 *
 * Provides controlled, read-only access to Tripdar strain data
 * for authorized partner sites.
 */

// Types
export type {
  StrainPublicView,
  StrainListResponse,
  StrainDetailResponse,
  Partner,
  PartnerRequestContext,
  ExplorationSignal,
  ExplorationEventType,
  SignalAggregate,
  ApiResponse,
  ApiSuccessResponse,
  ApiErrorResponse,
} from "./types";

// Public View Mapping
export {
  toPublicView,
  toPublicViewList,
  findBySlug,
  createMeta,
  API_VERSION,
} from "./publicView";

// Access Control
export {
  generateApiKey,
  validateApiKey,
  registerPartner,
  revokePartner,
  rotateApiKey,
  getPartner,
  listPartners,
  isOriginAllowed,
  checkRateLimit,
  createRequestContext,
  logRequest,
  flushRequestLogs,
  getRequestLogs,
  generateSessionHash,
  recordSignal,
  flushSignals,
  getSignalAggregates,
} from "./access";

// Middleware
export {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
  recordStrainView,
  recordStrainList,
  recordSearch,
} from "./middleware";
export type { AuthenticatedRequest } from "./middleware";

// Signed URLs
export {
  createSignedUrl,
  verifySignedUrl,
  signVisualizationUrl,
  isUrlExpired,
} from "./signedUrls";
export type { SignedUrlParams, SignedUrlResult, VerificationResult } from "./signedUrls";

// Quiz & Recommendations
export {
  generateRecommendation,
  validateQuizSubmission,
} from "./quiz.engine";
export {
  DEFAULT_QUIZ_QUESTIONS,
  DEFAULT_SURVEY_QUESTIONS,
} from "./quiz.types";
export type {
  QuizQuestion,
  QuizAnswer,
  QuizSubmission,
  QuizRecommendation,
  FeedbackRating,
  FeedbackSurvey,
  SurveyQuestion,
  SurveyOption,
} from "./quiz.types";

// Feedback Collection
export {
  recordRating,
  recordSurvey,
  validateRating,
  validateSurvey,
  getStrainFeedbackStats,
  getSurveyQuestions,
  flushRatings,
  flushSurveys,
} from "./feedback";
