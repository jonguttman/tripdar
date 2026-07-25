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

  it("can normalize against a live catalog entry outside the seed catalog", () => {
    const liveCatalog = [
      { id: "golden-teacher", name: "Golden Teacher" },
      { id: "blob-added-strain", name: "Blob Added Strain" },
    ];

    expect(normalizeStrainSlug("blob-added-strain", liveCatalog)).toBe("blob-added-strain");
    expect(normalizeStrainSlug("Blob Added Strain", liveCatalog)).toBe("blob-added-strain");
  });

  it("rejects unresolved non-empty values", () => {
    expect(normalizeStrainSlug("not-a-strain")).toBeNull();
    expect(isValidStrainSlug("not-a-strain")).toBe(false);
  });
});
