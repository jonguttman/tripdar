/**
 * Tripdar Dimension Registry
 *
 * Meaning Layer v1.0 — Single authoritative source for all experiential dimensions.
 *
 * This registry locks:
 * - Dimension meaning
 * - UI answer labels
 * - Aggregation language
 *
 * Source: tripdar-spec/tripdar-experiential-dimensions.md
 * Source: tripdar-spec/tripdar-comparative-question-set.md
 * Source: tripdar-spec/TRIPDAR_AGGREGATION_LANGUAGE.md
 */

export type DimensionId =
  // Domain 1: Cognitive
  | "clarity"
  | "fluidity"
  | "introspection"
  | "presence"
  | "novelty"
  // Domain 2: Emotional
  | "openness"
  | "calm"
  | "sensitivity"
  | "warmth"
  | "depth"
  // Domain 3: Somatic
  | "body_awareness"
  | "energy"
  | "relaxation"
  | "groundedness"
  | "sensory_acuity"
  // Domain 4: Perceptual
  | "visual_nuance"
  | "auditory_texture"
  | "spatial_awareness"
  | "aesthetic_sensitivity"
  // Domain 5: Temporal
  | "time_dilation"
  | "flow"
  | "duration_awareness"
  // Domain 6: Relational
  | "social_ease"
  | "empathic_attunement"
  | "environmental_connection"
  // Domain 7: Meaning
  | "significance"
  | "perspective_shift"
  | "integration_readiness";

export type Direction = "MORE" | "LESS" | "SAME" | "NOT_NOTICED";

export type Domain =
  | "Cognitive"
  | "Emotional"
  | "Somatic"
  | "Perceptual"
  | "Temporal"
  | "Relational"
  | "Meaning";

export interface DimensionDefinition {
  readonly id: DimensionId;
  readonly domain: Domain;
  readonly question: string;
  readonly uiLabels: {
    readonly MORE: string;
    readonly LESS: string;
    readonly SAME: string;
    readonly NOT_NOTICED: string;
  };
  readonly aggregationPhrase: {
    readonly MORE: string;
    readonly LESS: string;
    readonly SAME: string;
  };
}

