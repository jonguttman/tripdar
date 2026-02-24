/**
 * Recommendation Engine Configuration
 *
 * Mood tiles, slider axes, quiz steps, and their intent vector mappings.
 * Derived from the Tripdar Strain Experience Guide descriptor clusters.
 */

import type { MoodTile, RecommendationConfig } from "./types";
import { CANONICAL_DOSE_LEVELS } from "./types";

export const MOOD_TILES: MoodTile[] = [
  {
    id: "calm_centered",
    label: "Calm & Centered",
    description: "Peaceful, grounded, at ease",
    intentVector: {
      clarity_cognition: 0.4,
      mood_social: 0.3,
      visual_pattern: 0.0,
      somatic: 0.6,
      energy_direction: -0.8,
      depth_direction: -0.3,
    },
  },
  {
    id: "social_giggly",
    label: "Social & Giggly",
    description: "Playful, connected, lighthearted",
    intentVector: {
      clarity_cognition: 0.1,
      mood_social: 0.9,
      visual_pattern: 0.1,
      somatic: 0.2,
      energy_direction: 0.6,
      depth_direction: -0.4,
    },
  },
  {
    id: "creative_flow",
    label: "Creative Flow",
    description: "Inspired, flowing, imaginative",
    intentVector: {
      clarity_cognition: 0.6,
      mood_social: 0.2,
      visual_pattern: 0.5,
      somatic: 0.1,
      energy_direction: 0.3,
      depth_direction: 0.3,
    },
  },
  {
    id: "deep_insight",
    label: "Deep Insight",
    description: "Introspective, philosophical, meaningful",
    intentVector: {
      clarity_cognition: 0.8,
      mood_social: -0.2,
      visual_pattern: 0.2,
      somatic: 0.3,
      energy_direction: -0.5,
      depth_direction: 0.6,
    },
  },
  {
    id: "visual_journey",
    label: "Visual Journey",
    description: "Vivid, immersive, kaleidoscopic",
    intentVector: {
      clarity_cognition: 0.1,
      mood_social: 0.0,
      visual_pattern: 0.9,
      somatic: 0.3,
      energy_direction: 0.0,
      depth_direction: 0.8,
    },
  },
  {
    id: "energized_uplifted",
    label: "Energized & Uplifted",
    description: "Bright, motivated, euphoric",
    intentVector: {
      clarity_cognition: 0.3,
      mood_social: 0.5,
      visual_pattern: 0.2,
      somatic: 0.4,
      energy_direction: 0.9,
      depth_direction: -0.3,
    },
  },
  {
    id: "body_warmth",
    label: "Body Warmth",
    description: "Relaxed, wave-like, grounded",
    intentVector: {
      clarity_cognition: 0.0,
      mood_social: 0.2,
      visual_pattern: 0.0,
      somatic: 0.9,
      energy_direction: -0.6,
      depth_direction: 0.1,
    },
  },
  {
    id: "full_reset",
    label: "Full Reset",
    description: "Transformative, profound, ego-dissolving",
    intentVector: {
      clarity_cognition: 0.4,
      mood_social: -0.3,
      visual_pattern: 0.7,
      somatic: 0.5,
      energy_direction: 0.0,
      depth_direction: 0.9,
    },
  },
];

export const QUIZ_STEPS = [
  {
    id: "occasion",
    question: "What's the occasion?",
    options: [
      { id: "solo", label: "Solo reflection", tags: ["introspective", "calm", "deep"] },
      { id: "social", label: "Social gathering", tags: ["social", "giggly", "uplifting", "playful"] },
      { id: "creative", label: "Creative work", tags: ["creative", "focused", "flowing"] },
      { id: "nature", label: "Nature outing", tags: ["grounded", "connected", "sensory"] },
      { id: "ceremony", label: "Ceremony & healing", tags: ["deep", "visionary", "transformative"] },
      { id: "curious", label: "Just curious", tags: ["gentle", "balanced", "beginner-friendly"] },
    ],
  },
  {
    id: "priority",
    question: "What matters most to you?",
    options: [
      { id: "clarity", label: "Clarity of mind", tags: ["clear-headed", "focused", "lucid"] },
      { id: "emotion", label: "Emotional openness", tags: ["heart-opening", "warm", "connected"] },
      { id: "visuals", label: "Visual beauty", tags: ["visual", "immersive", "patterning"] },
      { id: "body", label: "Physical relaxation", tags: ["body warmth", "relaxation", "grounded"] },
      { id: "meaning", label: "Sense of meaning", tags: ["philosophical", "introspective", "deep"] },
      { id: "fun", label: "Fun & laughter", tags: ["giggly", "playful", "euphoric"] },
    ],
  },
  {
    id: "intensity",
    question: "How would you describe your comfort level with intensity?",
    options: [
      { id: "gentle", label: "Keep it gentle", tags: ["gentle", "stable", "beginner-friendly"] },
      { id: "moderate", label: "I'm open to something moderate", tags: ["balanced", "moderate"] },
      { id: "deep", label: "I want to go deep", tags: ["intense", "powerful", "immersive"] },
      { id: "surprise", label: "Surprise me", tags: ["variable", "adventurous"] },
    ],
  },
  {
    id: "past_strains",
    question: "Any strains you've enjoyed before?",
    conditional: "experienced",
    options: [],
  },
];

export const SLIDER_AXES = [
  { id: "energy", label: "Calm \u2194 Energetic", min: -1, max: 1 },
  { id: "depth", label: "Clear \u2194 Dreamy", min: -1, max: 1 },
];

export const EXPERIENCE_LEVELS = [
  { id: "new" as const, label: "This is my first time" },
  { id: "few_times" as const, label: "A few times" },
  { id: "experienced" as const, label: "Experienced" },
  { id: "very_experienced" as const, label: "Very experienced" },
];

export function getRecommendationConfig(): RecommendationConfig {
  return {
    moodTiles: MOOD_TILES,
    sliderAxes: SLIDER_AXES,
    quizSteps: QUIZ_STEPS,
    experienceLevels: EXPERIENCE_LEVELS,
    doseLevels: CANONICAL_DOSE_LEVELS,
  };
}
