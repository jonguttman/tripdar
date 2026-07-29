import { describe, expect, it } from "vitest";

import {
  STAFF_REVIEWER_COUNT,
  STAFF_REVIEWER_EMAILS,
  isStaffReviewerEmail,
  staffReviewerWhere,
} from "./staffReviewRoster";

/**
 * KEWL-2402 / KEWL-2379. Under Jon's shared unbound link, the roster query is the
 * authorization boundary — anyone holding the link can claim any unclaimed name it
 * returns. These tests pin that boundary to the six approved addresses.
 */
describe("staff reviewer allowlist", () => {
  it("is exactly the six approved reviewers, with Clay not Claw", () => {
    expect(STAFF_REVIEWER_COUNT).toBe(6);
    expect([...STAFF_REVIEWER_EMAILS].sort()).toEqual([
      "adrienne@themushroomtop.internal",
      "audrey@themushroomtop.internal",
      "clay@themushroomtop.internal",
      "dani@themushroomtop.internal",
      "devon@themushroomtop.internal",
      "eddie@themushroomtop.internal",
    ]);
    // The KEWL-2379 roster correction: "Claw" must never reappear as an identity.
    expect(STAFF_REVIEWER_EMAILS).not.toContain("claw@themushroomtop.internal");
  });

  it("always constrains on the allowlist, active, and opted-in", () => {
    const where = staffReviewerWhere("partner-1");
    expect(where).toEqual({
      partnerId: "partner-1",
      active: true,
      optedOut: false,
      email: { in: [...STAFF_REVIEWER_EMAILS] },
    });
  });

  it("keeps the allowlist when narrowing to a single employee id", () => {
    // Passing an id must not be a way around the email constraint — this is the path
    // the admin single-reviewer PIN reset uses.
    const where = staffReviewerWhere(undefined, "employee-outsider");
    expect(where.id).toBe("employee-outsider");
    expect(where.email).toEqual({ in: [...STAFF_REVIEWER_EMAILS] });
    expect(where.active).toBe(true);
    expect(where.optedOut).toBe(false);
    expect(where.partnerId).toBeUndefined();
  });

  it("narrows by both partner and id when both are supplied", () => {
    const where = staffReviewerWhere("partner-1", "employee-clay");
    expect(where).toMatchObject({
      id: "employee-clay",
      partnerId: "partner-1",
      email: { in: [...STAFF_REVIEWER_EMAILS] },
    });
  });

  it("recognises approved addresses case-insensitively and rejects everything else", () => {
    expect(isStaffReviewerEmail("clay@themushroomtop.internal")).toBe(true);
    expect(isStaffReviewerEmail("  Clay@TheMushroomTop.Internal  ")).toBe(true);

    expect(isStaffReviewerEmail("claw@themushroomtop.internal")).toBe(false);
    expect(isStaffReviewerEmail("warehouse-temp@themushroomtop.internal")).toBe(false);
    expect(isStaffReviewerEmail("clay@evil.example")).toBe(false);
    expect(isStaffReviewerEmail(null)).toBe(false);
    expect(isStaffReviewerEmail(undefined)).toBe(false);
    expect(isStaffReviewerEmail("")).toBe(false);
  });
});
