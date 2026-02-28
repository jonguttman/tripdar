export { generateRecommendations, getStrainConfig, upsertStrainConfig } from "./service";
export { getRecommendationConfig } from "./config";
export { determinePrimaryIntent, aggregateFeedback, processSignals, getSignalFrequencies } from "./feedback";
export { mapDoseSensitivity } from "./strain-profiles";
export type {
  IntentVector,
  ExperienceLevel,
  InputPath,
  RecommendationRequest,
  RecommendationResponse,
  ScoredRecommendation,
  RecommendationConfig,
  MoodTile,
  DoseSensitivity,
  CanonicalDoseLevel,
} from "./types";
export { CANONICAL_DOSE_LEVELS, DOSE_SENSITIVITY_MODIFIERS } from "./types";
