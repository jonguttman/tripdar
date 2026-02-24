/**
 * Recommendation Engine Types
 */

// =============================================================================
// Intent & Input Types
// =============================================================================

export interface IntentVector {
  clarity_cognition: number;  // -1 to 1
  mood_social: number;        // -1 to 1
  visual_pattern: number;     // -1 to 1
  somatic: number;            // -1 to 1
  energy_direction: number;   // -1 (calm) to 1 (energetic)
  depth_direction: number;    // -1 (clear) to 1 (dreamy)
}

export type ExperienceLevel = "new" | "few_times" | "experienced" | "very_experienced";
export type InputPath = "mood_tiles" | "sliders" | "guided_quiz";

export interface RecommendationRequest {
  experienceLevel: ExperienceLevel;
  inputPath: InputPath;
  intentVector: IntentVector;
  rawInput: Record<string, unknown>;
  siteId: string;
}

// =============================================================================
// Dose Types
// =============================================================================

export type DoseSensitivity = "gentle" | "medium" | "steep" | "very_steep";

export interface CanonicalDoseLevel {
  level: number;
  name: string;
  standardLowMg: number;
  standardHighMg: number;
  descriptors: string[];
}

export const CANONICAL_DOSE_LEVELS: CanonicalDoseLevel[] = [
  {
    level: 1,
    name: "Microdose",
    standardLowMg: 50,
    standardHighMg: 250,
    descriptors: ["Mood enhancement", "Crisp concentration", "Increased mental stamina"],
  },
  {
    level: 2,
    name: "Mini-dose",
    standardLowMg: 250,
    standardHighMg: 750,
    descriptors: ["Feeling stoned", "Mild euphoria", "Visual enhancements", "Short term memory anomalies", "Altered sound perception"],
  },
  {
    level: 3,
    name: "Macro Dose",
    standardLowMg: 500,
    standardHighMg: 2000,
    descriptors: ["Colors more vivid", "Closed & open eye visuals", "Distracted thought pattern", "Enhanced creativity"],
  },
  {
    level: 4,
    name: "Museum Dose",
    standardLowMg: 1500,
    standardHighMg: 3500,
    descriptors: ["Warped & kaleidoscopic visuals", "Mild hallucinations", "3D closed eye visuals", "Minor synesthesia", "Distorted sense of time"],
  },
  {
    level: 5,
    name: "Megadose",
    standardLowMg: 3500,
    standardHighMg: 5000,
    descriptors: ["Heavy hallucinations", "Ego dissolution", "Mild disconnect from reality", "Complete loss of time", "Synesthesia", "Out of body experiences"],
  },
  {
    level: 6,
    name: "Heroic Dose",
    standardLowMg: 5000,
    standardHighMg: 7500,
    descriptors: ["Complete altering of senses", "Ego death", "Complete disconnect from reality"],
  },
];

export const DOSE_SENSITIVITY_MODIFIERS: Record<DoseSensitivity, number> = {
  gentle: 1.0,
  medium: 0.85,
  steep: 0.7,
  very_steep: 0.55,
};

// =============================================================================
// Scoring Types
// =============================================================================

export interface StrainProfileVector {
  strainSlug: string;
  strainName: string;
  clarity_cognition: number;
  mood_social: number;
  visual_pattern: number;
  somatic: number;
  energy_direction: number;
  depth_direction: number;
  potencyTier: string;
  doseSensitivity: DoseSensitivity;
  experienceStability: string;
  beginnerFriendly: string;
}

export interface ScoredRecommendation {
  strainSlug: string;
  strainName: string;
  matchScore: number;
  baseScore: number;
  feedbackMod: number;
  adminMod: number;
  doseLevel: number;
  doseLevelName: string;
  doseLowMg: number;
  doseHighMg: number;
  product?: {
    name: string;
    url: string;
    suggestedUnits: string;
    format: string;
  };
  description: string;
  tags: {
    stability: string;
    doseSensitivity: string;
    beginnerFriendly: string;
  };
  cautions: string[];
  steppedPathNotice?: string;
}

// =============================================================================
// Response Types
// =============================================================================

export interface RecommendationResponse {
  sessionToken: string;
  results: ScoredRecommendation[];
  steppedPath?: {
    message: string;
    suggestedLevel: number;
    aspirationalLevel: number;
  };
}

// =============================================================================
// Config Types (for GET /recommend/config)
// =============================================================================

export interface MoodTile {
  id: string;
  label: string;
  description: string;
  intentVector: IntentVector;
}

export interface RecommendationConfig {
  moodTiles: MoodTile[];
  sliderAxes: Array<{ id: string; label: string; min: number; max: number }>;
  quizSteps: Array<{
    id: string;
    question: string;
    options: Array<{ id: string; label: string; tags: string[] }>;
    conditional?: string;
  }>;
  experienceLevels: Array<{ id: ExperienceLevel; label: string }>;
  doseLevels: CanonicalDoseLevel[];
}
