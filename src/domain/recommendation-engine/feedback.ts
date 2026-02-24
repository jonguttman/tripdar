/**
 * Feedback Aggregation & Signal Processing
 *
 * Phase 7: Extracts feedback logic into a dedicated module.
 * - Aggregates quick ratings into FeedbackAggregate records
 * - Recomputes feedback modifiers (Layer 2)
 * - Processes deep-dive signals for strain profile refinement
 */

import { prisma } from "@/lib/prisma";

// =============================================================================
// Feedback Aggregation
// =============================================================================

/**
 * Determine the primary intent category from an intent vector.
 * Maps to the closest mood tile ID using cosine similarity.
 */
export function determinePrimaryIntent(intentVector: Record<string, number>): string {
  const categories: Record<string, Record<string, number>> = {
    calm_centered: { clarity_cognition: 0.4, mood_social: 0.3, visual_pattern: 0.0, somatic: 0.6, energy_direction: -0.8, depth_direction: -0.3 },
    social_giggly: { clarity_cognition: 0.1, mood_social: 0.9, visual_pattern: 0.1, somatic: 0.2, energy_direction: 0.6, depth_direction: -0.4 },
    creative_flow: { clarity_cognition: 0.6, mood_social: 0.2, visual_pattern: 0.5, somatic: 0.1, energy_direction: 0.3, depth_direction: 0.3 },
    deep_insight: { clarity_cognition: 0.8, mood_social: -0.2, visual_pattern: 0.2, somatic: 0.3, energy_direction: -0.5, depth_direction: 0.6 },
    visual_journey: { clarity_cognition: 0.1, mood_social: 0.0, visual_pattern: 0.9, somatic: 0.3, energy_direction: 0.0, depth_direction: 0.8 },
    energized_uplifted: { clarity_cognition: 0.3, mood_social: 0.5, visual_pattern: 0.2, somatic: 0.4, energy_direction: 0.9, depth_direction: -0.3 },
    body_warmth: { clarity_cognition: 0.0, mood_social: 0.2, visual_pattern: 0.0, somatic: 0.9, energy_direction: -0.6, depth_direction: 0.1 },
    full_reset: { clarity_cognition: 0.4, mood_social: -0.3, visual_pattern: 0.7, somatic: 0.5, energy_direction: 0.0, depth_direction: 0.9 },
  };

  let bestMatch = "calm_centered";
  let bestSim = -Infinity;

  for (const [id, vec] of Object.entries(categories)) {
    let dot = 0, normA = 0, normB = 0;
    for (const key of Object.keys(vec)) {
      const a = intentVector[key] ?? 0;
      const b = vec[key];
      dot += a * b;
      normA += a * a;
      normB += b * b;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    const sim = denom > 0 ? dot / denom : 0;
    if (sim > bestSim) {
      bestSim = sim;
      bestMatch = id;
    }
  }

  return bestMatch;
}

/**
 * Record feedback and update the aggregate for a strain + intent category.
 * Returns the updated feedback modifier.
 */
export async function aggregateFeedback(
  strainSlug: string,
  intentCategory: string,
  quickRating: "nailed_it" | "pretty_close" | "missed",
): Promise<number> {
  // Upsert the aggregate
  await prisma.feedbackAggregate.upsert({
    where: {
      strainSlug_intentCategory: { strainSlug, intentCategory },
    },
    update: {
      totalRatings: { increment: 1 },
      ...(quickRating === "nailed_it" && { nailedIt: { increment: 1 } }),
      ...(quickRating === "pretty_close" && { prettyClose: { increment: 1 } }),
      ...(quickRating === "missed" && { missed: { increment: 1 } }),
    },
    create: {
      strainSlug,
      intentCategory,
      totalRatings: 1,
      nailedIt: quickRating === "nailed_it" ? 1 : 0,
      prettyClose: quickRating === "pretty_close" ? 1 : 0,
      missed: quickRating === "missed" ? 1 : 0,
      feedbackMod: 0,
    },
  });

  // Recompute modifier
  const agg = await prisma.feedbackAggregate.findUnique({
    where: { strainSlug_intentCategory: { strainSlug, intentCategory } },
  });

  if (agg && agg.totalRatings > 0) {
    const mod = ((agg.nailedIt * 5) + (agg.prettyClose * 0) + (agg.missed * -10)) / agg.totalRatings;
    const capped = Math.max(-20, Math.min(20, mod));
    await prisma.feedbackAggregate.update({
      where: { id: agg.id },
      data: { feedbackMod: capped },
    });
    return capped;
  }

  return 0;
}

// =============================================================================
// Signal Processing
// =============================================================================

interface SignalInput {
  dimensionId: string;
  direction: "more" | "less" | "same";
}

/**
 * Store deep-dive signals and compute direction frequencies.
 * Returns a summary of the stored signals.
 */
export async function processSignals(
  feedbackId: string,
  signals: SignalInput[],
): Promise<{ stored: number }> {
  const records = signals.map(signal => ({
    feedbackId,
    dimensionId: signal.dimensionId,
    direction: signal.direction,
  }));

  const result = await prisma.recommendationSignal.createMany({
    data: records,
  });

  return { stored: result.count };
}

/**
 * Get aggregated signal direction frequencies for a strain.
 * Shows how many users said "more", "less", or "same" for each dimension.
 */
export async function getSignalFrequencies(
  strainSlug: string,
): Promise<Map<string, { more: number; less: number; same: number }>> {
  const signals = await prisma.recommendationSignal.findMany({
    where: {
      feedback: {
        result: { strainSlug },
      },
    },
    select: {
      dimensionId: true,
      direction: true,
    },
  });

  const frequencies = new Map<string, { more: number; less: number; same: number }>();

  for (const signal of signals) {
    const existing = frequencies.get(signal.dimensionId) || { more: 0, less: 0, same: 0 };
    if (signal.direction === "more") existing.more++;
    else if (signal.direction === "less") existing.less++;
    else existing.same++;
    frequencies.set(signal.dimensionId, existing);
  }

  return frequencies;
}
