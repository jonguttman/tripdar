import { afterEach, describe, expect, it } from "vitest";

import {
  QA_STAFF_REVIEWER_EMAIL,
  QA_STAFF_REVIEW_PARTNER_ID_ENV,
  STAFF_REVIEWER_COUNT,
  STAFF_REVIEWER_EMAILS,
  TMT_DIRECT_STAFF_REVIEWER_COUNT,
  TMT_DIRECT_STAFF_REVIEWERS,
  approvedReviewerEmails,
  directStaffReviewerWhere,
  isQaStaffReviewPartner,
  isStaffReviewerEmail,
  resolveDirectStaffReviewRoster,
  staffReviewerWhere,
  tmtDirectStaffReviewerEmails,
} from "./staffReviewRoster";

const TMT_PARTNER_ID = "partner-tmt";
const QA_PARTNER_ID = "partner-qa-sandbox";

/** The QA identity is env-gated, so every test that needs it opts in explicitly. */
function seedQaIdentity(partnerId = QA_PARTNER_ID) {
  process.env[QA_STAFF_REVIEW_PARTNER_ID_ENV] = partnerId;
}

afterEach(() => {
  delete process.env[QA_STAFF_REVIEW_PARTNER_ID_ENV];
});

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

/**
 * KEWL-2475. A QA sandbox reviewer exists so agents can open the staff screens on prod
 * without claiming a real unclaimed name (KEWL-2474). These tests are the reason it is
 * partner-scoped rather than a seventh entry in the array: they must hold WITH the QA
 * identity live, which is exactly the condition a flat seventh entry could not survive.
 */
describe("QA sandbox reviewer scoping (KEWL-2475)", () => {
  it("does not widen the TMT allowlist, even with the QA identity seeded", () => {
    seedQaIdentity();

    // The literal boundary: still the same six addresses, in the same array.
    expect(STAFF_REVIEWER_COUNT).toBe(6);
    expect(STAFF_REVIEWER_EMAILS).not.toContain(QA_STAFF_REVIEWER_EMAIL);

    // And the TMT-scoped QUERY — which is what actually authorizes anyone holding the
    // shared TMT link — is exactly those six and nothing else.
    expect(approvedReviewerEmails(TMT_PARTNER_ID).sort()).toEqual([
      "adrienne@themushroomtop.internal",
      "audrey@themushroomtop.internal",
      "clay@themushroomtop.internal",
      "dani@themushroomtop.internal",
      "devon@themushroomtop.internal",
      "eddie@themushroomtop.internal",
    ]);
    expect(staffReviewerWhere(TMT_PARTNER_ID).email).toEqual({
      in: [...STAFF_REVIEWER_EMAILS],
    });
  });

  it("admits the QA address only under the QA partner scope", () => {
    seedQaIdentity();

    expect(staffReviewerWhere(QA_PARTNER_ID).email).toEqual({ in: [QA_STAFF_REVIEWER_EMAIL] });
    expect(isQaStaffReviewPartner(QA_PARTNER_ID)).toBe(true);
    expect(isQaStaffReviewPartner(TMT_PARTNER_ID)).toBe(false);
    expect(isQaStaffReviewPartner(null)).toBe(false);
  });

  it("never lets a QA-scoped read reach a real reviewer's name", () => {
    seedQaIdentity();

    // Replacement, not extension. Even a TMT-emailed row created under the QA partner
    // could not be claimed through the QA link.
    for (const approved of STAFF_REVIEWER_EMAILS) {
      expect(approvedReviewerEmails(QA_PARTNER_ID)).not.toContain(approved);
    }
  });

  it("admits the QA address nowhere when the env var is unset", () => {
    // Local dev and any preview without the var: the QA identity simply does not exist.
    expect(approvedReviewerEmails(QA_PARTNER_ID)).toEqual([...STAFF_REVIEWER_EMAILS]);
    expect(approvedReviewerEmails(undefined)).toEqual([...STAFF_REVIEWER_EMAILS]);
    expect(isQaStaffReviewPartner(QA_PARTNER_ID)).toBe(false);
  });

  it("keeps the unscoped admin read on the six TMT addresses", () => {
    seedQaIdentity();

    // The single-reviewer PIN reset passes an id with no partner. That must not become a
    // way into the QA scope — nor a way to widen TMT.
    const where = staffReviewerWhere(undefined, "employee-anything");
    expect(where.email).toEqual({ in: [...STAFF_REVIEWER_EMAILS] });
  });

  it("fails closed if the env var is misconfigured onto the TMT partner", () => {
    // Wrong direction of failure matters: pointing QA at TMT must lock the real roster
    // OUT (410 roster_empty upstream), never hand a real name to a QA link holder.
    seedQaIdentity(TMT_PARTNER_ID);

    expect(approvedReviewerEmails(TMT_PARTNER_ID)).toEqual([QA_STAFF_REVIEWER_EMAIL]);
    expect(approvedReviewerEmails(TMT_PARTNER_ID)).not.toContain(
      "audrey@themushroomtop.internal"
    );
  });
});

