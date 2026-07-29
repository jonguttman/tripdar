/**
 * KEWL-2379 — `requireReviewer` is the gate in front of every staff-review read and write.
 *
 * On the shared link (Jon's override) it must still refuse anyone who is not currently on
 * that link's roster, and it must retire sessions whose PIN has since been reset by an
 * admin — that reset is the only recovery path when a name is claimed by the wrong person,
 * so it has to actually revoke the device, not just clear the hash.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { signReviewerSession } from "./reviewerPin";
import { STAFF_REVIEWER_EMAILS } from "./staffReviewRoster";

const prismaMock = vi.hoisted(() => ({
  catalogAccessToken: { findUnique: vi.fn() },
  mycoEmployee: { findMany: vi.fn() },
}));

// Strict view (KEWL-2467): the code under test sees a Proxy that throws by name on
// any un-stubbed prisma access, so a signature change the mock has not kept up with
// fails as "not stubbed" instead of as a downstream undefined/500.
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock(prismaMock) };
});

const SECRET = "test-secret-for-reviewer-sessions";
const TOKEN_ID = "token-row-1";
const PARTNER_ID = "partner-1";
const CLAY = "employee-clay";
const AUDREY = "employee-audrey";

const HOUR = 60 * 60 * 1000;
/** Sessions are minted at sign-in; PINs were set at or before that moment. */
const PIN_SET_AT = new Date(Date.now() - 2 * HOUR);

function linkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TOKEN_ID,
    purpose: "staff_review",
    status: "active",
    partnerId: PARTNER_ID,
    expiresAt: null,
    revokedAt: null,
    brandId: null,
    issuedToId: null,
    enrollmentOpen: false,
    enrollmentClosesAt: null,
    ...overrides,
  };
}

function reviewerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CLAY,
    name: "Clay",
    email: "clay@themushroomtop.internal",
    pinHash: "scrypt$...",
    pinSetAt: PIN_SET_AT,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    ...overrides,
  };
}

function cookieFor(employeeId: string, issuedAt = Date.now() - HOUR, tokenId = TOKEN_ID) {
  return signReviewerSession({ employeeId, tokenId, issuedAt, secret: SECRET });
}

describe("requireReviewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = SECRET;
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow());
    prismaMock.mycoEmployee.findMany.mockResolvedValue([
      reviewerRow(),
      reviewerRow({ id: AUDREY, name: "Audrey", email: "audrey@themushroomtop.internal" }),
    ]);
  });

  it("admits a roster reviewer holding a session minted after their PIN was set", async () => {
    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer("raw-token", cookieFor(CLAY));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.employeeId).toBe(CLAY);
      expect(result.employeeName).toBe("Clay");
      expect(result.partnerId).toBe(PARTNER_ID);
    }
  });

  it("rejects a session for someone who is not on this link's roster", async () => {
    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer("raw-token", cookieFor("employee-someone-else"));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("rejects a missing session", async () => {
    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer("raw-token", undefined);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("rejects a session forged against a different link", async () => {
    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer("raw-token", cookieFor(CLAY, Date.now(), "other-token"));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  describe("an admin PIN reset revokes the device", () => {
    it("retires a session once the PIN has been cleared", async () => {
      prismaMock.mycoEmployee.findMany.mockResolvedValue([
        reviewerRow({ pinHash: null, pinSetAt: null }),
      ]);

      const { requireReviewer } = await import("./staffReviewAuth");
      const result = await requireReviewer("raw-token", cookieFor(CLAY));

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(401);
    });

    it("retires a session signed before the PIN currently on file", async () => {
      // Reset then re-enrolled: the old device's cookie predates the new PIN.
      prismaMock.mycoEmployee.findMany.mockResolvedValue([
        reviewerRow({ pinSetAt: new Date(Date.now() - 1000) }),
      ]);

      const { requireReviewer } = await import("./staffReviewAuth");
      const result = await requireReviewer("raw-token", cookieFor(CLAY, Date.now() - HOUR));

      expect(result.ok).toBe(false);
    });
  });

  it("rejects a revoked link before looking at the session at all", async () => {
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(
      linkRow({ status: "revoked", revokedAt: new Date() })
    );

    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer("raw-token", cookieFor(CLAY));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(410);
    expect(prismaMock.mycoEmployee.findMany).not.toHaveBeenCalled();
  });

  it("scopes the roster to the link's partner, to active opted-in reviewers, AND to the approved allowlist", async () => {
    const { requireReviewer } = await import("./staffReviewAuth");
    await requireReviewer("raw-token", cookieFor(CLAY));

    // The email predicate is the KEWL-2402 constraint: under one shared unbound token this
    // query IS the authorization boundary, so it must not widen with the employee table.
    expect(prismaMock.mycoEmployee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          partnerId: PARTNER_ID,
          active: true,
          optedOut: false,
          email: { in: [...STAFF_REVIEWER_EMAILS] },
        },
      })
    );
  });

  it("does not admit an active employee who is not on the approved roster", async () => {
    // The regression KEWL-2402 exists to prevent: an employee import adds an active row,
    // and it becomes a claimable identity on a link that is already in circulation.
    const outsider = "employee-warehouse-temp";
    prismaMock.mycoEmployee.findMany.mockResolvedValue([]);

    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer("raw-token", cookieFor(outsider));

    expect(result.ok).toBe(false);
    const where = prismaMock.mycoEmployee.findMany.mock.calls[0][0].where;
    expect(where.email).toEqual({ in: [...STAFF_REVIEWER_EMAILS] });
    expect(STAFF_REVIEWER_EMAILS).toHaveLength(6);
  });

  it("narrows a legacy per-reviewer link to its bound reviewer", async () => {
    // Honouring `issuedToId` can only restrict a link, never widen one — a link issued
    // before the override must not silently gain the rest of the roster.
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow({ issuedToId: AUDREY }));

    const { requireReviewer } = await import("./staffReviewAuth");
    await requireReviewer("raw-token", cookieFor(AUDREY));

    expect(prismaMock.mycoEmployee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: AUDREY,
          partnerId: PARTNER_ID,
          active: true,
          optedOut: false,
          email: { in: [...STAFF_REVIEWER_EMAILS] },
        },
      })
    );
  });

  it("fails closed when the roster is empty", async () => {
    prismaMock.mycoEmployee.findMany.mockResolvedValue([]);

    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer("raw-token", cookieFor(CLAY));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(410);
  });
});
