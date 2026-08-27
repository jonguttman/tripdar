import { describe, expect, it } from "vitest";
import { scoreProducts, type ProductCandidate } from "./scoring";
import { emptyVibeScores, type VibeScores } from "./vibes";
import { intentsToVector } from "./intents";
import { aggregateTesterVotes, computeConfidence } from "./community";

function candidate(overrides: Partial<ProductCandidate> & { id: string }): ProductCandidate {
  return {
    productName: overrides.id,
    format: "capsule",
    brandName: "Psilly",
    strainSlug: null,
    photoUrl: null,
    ingredients: [],
    flavors: [],
    onsetMinutes: 30,
    durationMinutes: 240,
    brandDoseInstructions: null,
    vibeScores: emptyVibeScores(),
    strengthOffset: "standard",
    strengthRationale: null,
    fieldVerificationStates: {},
    dose: {
      format: "capsule",
      activeCompound: "psilocybin",
      productUnitMg: 100,
      brandDoseTiers: null,
      brandMicroUnits: 1,
      brandMiniUnits: 2,
      brandMacroUnits: 5,
    },
    ...overrides,
  };
}

function vibes(partial: Partial<VibeScores>): VibeScores {
  return { ...emptyVibeScores(), ...partial };
}

describe("scoreProducts", () => {
  it("ranks the product whose vibe profile matches the intent highest", () => {
    const focusIntent = intentsToVector(["focus"]);
    const results = scoreProducts({
      intentVector: focusIntent,
      experienceLevel: "experienced",
      intensity: "moderate",
      formatPreference: null,
      candidates: [
        candidate({ id: "sleepy", vibeScores: vibes({ energy_direction: -0.9, somatic: 0.7 }) }),
        candidate({ id: "focused", vibeScores: vibes({ clarity_cognition: 0.9, depth_direction: -0.5 }) }),
      ],
    });
    expect(results[0].candidate.id).toBe("focused");
    expect(results[0].matchScore).toBeGreaterThan(results[1].matchScore);
  });

  it("boosts products matching the format preference", () => {
    const profile = vibes({ mood_social: 0.8 });
    const results = scoreProducts({
      intentVector: intentsToVector(["social"]),
      experienceLevel: "experienced",
      intensity: "moderate",
      formatPreference: "edible",
      candidates: [
        candidate({ id: "caps", format: "capsule", vibeScores: profile }),
        candidate({ id: "gummies", format: "edible", vibeScores: profile }),
      ],
    });
    expect(results[0].candidate.id).toBe("gummies");
    expect(results[0].formatBoost).toBe(8);
    expect(results[1].formatBoost).toBe(0);
  });

  it("flags strain-specific products whose strain also fits the intent", () => {
    const spiritualProfile = vibes({ depth_direction: 0.9, visual_pattern: 0.6 });
    const strainProfiles = new Map([
      ["golden-teacher", { vector: spiritualProfile, name: "Golden Teacher" }],
    ]);
    const results = scoreProducts({
      intentVector: intentsToVector(["spiritual"]),
      experienceLevel: "experienced",
      intensity: "deep",
      formatPreference: null,
      candidates: [
        candidate({ id: "gt-caps", strainSlug: "golden-teacher", vibeScores: spiritualProfile }),
        candidate({ id: "blend", vibeScores: spiritualProfile }),
      ],
      strainProfiles,
    });
    const gt = results.find((r) => r.candidate.id === "gt-caps")!;
    expect(gt.strainMatch).toBe(true);
    expect(gt.strainName).toBe("Golden Teacher");
    expect(results.find((r) => r.candidate.id === "blend")!.strainMatch).toBe(false);
    // Near-equal scores: strain match surfaces first
    expect(results[0].candidate.id).toBe("gt-caps");
  });

  it("includes dose guidance and key vibes on each result", () => {
    const results = scoreProducts({
      intentVector: intentsToVector(["focus"]),
      experienceLevel: "new",
      intensity: "gentle",
      formatPreference: null,
      candidates: [
        candidate({ id: "p1", vibeScores: vibes({ clarity_cognition: 0.9, energy_direction: 0.4 }) }),
      ],
    });
    expect(results[0].doseGuidance?.tierCategory).toBe("micro");
    expect(results[0].keyVibes[0].key).toBe("clarity_cognition");
  });
});

describe("community aggregation", () => {
  it("maps 0-100 sliders onto -1..1 axis means", () => {
    const agg = aggregateTesterVotes([
      { clarityCognition: 100, moodSocial: 50, visualPattern: 0, somatic: null, energyDirection: 75, depthDirection: 25 },
      { clarityCognition: 80, moodSocial: 50, visualPattern: 20, somatic: null, energyDirection: 75, depthDirection: 25 },
    ]);
    expect(agg.voteCount).toBe(2);
    expect(agg.scores!.clarity_cognition).toBeCloseTo(0.8);
    expect(agg.scores!.mood_social).toBe(0);
    expect(agg.scores!.visual_pattern).toBeCloseTo(-0.8);
    expect(agg.axisCounts.somatic).toBe(0);
  });

  it("returns null scores when no vote has axis data", () => {
    const agg = aggregateTesterVotes([
      { clarityCognition: null, moodSocial: null, visualPattern: null, somatic: null, energyDirection: null, depthDirection: null },
    ]);
    expect(agg.scores).toBeNull();
    expect(agg.voteCount).toBe(1);
  });

  it("computes confidence from volume and agreement", () => {
    expect(computeConfidence(0, null)).toBe("none");
    expect(computeConfidence(2, 0.1)).toBe("low");
    expect(computeConfidence(5, 0.2)).toBe("building");
    expect(computeConfidence(12, 0.2)).toBe("solid");
    expect(computeConfidence(12, 0.6)).toBe("building");
  });
});
