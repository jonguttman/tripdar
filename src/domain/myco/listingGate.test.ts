import { describe, expect, it } from "vitest";
import { canActivate, evaluateListingGate, type GateFieldRule } from "./listingGate";
import { CATALOG_FIELD_SPECS, PHOTO_CHECK_FIELD } from "./catalogFieldSpec";
import type { StaffFieldState } from "./staffFieldVerification";
import type { ReadinessInput } from "./readiness";

const RULES: GateFieldRule[] = CATALOG_FIELD_SPECS.map((spec) => ({
  fieldName: spec.fieldName,
  tier: spec.tier,
  gateRequired: spec.gateRequired,
  readinessKey: spec.readinessKey,
  label: spec.label,
  gateSatisfyingValues: spec.gateSatisfyingValues,
}));

function confirmed(): StaffFieldState {
  return {
    state: "confirmed",
    confirmationsCount: 2,
    requiredConfirmations: 2,
    confirmedValue: "x",
    liveValue: "x",
    everConflicted: false,
    competingValues: ["x"],
    dontKnowReviewers: [],
    answeredReviewers: ["adrienne", "devon"],
  };
}

function withState(overrides: Partial<StaffFieldState>): StaffFieldState {
  const base = { ...confirmed(), ...overrides };
  // Keep the live candidate in step with confirmedValue unless a test sets it explicitly.
  if ("confirmedValue" in overrides && !("liveValue" in overrides)) {
    base.liveValue = overrides.confirmedValue;
  }
  return base;
}

/** Every gate-required field verified. */
function allConfirmed(): Record<string, StaffFieldState> {
  const states: Record<string, StaffFieldState> = {};
  for (const rule of RULES) {
    if (!rule.gateRequired) continue;
    // The photo check only satisfies the gate on "yes".
    states[rule.fieldName] = rule.gateSatisfyingValues.length
      ? withState({ confirmedValue: rule.gateSatisfyingValues[0] })
      : confirmed();
  }
  return states;
}

/** A product whose data is complete EXCEPT the two Tier-D items, which need dosed sessions. */
function readyExceptTierD(): ReadinessInput {
  return {
    format: "edible",
    brand: "Neau Tropics",
    brandId: "b1",
    productUnitMg: 250,
    unitsPerPack: 16,
    totalDoseMg: 4000,
    onsetMinutes: 30,
    durationMinutes: 240,
    brandMicroUnits: 1,
    brandMiniUnits: 2,
    brandMacroUnits: 4,
    brandDoseTiers: null,
    photoUrl: "https://example.test/p.png",
    photoCount: 1,
    vibeScores: null, // Tier D — absent
    strengthOffset: null, // Tier D — absent
  };
}

function baseInput() {
  return {
    readiness: readyExceptTierD(),
    rules: RULES,
    fieldStates: allConfirmed(),
    activeCompound: "psilocybin",
    researchOnly: false,
    override: null,
  };
}

describe("evaluateListingGate — Tier D exclusion", () => {
  it("lists a product that is complete except vibe profile and strength offset", () => {
    const result = evaluateListingGate(baseInput());
    expect(result.blockers).toEqual([]);
    expect(result.listable).toBe(true);
    expect(canActivate(result)).toBe(true);
  });

  it("blocks again the moment Tier D is flipped to gateRequired in config — no code change", () => {
    const tightened = RULES.map((rule) =>
      rule.tier === "D" ? { ...rule, gateRequired: true } : rule
    );
    const result = evaluateListingGate({ ...baseInput(), rules: tightened });
    const labels = result.blockers.map((b) => b.label);
    expect(labels).toContain("Missing vibe profile");
    expect(labels).toContain("Missing strength offset confirmation");
    expect(result.listable).toBe(false);
  });
});

