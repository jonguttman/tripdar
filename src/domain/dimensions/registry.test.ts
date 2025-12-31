/**
 * Dimension Registry Guardrails
 *
 * Meaning Layer v1.0 — These tests lock dimension meaning.
 *
 * If these tests break, it means someone changed dimension definitions.
 * That change must be reviewed for Meaning Layer compliance.
 */

import { describe, it, expect } from "vitest";
import {
  DIMENSION_REGISTRY,
  ALL_DIMENSION_IDS,
  getDimension,
  type DimensionId,
  type DimensionDefinition,
} from "./registry";

/**
 * Forbidden language patterns per Meaning Layer v1.0.
 */
/**
 * Forbidden language patterns per Meaning Layer v1.0.
 * Note: "very" is allowed in specific authoritative phrases from the spec
 * (e.g., "very aware of time" for Flow dimension).
 */
const FORBIDDEN_PATTERNS = {
  intensity: /\b(extremely|significantly|much|highly|strongly|intensely)\b/i,
  evaluative: /\b(better|worse|good|bad|improved|degraded|positive|negative)\b/i,
  outcome: /\b(helped|worked|effective|beneficial|useful|successful|failed)\b/i,
};

describe("Dimension Registry Structure", () => {
  it("contains exactly 28 dimensions", () => {
    expect(ALL_DIMENSION_IDS).toHaveLength(28);
    expect(Object.keys(DIMENSION_REGISTRY)).toHaveLength(28);
  });

  it("all dimension IDs are lowercase with underscores only", () => {
    for (const id of ALL_DIMENSION_IDS) {
      expect(id).toMatch(/^[a-z_]+$/);
    }
  });

  it("every dimension has a valid domain", () => {
    const validDomains = [
      "Cognitive",
      "Emotional",
      "Somatic",
      "Perceptual",
      "Temporal",
      "Relational",
      "Meaning",
    ];

    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      expect(validDomains).toContain(dim.domain);
    }
  });

  it("every dimension ID matches its definition id field", () => {
    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      expect(dim.id).toBe(id);
    }
  });
});

describe("UI Labels", () => {
  it("every dimension has exactly 4 UI labels", () => {
    const requiredLabels = ["MORE", "LESS", "SAME", "NOT_NOTICED"];

    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      const labelKeys = Object.keys(dim.uiLabels);
      expect(labelKeys).toHaveLength(4);
      expect(labelKeys.sort()).toEqual(requiredLabels.sort());
    }
  });

  it("all UI labels are non-empty strings", () => {
    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      for (const [key, label] of Object.entries(dim.uiLabels)) {
        expect(typeof label).toBe("string");
        expect(label.length).toBeGreaterThan(0);
      }
    }
  });

  it("NOT_NOTICED labels indicate absence, not failure", () => {
    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      const label = dim.uiLabels.NOT_NOTICED;
      expect(label).toBe("Didn't notice");
    }
  });

  it("no UI label contains intensity language", () => {
    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      for (const [key, label] of Object.entries(dim.uiLabels)) {
        expect(label).not.toMatch(FORBIDDEN_PATTERNS.intensity);
      }
    }
  });

  it("no UI label contains evaluative language", () => {
    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      for (const [key, label] of Object.entries(dim.uiLabels)) {
        expect(label).not.toMatch(FORBIDDEN_PATTERNS.evaluative);
      }
    }
  });

  it("no UI label contains outcome language", () => {
    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      for (const [key, label] of Object.entries(dim.uiLabels)) {
        expect(label).not.toMatch(FORBIDDEN_PATTERNS.outcome);
      }
    }
  });
});

describe("Aggregation Phrases", () => {
  it("every dimension has exactly 3 aggregation phrases", () => {
    const requiredPhrases = ["MORE", "LESS", "SAME"];

    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      const phraseKeys = Object.keys(dim.aggregationPhrase);
      expect(phraseKeys).toHaveLength(3);
      expect(phraseKeys.sort()).toEqual(requiredPhrases.sort());
    }
  });

  it("all aggregation phrases are non-empty strings", () => {
    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      for (const [key, phrase] of Object.entries(dim.aggregationPhrase)) {
        expect(typeof phrase).toBe("string");
        expect(phrase.length).toBeGreaterThan(0);
      }
    }
  });

  it("aggregation phrases follow the pattern 'more/less/similar X than/to usual'", () => {
    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      expect(dim.aggregationPhrase.MORE).toMatch(/^more .+ than usual$/);
      expect(dim.aggregationPhrase.LESS).toMatch(/^less .+ than usual$/);
      expect(dim.aggregationPhrase.SAME).toMatch(/^similar .+ to usual$/);
    }
  });

  it("no aggregation phrase contains intensity language", () => {
    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      for (const [key, phrase] of Object.entries(dim.aggregationPhrase)) {
        expect(phrase).not.toMatch(FORBIDDEN_PATTERNS.intensity);
      }
    }
  });

  it("no aggregation phrase contains evaluative language", () => {
    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      for (const [key, phrase] of Object.entries(dim.aggregationPhrase)) {
        expect(phrase).not.toMatch(FORBIDDEN_PATTERNS.evaluative);
      }
    }
  });

  it("no aggregation phrase contains outcome language", () => {
    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      for (const [key, phrase] of Object.entries(dim.aggregationPhrase)) {
        expect(phrase).not.toMatch(FORBIDDEN_PATTERNS.outcome);
      }
    }
  });
});

