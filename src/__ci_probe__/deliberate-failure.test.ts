import { describe, expect, it } from "vitest";

// KEWL-2465 probe ONLY. This test is intentionally red so we can observe
// whether the required "Test (vitest)" status check actually blocks a merge.
// The branch and its PR are deleted immediately after the observation.
describe("KEWL-2465 required-check probe", () => {
  it("fails on purpose", () => {
    expect(1).toBe(3);
  });
});
