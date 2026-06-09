/**
 * Myco intake intents → 6-axis intent vectors.
 *
 * The eight customer-facing intents from the Myco platform spec, each mapped
 * onto the canonical vibe axes. Multiple selected intents are averaged.
 */

import { VIBE_KEYS, emptyVibeScores, type VibeScores } from "./vibes";

export const MYCO_INTENTS = [
  "focus",
  "creativity",
  "sleep",
  "anxiety_relief",
  "first_time",
  "spiritual",
  "social",
  "healing",
] as const;

export type MycoIntent = (typeof MYCO_INTENTS)[number];

export const INTENT_LABELS: Record<MycoIntent, { label: string; description: string }> = {
  focus: { label: "Focus & flow", description: "Clear-headed concentration, getting things done" },
  creativity: { label: "Creativity", description: "New ideas, making things, seeing differently" },
  sleep: { label: "Rest & sleep", description: "Winding down, settling the body" },
  anxiety_relief: { label: "Ease & calm", description: "Quieting the noise, softening anxiety" },
  first_time: { label: "Curious first-timer", description: "Gentle introduction, no deep end" },
  spiritual: { label: "Spiritual journey", description: "Depth, meaning, inner exploration" },
  social: { label: "Social & connected", description: "Warmth, laughter, being with people" },
  healing: { label: "Healing & processing", description: "Working through something, gently" },
};

const INTENT_VECTORS: Record<MycoIntent, VibeScores> = {
  focus: {
    clarity_cognition: 0.9,
    mood_social: 0,
    visual_pattern: -0.4,
    somatic: -0.2,
    energy_direction: 0.3,
    depth_direction: -0.6,
  },
  creativity: {
    clarity_cognition: 0.5,
    mood_social: 0.2,
    visual_pattern: 0.5,
    somatic: 0,
    energy_direction: 0.3,
    depth_direction: 0.3,
  },
  sleep: {
    clarity_cognition: -0.3,
    mood_social: -0.4,
    visual_pattern: -0.3,
    somatic: 0.6,
    energy_direction: -0.9,
    depth_direction: 0.3,
  },
  anxiety_relief: {
    clarity_cognition: 0.2,
    mood_social: 0.2,
    visual_pattern: -0.3,
    somatic: 0.4,
    energy_direction: -0.6,
    depth_direction: -0.2,
  },
  first_time: {
    clarity_cognition: 0.2,
    mood_social: 0.3,
    visual_pattern: -0.2,
    somatic: 0,
    energy_direction: 0,
    depth_direction: -0.3,
  },
  spiritual: {
    clarity_cognition: 0.2,
    mood_social: -0.3,
    visual_pattern: 0.6,
    somatic: 0.3,
    energy_direction: -0.3,
    depth_direction: 0.9,
  },
  social: {
    clarity_cognition: 0,
    mood_social: 0.9,
    visual_pattern: 0,
    somatic: -0.2,
    energy_direction: 0.5,
    depth_direction: -0.3,
  },
  healing: {
    clarity_cognition: 0.4,
    mood_social: -0.2,
    visual_pattern: 0,
    somatic: 0.3,
    energy_direction: -0.4,
    depth_direction: 0.6,
  },
};

export function isMycoIntent(value: unknown): value is MycoIntent {
  return typeof value === "string" && (MYCO_INTENTS as readonly string[]).includes(value);
}

/** Average the vectors of the selected intents (clamped to [-1, 1]). */
export function intentsToVector(intents: MycoIntent[]): VibeScores {
  if (intents.length === 0) return emptyVibeScores();
  const out = emptyVibeScores();
  for (const key of VIBE_KEYS) {
    const sum = intents.reduce((acc, intent) => acc + INTENT_VECTORS[intent][key], 0);
    out[key] = Math.max(-1, Math.min(1, sum / intents.length));
  }
  return out;
}