const REGISTRY_DATA: Record<DimensionId, DimensionDefinition> = {
  // ==========================================================================
  // Domain 1: Cognitive
  // ==========================================================================
  clarity: {
    id: "clarity",
    domain: "Cognitive",
    question: "Compared to your usual state, did your thinking feel clearer or foggier?",
    uiLabels: {
      MORE: "Clearer than usual",
      LESS: "Foggier than usual",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more clarity than usual",
      LESS: "less clarity than usual",
      SAME: "similar clarity to usual",
    },
  },
  fluidity: {
    id: "fluidity",
    domain: "Cognitive",
    question: "Did thoughts connect more easily than usual, or feel more fixed?",
    uiLabels: {
      MORE: "Thoughts flowed easily",
      LESS: "Thoughts felt fixed",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more fluidity than usual",
      LESS: "less fluidity than usual",
      SAME: "similar fluidity to usual",
    },
  },
  introspection: {
    id: "introspection",
    domain: "Cognitive",
    question: "Were you more inward-focused or more outward-focused than usual?",
    uiLabels: {
      MORE: "More self-reflective",
      LESS: "More outward-focused",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more introspection than usual",
      LESS: "less introspection than usual",
      SAME: "similar introspection to usual",
    },
  },
  presence: {
    id: "presence",
    domain: "Cognitive",
    question: "Did you feel more grounded in the moment, or was your mind more wandering?",
    uiLabels: {
      MORE: "More grounded",
      LESS: "More wandering",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more presence than usual",
      LESS: "less presence than usual",
      SAME: "similar presence to usual",
    },
  },
  novelty: {
    id: "novelty",
    domain: "Cognitive",
    question: "Did familiar things feel fresh or new, or did everything feel ordinary?",
    uiLabels: {
      MORE: "Everything felt new",
      LESS: "Everything felt ordinary",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more novelty than usual",
      LESS: "less novelty than usual",
      SAME: "similar novelty to usual",
    },
  },

  // ==========================================================================
  // Domain 2: Emotional
  // ==========================================================================
  openness: {
    id: "openness",
    domain: "Emotional",
    question: "Did you feel more emotionally open or more guarded than usual?",
    uiLabels: {
      MORE: "More open",
      LESS: "More guarded",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more openness than usual",
      LESS: "less openness than usual",
      SAME: "similar openness to usual",
    },
  },
  calm: {
    id: "calm",
    domain: "Emotional",
    question: "Did you feel calmer or more restless than usual?",
    uiLabels: {
      MORE: "Calmer than usual",
      LESS: "More restless than usual",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more calm than usual",
      LESS: "less calm than usual",
      SAME: "similar calm to usual",
    },
  },
  sensitivity: {
    id: "sensitivity",
    domain: "Emotional",
    question: "Were you more emotionally sensitive than usual, or more neutral?",
    uiLabels: {
      MORE: "More emotionally sensitive",
      LESS: "More emotionally neutral",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more sensitivity than usual",
      LESS: "less sensitivity than usual",
      SAME: "similar sensitivity to usual",
    },
  },
  warmth: {
    id: "warmth",
    domain: "Emotional",
    question: "Did you feel warmer toward others, or more detached?",
    uiLabels: {
      MORE: "Warmer toward others",
      LESS: "More detached",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more warmth than usual",
      LESS: "less warmth than usual",
      SAME: "similar warmth to usual",
    },
  },
  depth: {
    id: "depth",
    domain: "Emotional",
    question: "Did deeper feelings surface, or did you stay on the surface?",
    uiLabels: {
      MORE: "Deeper feelings surfaced",
      LESS: "Stayed on the surface",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more depth than usual",
      LESS: "less depth than usual",
      SAME: "similar depth to usual",
    },
  },

  // ==========================================================================
  // Domain 3: Somatic
  // ==========================================================================
  body_awareness: {
    id: "body_awareness",
    domain: "Somatic",
    question: "Were you more aware of your body than usual, or less aware?",
    uiLabels: {
      MORE: "More aware of body",
      LESS: "Less aware of body",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more body awareness than usual",
      LESS: "less body awareness than usual",
      SAME: "similar body awareness to usual",
    },
  },
  energy: {
    id: "energy",
    domain: "Somatic",
    question: "Did you feel more energized or more subdued than usual?",
    uiLabels: {
      MORE: "More energized",
      LESS: "More subdued",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more energy than usual",
      LESS: "less energy than usual",
      SAME: "similar energy to usual",
    },
  },
  relaxation: {
    id: "relaxation",
    domain: "Somatic",
    question: "Did your body feel more relaxed or more tense than usual?",
    uiLabels: {
      MORE: "Body felt relaxed",
      LESS: "Body felt tense",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more relaxation than usual",
      LESS: "less relaxation than usual",
      SAME: "similar relaxation to usual",
    },
  },
  groundedness: {
    id: "groundedness",
    domain: "Somatic",
    question: "Did you feel physically grounded, or more unmoored?",
    uiLabels: {
      MORE: "Felt grounded",
      LESS: "Felt unmoored",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more groundedness than usual",
      LESS: "less groundedness than usual",
      SAME: "similar groundedness to usual",
    },
  },
  sensory_acuity: {
    id: "sensory_acuity",
    domain: "Somatic",
    question: "Did your physical senses feel heightened or muted?",
    uiLabels: {
      MORE: "Senses heightened",
      LESS: "Senses muted",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more sensory acuity than usual",
      LESS: "less sensory acuity than usual",
      SAME: "similar sensory acuity to usual",
    },
  },

  // ==========================================================================
  // Domain 4: Perceptual
  // ==========================================================================
  visual_nuance: {
    id: "visual_nuance",
    domain: "Perceptual",
    question: "Did colors, textures, or light seem more vivid, or about the same as usual?",
    uiLabels: {
      MORE: "Visuals more vivid",
      LESS: "Visuals ordinary",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more visual nuance than usual",
      LESS: "less visual nuance than usual",
      SAME: "similar visual nuance to usual",
    },
  },
  auditory_texture: {
    id: "auditory_texture",
    domain: "Perceptual",
    question: "Did sounds feel richer or different, or about the same as usual?",
    uiLabels: {
      MORE: "Sounds richer",
      LESS: "Sounds normal",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more auditory texture than usual",
      LESS: "less auditory texture than usual",
      SAME: "similar auditory texture to usual",
    },
  },
  spatial_awareness: {
    id: "spatial_awareness",
    domain: "Perceptual",
    question: "Did your sense of space or environment feel different, or normal?",
    uiLabels: {
      MORE: "Space felt different",
      LESS: "Space felt normal",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more spatial awareness than usual",
      LESS: "less spatial awareness than usual",
      SAME: "similar spatial awareness to usual",
    },
  },
  aesthetic_sensitivity: {
    id: "aesthetic_sensitivity",
    domain: "Perceptual",
    question: "Were you more moved by beauty or form, or was it unremarkable?",
    uiLabels: {
      MORE: "More moved by beauty",
      LESS: "Aesthetics unremarkable",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more aesthetic sensitivity than usual",
      LESS: "less aesthetic sensitivity than usual",
      SAME: "similar aesthetic sensitivity to usual",
    },
  },

  // ==========================================================================
  // Domain 5: Temporal
  // ==========================================================================
  time_dilation: {
    id: "time_dilation",
    domain: "Temporal",
    question: "Did time feel slower than usual, or normal/fast?",
    uiLabels: {
      MORE: "Time felt slower",
      LESS: "Time felt normal or fast",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more time dilation than usual",
      LESS: "less time dilation than usual",
      SAME: "similar time dilation to usual",
    },
  },
  flow: {
    id: "flow",
    domain: "Temporal",
    question: "Did you lose track of time, or were you very aware of it?",
    uiLabels: {
      MORE: "Lost track of time",
      LESS: "Very aware of time",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more flow than usual",
      LESS: "less flow than usual",
      SAME: "similar flow to usual",
    },
  },
  duration_awareness: {
    id: "duration_awareness",
    domain: "Temporal",
    question: "Looking back, did the experience feel longer or shorter than the clock time?",
    uiLabels: {
      MORE: "Felt longer than it was",
      LESS: "Felt shorter than it was",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more duration awareness than usual",
      LESS: "less duration awareness than usual",
      SAME: "similar duration awareness to usual",
    },
  },

  // ==========================================================================
  // Domain 6: Relational
  // ==========================================================================
  social_ease: {
    id: "social_ease",
    domain: "Relational",
    question: "Did you feel more socially at ease, or more withdrawn?",
    uiLabels: {
      MORE: "More socially at ease",
      LESS: "More withdrawn",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more social ease than usual",
      LESS: "less social ease than usual",
      SAME: "similar social ease to usual",
    },
  },
  empathic_attunement: {
    id: "empathic_attunement",
    domain: "Relational",
    question: "Were you more attuned to how others were feeling, or more self-focused?",
    uiLabels: {
      MORE: "More attuned to others",
      LESS: "More self-focused",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more empathic attunement than usual",
      LESS: "less empathic attunement than usual",
      SAME: "similar empathic attunement to usual",
    },
  },
  environmental_connection: {
    id: "environmental_connection",
    domain: "Relational",
    question: "Did you feel more connected to your surroundings, or more separate from them?",
    uiLabels: {
      MORE: "More connected to environment",
      LESS: "More separate",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more environmental connection than usual",
      LESS: "less environmental connection than usual",
      SAME: "similar environmental connection to usual",
    },
  },

  // ==========================================================================
  // Domain 7: Meaning
  // ==========================================================================
  significance: {
    id: "significance",
    domain: "Meaning",
    question: "Did the experience feel meaningful, or did it feel ordinary?",
    uiLabels: {
      MORE: "Felt meaningful",
      LESS: "Felt ordinary",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more significance than usual",
      LESS: "less significance than usual",
      SAME: "similar significance to usual",
    },
  },
  perspective_shift: {
    id: "perspective_shift",
    domain: "Meaning",
    question: "Did you see anything differently afterward, or was your perspective unchanged?",
    uiLabels: {
      MORE: "Saw things differently",
      LESS: "No change in perspective",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more perspective shift than usual",
      LESS: "less perspective shift than usual",
      SAME: "similar perspective shift to usual",
    },
  },
  integration_readiness: {
    id: "integration_readiness",
    domain: "Meaning",
    question: "Did it feel like there was something to reflect on later, or nothing particular to process?",
    uiLabels: {
      MORE: "Wanted to process afterward",
      LESS: "Nothing to process",
      SAME: "About the same",
      NOT_NOTICED: "Didn't notice",
    },
    aggregationPhrase: {
      MORE: "more integration readiness than usual",
      LESS: "less integration readiness than usual",
      SAME: "similar integration readiness to usual",
    },
  },
};

/**
 * Immutable Dimension Registry.
 * This is the single authoritative source for all dimension definitions.
 */
export const DIMENSION_REGISTRY: Readonly<Record<DimensionId, Readonly<DimensionDefinition>>> =
  Object.freeze(
    Object.fromEntries(
      Object.entries(REGISTRY_DATA).map(([id, def]) => [
        id,
        Object.freeze({
          ...def,
          uiLabels: Object.freeze(def.uiLabels),
          aggregationPhrase: Object.freeze(def.aggregationPhrase),
        }),
      ])
    )
  ) as Record<DimensionId, DimensionDefinition>;

/**
 * All dimension IDs as an array.
 */
export const ALL_DIMENSION_IDS: readonly DimensionId[] = Object.freeze(
  Object.keys(DIMENSION_REGISTRY) as DimensionId[]
);

/**
 * Get a dimension definition by ID.
 * Returns undefined if ID is not valid.
 */
export function getDimension(id: string): DimensionDefinition | undefined {
  return DIMENSION_REGISTRY[id as DimensionId];
}