describe("evaluateListingGate — blocking conditions", () => {
  it("fails closed when activeCompound is unknown", () => {
    const result = evaluateListingGate({ ...baseInput(), activeCompound: "unknown" });
    expect(result.listable).toBe(false);
    expect(result.blockers.some((b) => b.kind === "unknown_active_compound")).toBe(true);
  });

  it("fails closed when activeCompound is unknown with different casing", () => {
    const result = evaluateListingGate({ ...baseInput(), activeCompound: "  UNKNOWN " });
    expect(result.listable).toBe(false);
    expect(result.blockers.some((b) => b.kind === "unknown_active_compound")).toBe(true);
  });

  it("blocks on a disputed Tier B field", () => {
    const fieldStates = allConfirmed();
    fieldStates.productUnitMg = withState({ state: "disputed", confirmationsCount: 1 });
    const result = evaluateListingGate({ ...baseInput(), fieldStates });
    expect(result.listable).toBe(false);
    expect(result.blockers.some((b) => b.kind === "disputed_field" && b.fieldName === "productUnitMg")).toBe(true);
  });

  it("blocks on an unverified field", () => {
    const fieldStates = allConfirmed();
    delete fieldStates.allergens;
    const result = evaluateListingGate({ ...baseInput(), fieldStates });
    expect(result.blockers.some((b) => b.kind === "unverified_field" && b.fieldName === "allergens")).toBe(true);
    expect(result.listable).toBe(false);
  });

  it("blocks on missing readiness data", () => {
    const readiness = { ...readyExceptTierD(), onsetMinutes: null };
    const result = evaluateListingGate({ ...baseInput(), readiness });
    expect(result.blockers.some((b) => b.label === "Missing onset")).toBe(true);
    expect(result.listable).toBe(false);
  });

  it("blocks when reviewers agree the photo is WRONG — reviewed is not the same as passing", () => {
    const fieldStates = allConfirmed();
    fieldStates[PHOTO_CHECK_FIELD] = withState({ confirmedValue: "no" });
    const result = evaluateListingGate({ ...baseInput(), fieldStates });
    expect(result.listable).toBe(false);
    expect(
      result.blockers.some((b) => b.fieldName === PHOTO_CHECK_FIELD && b.label.includes("no"))
    ).toBe(true);
  });

  it("an 'I don't know' field does not satisfy the gate", () => {
    const fieldStates = allConfirmed();
    fieldStates.strainSlug = withState({ state: "unknown", confirmationsCount: 0, confirmedValue: null });
    const result = evaluateListingGate({ ...baseInput(), fieldStates });
    expect(result.listable).toBe(false);
  });
});

describe("evaluateListingGate — research-only and override", () => {
  const RESEARCH_ONLY = { ...baseInput(), researchOnly: true };

  it("excludes a research-only product (G23) outright", () => {
    const result = evaluateListingGate(RESEARCH_ONLY);
    expect(result.listable).toBe(false);
    expect(result.hardBlockers.some((b) => b.kind === "research_only")).toBe(true);
  });

  it("does not let even a valid override list a research-only product", () => {
    const result = evaluateListingGate({
      ...RESEARCH_ONLY,
      override: { at: new Date(), by: "jon", reason: "pilot exception" },
    });
    expect(result.listable).toBe(false);
  });

  it("force-lists a blocked product on a valid Jon override", () => {
    const fieldStates = allConfirmed();
    delete fieldStates.allergens;
    const result = evaluateListingGate({
      ...baseInput(),
      fieldStates,
      override: { at: new Date(), by: "jon", reason: "confirmed with the brand rep by phone" },
    });
    expect(result.listable).toBe(true);
    expect(result.viaOverride).toBe(true);
  });

  it("ignores an override with no typed reason — never a silent boolean", () => {
    const fieldStates = allConfirmed();
    delete fieldStates.allergens;
    for (const reason of [null, "", "   "]) {
      const result = evaluateListingGate({
        ...baseInput(),
        fieldStates,
        override: { at: new Date(), by: "jon", reason },
      });
      expect(result.listable).toBe(false);
    }
  });
});
