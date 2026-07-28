import { describe, expect, it } from "vitest";
import {
  applyAcceptedChangeToFieldState,
  buildCatalogFieldChange,
  computeFieldVerificationState,
} from "./catalogProvenance";

describe("catalog provenance", () => {
  it("stores unknown as a first-class reviewed state", () => {
    const state = computeFieldVerificationState({
      current: null,
      submissions: [
        {
          value: "unknown",
          actorType: "staff",
          actorIdentity: "employee-a",
          source: "unsure",
        },
      ],
      rule: { requiredConfirmations: 2 },
    });

    expect(state).toMatchObject({
      state: "unknown",
      requiredConfirmations: 2,
      confirmationsCount: 1,
      confirmedValue: null,
    });
  });

  it("requires configurable independent confirmations", () => {
    const oneSubmission = computeFieldVerificationState({
      current: null,
      submissions: [
        { value: 500, actorType: "staff", actorIdentity: "a", source: "packaging" },
      ],
      rule: { requiredConfirmations: 2 },
    });
    const twoSubmissions = computeFieldVerificationState({
      current: null,
      submissions: [
        { value: 500, actorType: "staff", actorIdentity: "a", source: "packaging" },
        { value: 500, actorType: "staff", actorIdentity: "b", source: "packaging" },
      ],
      rule: { requiredConfirmations: 2 },
    });

    expect(oneSubmission.state).toBe("unreviewed");
    expect(oneSubmission.confirmationsCount).toBe(1);
    expect(twoSubmissions.state).toBe("confirmed");
    expect(twoSubmissions.confirmedValue).toBe(500);
  });

  it("surfaces conflicts without overwriting accepted values", () => {
    const state = computeFieldVerificationState({
      current: {
        state: "confirmed",
        requiredConfirmations: 1,
        confirmationsCount: 1,
        confirmedValue: "chocolate",
      },
      submissions: [
        { value: "chocolate", actorType: "staff", actorIdentity: "a", source: "packaging" },
        { value: "gummy", actorType: "staff", actorIdentity: "b", source: "packaging" },
      ],
      rule: { requiredConfirmations: 1 },
    });

    expect(state.state).toBe("disputed");
    expect(state.confirmedValue).toBe("chocolate");
  });

  it("moves staff-confirmed fields to needs_re_review after accepted brand changes", () => {
    const state = applyAcceptedChangeToFieldState({
      current: {
        state: "confirmed",
        requiredConfirmations: 2,
        confirmationsCount: 2,
        confirmedValue: 100,
      },
      acceptedChange: { actorType: "brand", submittedValue: 120 },
    });

    expect(state).toMatchObject({
      state: "needs_re_review",
      confirmationsCount: 0,
      confirmedValue: 120,
    });
  });

  it("normalizes append-only change entries", () => {
    expect(
      buildCatalogFieldChange({
        fieldName: " productUnitMg ",
        previousValue: 100,
        submittedValue: 120,
        actorType: "brand",
        actorIdentity: " brand@example.com ",
        source: "brand-provided",
      })
    ).toMatchObject({
      fieldName: "productUnitMg",
      actorIdentity: "brand@example.com",
      disposition: "pending",
    });
  });
});
