/**
 * Tripdar Dimension Phrase Map
 *
 * Meaning Layer v1.0 — Direction phrases are fixed per dimension.
 * Aggregation logic must never generate phrases dynamically.
 *
 * Source: tripdar-spec/tripdar-experiential-dimensions.md
 * Source: tripdar-spec/TRIPDAR_AGGREGATION_LANGUAGE.md
 */

import type { Direction } from "./types";

/**
 * Phrase map for each dimension × direction combination.
 * These are the ONLY phrases that may appear in aggregation output.
 *
 * Format: "more [quality] than usual" / "less [quality] than usual" / "similar [quality] to usual"
 * Per TRIPDAR_AGGREGATION_LANGUAGE.md Component 2: Direction Terms
 */
export interface DimensionPhrases {
  readonly MORE: string;
  readonly LESS: string;
  readonly SAME: string;
}

/**
 * Complete dimension phrase map.
 * All 27 dimensions from tripdar-experiential-dimensions.md
 *
 * NOT_NOTICED is intentionally absent — it does not produce phrases.
 */
export const DIMENSION_PHRASES: Record<string, DimensionPhrases> = {
  // Domain 1: Cognitive
  clarity: {
    MORE: "more clarity than usual",
    LESS: "less clarity than usual",
    SAME: "similar clarity to usual",
  },
  fluidity: {
    MORE: "more fluidity than usual",
    LESS: "less fluidity than usual",
    SAME: "similar fluidity to usual",
  },
  introspection: {
    MORE: "more introspection than usual",
    LESS: "less introspection than usual",
    SAME: "similar introspection to usual",
  },
  presence: {
    MORE: "more presence than usual",
    LESS: "less presence than usual",
    SAME: "similar presence to usual",
  },
  novelty: {
    MORE: "more novelty than usual",
    LESS: "less novelty than usual",
    SAME: "similar novelty to usual",
  },

  // Domain 2: Emotional
  openness: {
    MORE: "more openness than usual",
    LESS: "less openness than usual",
    SAME: "similar openness to usual",
  },
  calm: {
    MORE: "more calm than usual",
    LESS: "less calm than usual",
    SAME: "similar calm to usual",
  },
  sensitivity: {
    MORE: "more sensitivity than usual",
    LESS: "less sensitivity than usual",
    SAME: "similar sensitivity to usual",
  },
  warmth: {
    MORE: "more warmth than usual",
    LESS: "less warmth than usual",
    SAME: "similar warmth to usual",
  },
  depth: {
    MORE: "more depth than usual",
    LESS: "less depth than usual",
    SAME: "similar depth to usual",
  },

  // Domain 3: Somatic
  body_awareness: {
    MORE: "more body awareness than usual",
    LESS: "less body awareness than usual",
    SAME: "similar body awareness to usual",
  },
  energy: {
    MORE: "more energy than usual",
    LESS: "less energy than usual",
    SAME: "similar energy to usual",
  },
  relaxation: {
    MORE: "more relaxation than usual",
    LESS: "less relaxation than usual",
    SAME: "similar relaxation to usual",
  },
  groundedness: {
    MORE: "more groundedness than usual",
    LESS: "less groundedness than usual",
    SAME: "similar groundedness to usual",
  },
  sensory_acuity: {
    MORE: "more sensory acuity than usual",
    LESS: "less sensory acuity than usual",
    SAME: "similar sensory acuity to usual",
  },

  // Domain 4: Perceptual
  visual_nuance: {
    MORE: "more visual nuance than usual",
    LESS: "less visual nuance than usual",
    SAME: "similar visual nuance to usual",
  },
  auditory_texture: {
    MORE: "more auditory texture than usual",
    LESS: "less auditory texture than usual",
    SAME: "similar auditory texture to usual",
  },
  spatial_awareness: {
    MORE: "more spatial awareness than usual",
    LESS: "less spatial awareness than usual",
    SAME: "similar spatial awareness to usual",
  },
  aesthetic_sensitivity: {
    MORE: "more aesthetic sensitivity than usual",
    LESS: "less aesthetic sensitivity than usual",
    SAME: "similar aesthetic sensitivity to usual",
  },

  // Domain 5: Temporal
  time_dilation: {
    MORE: "more time dilation than usual",
    LESS: "less time dilation than usual",
    SAME: "similar time dilation to usual",
  },
  flow: {
    MORE: "more flow than usual",
    LESS: "less flow than usual",
    SAME: "similar flow to usual",
  },
  duration_awareness: {
    MORE: "more duration awareness than usual",
    LESS: "less duration awareness than usual",
    SAME: "similar duration awareness to usual",
  },

  // Domain 6: Relational
  social_ease: {
    MORE: "more social ease than usual",
    LESS: "less social ease than usual",
    SAME: "similar social ease to usual",
  },
  empathic_attunement: {
    MORE: "more empathic attunement than usual",
    LESS: "less empathic attunement than usual",
    SAME: "similar empathic attunement to usual",
  },
  environmental_connection: {
    MORE: "more environmental connection than usual",
    LESS: "less environmental connection than usual",
    SAME: "similar environmental connection to usual",
  },

  // Domain 7: Meaning
  significance: {
    MORE: "more significance than usual",
    LESS: "less significance than usual",
    SAME: "similar significance to usual",
  },
  perspective_shift: {
    MORE: "more perspective shift than usual",
    LESS: "less perspective shift than usual",
    SAME: "similar perspective shift to usual",
  },
  integration_readiness: {
    MORE: "more integration readiness than usual",
    LESS: "less integration readiness than usual",
    SAME: "similar integration readiness to usual",
  },
} as const;

/**
 * Get the direction phrase for a dimension.
 * Returns null if dimension or direction is invalid.
 *
 * NOT_NOTICED intentionally returns null — it does not produce phrases.
 */
export function getDirectionPhrase(
  dimensionId: string,
  direction: Direction
): string | null {
  if (direction === "NOT_NOTICED") {
    return null;
  }

  const phrases = DIMENSION_PHRASES[dimensionId.toLowerCase()];
  if (!phrases) {
    return null;
  }

  return phrases[direction] ?? null;
}

