import { describe, expect, it } from "vitest";
import { getStrainBySlug, isValidStrainSlug, normalizeStrainSlug } from "./data";

describe("strain slug normalization", () => {
  it("normalizes canonical ids and display names to catalog ids", () => {
    expect(normalizeStrainSlug("golden-teacher")).toBe("golden-teacher");
    expect(normalizeStrainSlug("Golden Teacher")).toBe("golden-teacher");
    expect(normalizeStrainSlug("  Golden   Teacher  ")).toBe("golden-teacher");
  });

  it("resolves special display names without losing the canonical id", () => {
    expect(normalizeStrainSlug("B+")).toBe("b-plus");
    expect(getStrainBySlug("B+")?.id).toBe("b-plus");
  });

  it("rejects unresolved non-empty values", () => {
    expect(normalizeStrainSlug("not-a-strain")).toBeNull();
    expect(isValidStrainSlug("not-a-strain")).toBe(false);
  });
});
