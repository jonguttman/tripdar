import { describe, expect, it } from "vitest";
import {
  computeStaffFieldState,
  fieldSatisfiesGate,
  reviewerStillOwesField,
  type StaffFieldSubmission,
} from "./staffFieldVerification";
import { CONFIRMED_ABSENT_VALUE, DONT_KNOW_VALUE } from "./catalogFieldSpec";

const TIER_A = { requiredConfirmations: 1, requiresDistinctReviewers: false };
const TIER_B = { requiredConfirmations: 2, requiresDistinctReviewers: true };

let clock = 0;
function sub(
  value: unknown,
  actorIdentity: string,
  actorType: StaffFieldSubmission["actorType"] = "staff"
): StaffFieldSubmission {
  clock += 1000;
  return { value, actorIdentity, actorType, source: "packaging", createdAt: new Date(clock) };
}

describe("computeStaffFieldState — counting rules", () => {
  it("is unreviewed when nobody has looked", () => {
    const state = computeStaffFieldState({ submissions: [], rule: TIER_A });
    expect(state.state).toBe("unreviewed");
    expect(fieldSatisfiesGate(state)).toBe(false);
  });

  it("confirms a Tier A field on one confirmation", () => {
    const state = computeStaffFieldState({ submissions: [sub("Gummies", "adrienne")], rule: TIER_A });
    expect(state.state).toBe("confirmed");
    expect(state.confirmedValue).toBe("Gummies");
    expect(fieldSatisfiesGate(state)).toBe(true);
  });

  it("does NOT confirm Tier B on two submissions from the SAME reviewer", () => {
    const state = computeStaffFieldState({
      submissions: [sub(250, "adrienne"), sub(250, "adrienne")],
      rule: TIER_B,
    });
    expect(state.confirmationsCount).toBe(1);
    expect(state.state).not.toBe("confirmed");
    expect(fieldSatisfiesGate(state)).toBe(false);
  });

  it("confirms Tier B on two DISTINCT reviewers agreeing on the same value", () => {
    const state = computeStaffFieldState({
      submissions: [sub(250, "adrienne"), sub(250, "devon")],
      rule: TIER_B,
    });
    expect(state.confirmationsCount).toBe(2);
    expect(state.state).toBe("confirmed");
    expect(state.confirmedValue).toBe(250);
  });

  it("does NOT count a legacy id and its real-email alias as two distinct reviewers", () => {
    const state = computeStaffFieldState({
      submissions: [sub(250, "legacy-clay"), sub(250, "real-clay")],
      rule: TIER_B,
      identityAliases: [{ legacyEmployeeId: "legacy-clay", employeeId: "real-clay" }],
    });
    expect(state.confirmationsCount).toBe(1);
    expect(state.state).not.toBe("confirmed");
    expect(state.answeredReviewers).toEqual(["real-clay"]);
  });

  it("never counts 'I don't know', and stops nagging only that reviewer", () => {
    const state = computeStaffFieldState({
      submissions: [sub(DONT_KNOW_VALUE, "eddie")],
      rule: TIER_A,
    });
    expect(state.state).toBe("unknown");
    expect(fieldSatisfiesGate(state)).toBe(false);
    expect(state.dontKnowReviewers).toEqual(["eddie"]);
    expect(reviewerStillOwesField(state, "eddie")).toBe(false);
    expect(reviewerStillOwesField(state, "dani")).toBe(true);
  });

  it("treats 'confirmed absent' as a real answer that satisfies the gate", () => {
    const state = computeStaffFieldState({
      submissions: [sub(CONFIRMED_ABSENT_VALUE, "claw")],
      rule: TIER_A,
    });
    expect(state.state).toBe("confirmed");
    expect(state.confirmedValue).toBe(CONFIRMED_ABSENT_VALUE);
    expect(fieldSatisfiesGate(state)).toBe(true);
  });

  it("ignores brand and import submissions entirely", () => {
    const state = computeStaffFieldState({
      submissions: [sub(250, "brand-acme", "brand"), sub(250, "importer", "import")],
      rule: TIER_A,
    });
    expect(state.state).toBe("unreviewed");
    expect(state.confirmationsCount).toBe(0);
  });

  it("does not create a false dispute from list ordering", () => {
    const state = computeStaffFieldState({
      submissions: [sub(["cacao", "sugar"], "dani"), sub(["sugar", "cacao"], "devon")],
      rule: TIER_B,
    });
    expect(state.everConflicted).toBe(false);
    expect(state.state).toBe("confirmed");
  });
});

describe("computeStaffFieldState — liveValue", () => {
  // Regression: the second reviewer on a Tier B field must confirm the value the FIRST
  // reviewer entered, not the stale catalog column. Resolving "Confirm" against
  // confirmedValue (null until the threshold is met) made Tier B unreachable.
  it("exposes the pending value before the threshold is met", () => {
    const state = computeStaffFieldState({
      submissions: [sub("psilocybin", "adrienne")],
      rule: TIER_B,
    });
    expect(state.state).toBe("unreviewed");
    expect(state.confirmedValue).toBeNull();
    expect(state.liveValue).toBe("psilocybin");
  });

  it("tracks the live value through a correction", () => {
    const state = computeStaffFieldState({
      submissions: [sub(250, "adrienne"), sub(500, "dani")],
      rule: TIER_B,
    });
    expect(state.liveValue).toBe(500);
    expect(state.confirmedValue).toBeNull();
  });

  it("is null when nobody has answered", () => {
    expect(computeStaffFieldState({ submissions: [], rule: TIER_B }).liveValue).toBeNull();
  });
});

describe("computeStaffFieldState — corrections and disputes", () => {
  it("a Correct resets the count to 1 and supersedes prior agreement", () => {
    const state = computeStaffFieldState({
      submissions: [sub(250, "adrienne"), sub(250, "devon"), sub(500, "dani")],
      rule: TIER_B,
    });
    expect(state.everConflicted).toBe(true);
    expect(state.confirmationsCount).toBe(1);
    expect(state.state).toBe("disputed");
    expect(fieldSatisfiesGate(state)).toBe(false);
  });

  it("keeps both competing values on record — conflicts surface", () => {
    const state = computeStaffFieldState({
      submissions: [sub(250, "adrienne"), sub(500, "dani")],
      rule: TIER_B,
    });
    expect(state.competingValues).toEqual([250, 500]);
  });

  it("a Tier A correction does NOT last-write-wins — it needs a second reviewer", () => {
    const afterCorrection = computeStaffFieldState({
      submissions: [sub("Gummies", "adrienne"), sub("Ghost Gummies", "dani")],
      rule: TIER_A,
    });
    expect(afterCorrection.state).toBe("disputed");
    expect(afterCorrection.requiredConfirmations).toBe(2);
    expect(fieldSatisfiesGate(afterCorrection)).toBe(false);

    const afterConsensus = computeStaffFieldState({
      submissions: [
        sub("Gummies", "adrienne"),
        sub("Ghost Gummies", "dani"),
        sub("Ghost Gummies", "devon"),
      ],
      rule: TIER_A,
    });
    expect(afterConsensus.state).toBe("confirmed");
    expect(afterConsensus.confirmedValue).toBe("Ghost Gummies");
  });

  it("a disputed field still owes every reviewer, including those who said I don't know", () => {
    const state = computeStaffFieldState({
      submissions: [sub(250, "adrienne"), sub(DONT_KNOW_VALUE, "eddie"), sub(500, "dani")],
      rule: TIER_B,
    });
    expect(state.state).toBe("disputed");
    expect(reviewerStillOwesField(state, "eddie")).toBe(true);
  });
});