describe("direct staff-review invitation roster (KEWL-2950)", () => {
  function employees() {
    return TMT_DIRECT_STAFF_REVIEWERS.map((reviewer, index) => ({
      id: `employee-${index}`,
      partnerId: TMT_PARTNER_ID,
      name: reviewer.displayName,
      email: reviewer.email.toUpperCase(),
      active: true,
      optedOut: false,
    }));
  }

  it("uses exactly the six real-email direct reviewers without widening the legacy shared-link allowlist", () => {
    expect(TMT_DIRECT_STAFF_REVIEWER_COUNT).toBe(6);
    expect(tmtDirectStaffReviewerEmails()).toEqual([
      "sage@thegreenroomonventura.com",
      "dani@thehigherpath.com",
      "eddie@thehigherpath.com",
      "devinmandley@yahoo.com",
      "clayton@thehigherpath.com",
      "audrey@theotherpathcbd.com",
    ]);
    expect(directStaffReviewerWhere(TMT_PARTNER_ID)).toEqual({
      partnerId: TMT_PARTNER_ID,
      email: { in: tmtDirectStaffReviewerEmails() },
    });
    expect(STAFF_REVIEWER_EMAILS).not.toContain("sage@thegreenroomonventura.com");
  });

  it("computes a deterministic roster digest in canonical order", () => {
    const first = resolveDirectStaffReviewRoster(TMT_PARTNER_ID, employees());
    const second = resolveDirectStaffReviewRoster(TMT_PARTNER_ID, [...employees()].reverse());

    expect(first.reviewers.map((reviewer) => reviewer.displayName)).toEqual([
      "Sage",
      "Dani",
      "Eddie",
      "Devon",
      "Clay",
      "Audrey",
    ]);
    expect(first.rosterDigest).toBe(second.rosterDigest);
  });

  it("fails closed on missing, inactive, opted-out, or extra direct roster rows", () => {
    expect(() =>
      resolveDirectStaffReviewRoster(TMT_PARTNER_ID, employees().slice(1))
    ).toThrow(/Missing direct staff reviewer/);
    expect(() =>
      resolveDirectStaffReviewRoster(TMT_PARTNER_ID, [
        ...employees().slice(0, 1).map((employee) => ({ ...employee, active: false })),
        ...employees().slice(1),
      ])
    ).toThrow(/inactive/);
    expect(() =>
      resolveDirectStaffReviewRoster(TMT_PARTNER_ID, [
        ...employees().slice(0, 1).map((employee) => ({ ...employee, optedOut: true })),
        ...employees().slice(1),
      ])
    ).toThrow(/opted out/);
    expect(() =>
      resolveDirectStaffReviewRoster(TMT_PARTNER_ID, [
        ...employees(),
        {
          id: "employee-extra",
          partnerId: TMT_PARTNER_ID,
          name: "Extra",
          email: "extra@example.com",
          active: true,
          optedOut: false,
        },
      ])
    ).toThrow(/Expected 6 direct staff reviewers/);
  });
});
