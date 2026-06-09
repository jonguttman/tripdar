/**
 * Canonical 6-axis vibe system for Myco products.
 *
 * Single source of truth shared by the admin vibe sliders, the tester
 * feedback form, and the product-first recommendation engine. Axes are
 * bipolar, scored -1 to 1. These are the same six axes the strain engine's
 * IntentVector uses, so user intent and product profiles speak one language.
 */

export const VIBE_KEYS = [
  "clarity_cognition",
  "mood_social",
  "visual_pattern",
  "somatic",
  "energy_direction",
  "depth_direction",
] as const;

export type VibeKey = (typeof VIBE_KEYS)[number];

export type VibeScores = Record<VibeKey, number>;

export const VIBE_DIMENSIONS: { key: VibeKey; label: string }[] = [
  { key: "clarity_cognition", label: "Mind: Scattered ↔ Focused" },
  { key: "mood_social", label: "Mood: Inward ↔ Social" },
  { key: "visual_pattern", label: "Visuals: Subtle ↔ Vivid" },
  { key: "somatic", label: "Body: Light ↔ Heavy" },
  { key: "energy_direction", label: "Energy: Calm ↔ Energetic" },
  { key: "depth_direction", label: "Depth: Clear ↔ Dreamy" },
];

export function emptyVibeScores(): VibeScores {
  return {
    clarity_cognition: 0,
    mood_social: 0,
    visual_pattern: 0,
    somatic: 0,
    energy_direction: 0,
    depth_direction: 0,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Read an unknown JSON value (e.g. ProductVibeProfile.scores) into canonical
 * VibeScores. Unknown keys are dropped, values clamped to [-1, 1].
 * Returns null when the value is not an object.
 */
export function normalizeVibeScores(value: unknown): VibeScores | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const src = value as Record<string, unknown>;
  const out = emptyVibeScores();
  for (const key of VIBE_KEYS) {
    const v = src[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = clamp(v, -1, 1);
  }
  return out;
}

/**
 * A vibe profile counts as "filled in" when at least one axis is nonzero.
 * An all-zero profile is indistinguishable from never having been set.
 */
export function hasMeaningfulVibeProfile(value: unknown): boolean {
  const scores = normalizeVibeScores(value);
  if (!scores) return false;
  return VIBE_KEYS.some((key) => scores[key] !== 0);
}

/**
 * Cosine similarity between two 6-axis vectors, normalized to 0-100.
 * Same normalization the strain engine uses so scores are comparable.
 */
export function vibeSimilarityScore(a: VibeScores, b: VibeScores): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const key of VIBE_KEYS) {
    dot += a[key] * b[key];
    normA += a[key] * a[key];
    normB += b[key] * b[key];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return Math.round(((dot / denominator + 1) / 2) * 100);
}

/** Top N strongest axes of a profile, for "key vibes" chips on product cards. */
export function topVibes(
  scores: VibeScores,
  count = 2
): { key: VibeKey; label: string; value: number }[] {
  return VIBE_DIMENSIONS.map(({ key, label }) => ({ key, label, value: scores[key] }))
    .filter((d) => Math.abs(d.value) >= 0.2)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, count);
}