describe("Questions", () => {
  it("every dimension has a non-empty question", () => {
    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      expect(typeof dim.question).toBe("string");
      expect(dim.question.length).toBeGreaterThan(0);
    }
  });

  it("all questions end with a question mark", () => {
    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      expect(dim.question.trim()).toMatch(/\?$/);
    }
  });

  it("no question contains intensity language", () => {
    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      expect(dim.question).not.toMatch(FORBIDDEN_PATTERNS.intensity);
    }
  });

  it("no question contains evaluative language", () => {
    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      expect(dim.question).not.toMatch(FORBIDDEN_PATTERNS.evaluative);
    }
  });

  it("no question contains outcome language", () => {
    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      expect(dim.question).not.toMatch(FORBIDDEN_PATTERNS.outcome);
    }
  });
});

describe("Registry Immutability", () => {
  it("DIMENSION_REGISTRY is frozen", () => {
    expect(Object.isFrozen(DIMENSION_REGISTRY)).toBe(true);
  });

  it("each dimension definition is frozen", () => {
    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      expect(Object.isFrozen(dim)).toBe(true);
    }
  });

  it("uiLabels objects are frozen", () => {
    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      expect(Object.isFrozen(dim.uiLabels)).toBe(true);
    }
  });

  it("aggregationPhrase objects are frozen", () => {
    for (const id of ALL_DIMENSION_IDS) {
      const dim = DIMENSION_REGISTRY[id];
      expect(Object.isFrozen(dim.aggregationPhrase)).toBe(true);
    }
  });

  it("ALL_DIMENSION_IDS is frozen", () => {
    expect(Object.isFrozen(ALL_DIMENSION_IDS)).toBe(true);
  });
});

describe("getDimension helper", () => {
  it("returns dimension for valid ID", () => {
    const dim = getDimension("clarity");
    expect(dim).toBeDefined();
    expect(dim?.id).toBe("clarity");
  });

  it("returns undefined for invalid ID", () => {
    const dim = getDimension("not_a_dimension");
    expect(dim).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    const dim = getDimension("");
    expect(dim).toBeUndefined();
  });
});

describe("Domain Coverage", () => {
  it("Cognitive domain has 5 dimensions", () => {
    const cognitive = ALL_DIMENSION_IDS.filter(
      (id) => DIMENSION_REGISTRY[id].domain === "Cognitive"
    );
    expect(cognitive).toHaveLength(5);
  });

  it("Emotional domain has 5 dimensions", () => {
    const emotional = ALL_DIMENSION_IDS.filter(
      (id) => DIMENSION_REGISTRY[id].domain === "Emotional"
    );
    expect(emotional).toHaveLength(5);
  });

  it("Somatic domain has 5 dimensions", () => {
    const somatic = ALL_DIMENSION_IDS.filter(
      (id) => DIMENSION_REGISTRY[id].domain === "Somatic"
    );
    expect(somatic).toHaveLength(5);
  });

  it("Perceptual domain has 4 dimensions", () => {
    const perceptual = ALL_DIMENSION_IDS.filter(
      (id) => DIMENSION_REGISTRY[id].domain === "Perceptual"
    );
    expect(perceptual).toHaveLength(4);
  });

  it("Temporal domain has 3 dimensions", () => {
    const temporal = ALL_DIMENSION_IDS.filter(
      (id) => DIMENSION_REGISTRY[id].domain === "Temporal"
    );
    expect(temporal).toHaveLength(3);
  });

  it("Relational domain has 3 dimensions", () => {
    const relational = ALL_DIMENSION_IDS.filter(
      (id) => DIMENSION_REGISTRY[id].domain === "Relational"
    );
    expect(relational).toHaveLength(3);
  });

  it("Meaning domain has 3 dimensions", () => {
    const meaning = ALL_DIMENSION_IDS.filter(
      (id) => DIMENSION_REGISTRY[id].domain === "Meaning"
    );
    expect(meaning).toHaveLength(3);
  });
});

describe("Exhaustive DimensionId Type Check", () => {
  it("all expected dimension IDs exist", () => {
    const expectedIds: DimensionId[] = [
      // Cognitive
      "clarity",
      "fluidity",
      "introspection",
      "presence",
      "novelty",
      // Emotional
      "openness",
      "calm",
      "sensitivity",
      "warmth",
      "depth",
      // Somatic
      "body_awareness",
      "energy",
      "relaxation",
      "groundedness",
      "sensory_acuity",
      // Perceptual
      "visual_nuance",
      "auditory_texture",
      "spatial_awareness",
      "aesthetic_sensitivity",
      // Temporal
      "time_dilation",
      "flow",
      "duration_awareness",
      // Relational
      "social_ease",
      "empathic_attunement",
      "environmental_connection",
      // Meaning
      "significance",
      "perspective_shift",
      "integration_readiness",
    ];

    // Spread frozen arrays before sorting
    expect([...ALL_DIMENSION_IDS].sort()).toEqual([...expectedIds].sort());
  });
});

