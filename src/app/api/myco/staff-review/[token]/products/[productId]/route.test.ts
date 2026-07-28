import { describe, expect, it } from "vitest";
import { normalizeReviewValue } from "./route";

describe("staff-review value normalization", () => {
  it("accepts only positive safe integers for numeric catalog fields", () => {
    const rule = { fieldName: "productUnitMg", inputType: "number" };

    expect(normalizeReviewValue("250", rule)).toBe(250);
    expect(normalizeReviewValue(-1, rule)).toBeNull();
    expect(normalizeReviewValue(2.5, rule)).toBeNull();
    expect(normalizeReviewValue(Number.MAX_SAFE_INTEGER + 1, rule)).toBeNull();
  });

  it("canonicalizes active compounds and known strain names", () => {
    expect(
      normalizeReviewValue(" Psilocybin ", {
        fieldName: "activeCompound",
        inputType: "text",
      })
    ).toBe("psilocybin");
    expect(
      normalizeReviewValue("Golden Teacher", {
        fieldName: "strainSlug",
        inputType: "text",
      })
    ).toBe("golden-teacher");
  });

  it("rejects an unknown strain before it reaches the ledger", () => {
    expect(
      normalizeReviewValue("Definitely Not A Real Strain", {
        fieldName: "strainSlug",
        inputType: "text",
      })
    ).toBeNull();
  });
});
