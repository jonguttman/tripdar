import { describe, expect, it } from "vitest";
import { normalizeFlavors, matchFlavor, MAX_FLAVORS } from "./flavors";

describe("normalizeFlavors", () => {
  it("trims, collapses whitespace, and drops empties and non-strings", () => {
    expect(normalizeFlavors(["  Mint ", "Sour   Apple", "", "   ", 42, null])).toEqual([
      "Mint",
      "Sour Apple",
    ]);
  });

  it("dedupes case-insensitively, keeping the first casing", () => {
    expect(normalizeFlavors(["Mint", "mint", "MINT", "Raspberry"])).toEqual(["Mint", "Raspberry"]);
  });

  it("caps the list length", () => {
    const many = Array.from({ length: 40 }, (_, i) => `Flavor ${i}`);
    expect(normalizeFlavors(many)).toHaveLength(MAX_FLAVORS);
  });

  it("returns [] for non-arrays", () => {
    expect(normalizeFlavors("Mint")).toEqual([]);
    expect(normalizeFlavors(undefined)).toEqual([]);
  });
});

describe("matchFlavor", () => {
  const flavors = ["Mint", "Sour Apple"];

  it("matches case-insensitively and returns canonical casing", () => {
    expect(matchFlavor("mint", flavors)).toBe("Mint");
    expect(matchFlavor("  SOUR APPLE ", flavors)).toBe("Sour Apple");
  });

  it("rejects unknown flavors and junk", () => {
    expect(matchFlavor("Chocolate", flavors)).toBeNull();
    expect(matchFlavor("", flavors)).toBeNull();
    expect(matchFlavor(undefined, flavors)).toBeNull();
  });
});
