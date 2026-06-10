/**
 * Community vibe aggregation + confidence.
 *
 * Turns tester votes (0-100 sliders per axis) into a community vibe profile
 * on the same -1..1 scale as admin profiles, so the two can sit side by side
 * in the admin and the admin can one-click accept the community version.
 *
 * Per BUG_LOG: aggregation always runs over the FULL vote set for a product,
 * never a paginated page.
 */

import { VIBE_KEYS, emptyVibeScores, type VibeScores, type VibeKey } from "./vibes";

export interface TesterVoteAxes {
  clarityCognition: number | null;
  moodSocial: number | null;
  visualPattern: number | null;
  somatic: number | null;
  energyDirection: number | null;
  depthDirection: number | null;
}

const VOTE_FIELD_BY_KEY: Record<VibeKey, keyof TesterVoteAxes> = {
  clarity_cognition: "clarityCognition",
  mood_social: "moodSocial",
  visual_pattern: "visualPattern",
  somatic: "somatic",
  energy_direction: "energyDirection",
  depth_direction: "depthDirection",
};

export interface CommunityVibeAggregate {
  voteCount: number;
  scores: VibeScores | null; // null until at least one vote has axis data
  axisCounts: Record<VibeKey, number>;
  spread: number | null; // mean per-axis std deviation in -1..1 units
}

/** Map a 0-100 slider value onto the bipolar -1..1 axis. */
function sliderToAxis(value: number): number {
  return Math.max(-1, Math.min(1, (value - 50) / 50));
}

export function aggregateTesterVotes(votes: TesterVoteAxes[]): CommunityVibeAggregate {
  const sums = emptyVibeScores();
  const squares = emptyVibeScores();
  const axisCounts = {} as Record<VibeKey, number>;
  for (const key of VIBE_KEYS) axisCounts[key] = 0;

  for (const vote of votes) {
    for (const key of VIBE_KEYS) {
      const raw = vote[VOTE_FIELD_BY_KEY[key]];
      if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
      const value = sliderToAxis(raw);
      sums[key] += value;
      squares[key] += value * value;
      axisCounts[key] += 1;
    }
  }

  const anyData = VIBE_KEYS.some((key) => axisCounts[key] > 0);
  if (!anyData) {
    return { voteCount: votes.length, scores: null, axisCounts, spread: null };
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
      ? Math.round((deviations.reduce((a, b) => a + b, 0) / deviations.length) * 100) / 100
      : null;

  return { voteCount: votes.length, scores, axisCounts, spread };
}

export type ConfidenceLevel = "none" | "low" | "building" | "solid";

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  none: "No reports",
  low: "Low",
  building: "Building",
  solid: "Solid",
};

/**
 * How well-understood a product is, from report volume and agreement.
 * Admin-only signal — never shown to customers.
 */
export function computeConfidence(voteCount: number, spread: number | null): ConfidenceLevel {
  if (voteCount === 0) return "none";
  if (voteCount < 3) return "low";
  if (voteCount >= 10 && (spread === null || spread < 0.35)) return "solid";
  return "building";
}

/** Per-axis divergence between admin and community profiles, for review UI. */
export function profileDeltas(
  admin: VibeScores,
  community: VibeScores
): { key: VibeKey; delta: number }[] {
  return VIBE_KEYS.map((key) => ({
    key,
    delta: Math.round((community[key] - admin[key]) * 100) / 100,
  }));
}
