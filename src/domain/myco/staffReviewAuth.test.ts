/**
 * KEWL-2394 — `requireReviewer` is the gate in front of every staff-review read and
 * write.
 *
 * On a shared link the session cookie is the ONLY thing that says who the reviewer is,
 * so this gate carries more weight than it did under the per-reviewer model. It must
 * refuse a session whose reviewer has since left the roster, whose PIN has been cleared,
 * or that predates an admin PIN reset — that last one is what makes a reset sign a device
 * out rather than merely change the next prompt.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { signReviewerSession } from "./reviewerPin";

const prismaMock = vi.hoisted(() => ({
  catalogAccessToken: { findUnique: vi.fn() },
  mycoEmployee: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const SECRET = "test-secret-for-reviewer-sessions";
const TOKEN_ID = "token-row-1";
const PARTNER_ID = "partner-1";
const ADRIENNE = "employee-adrienne";
const AUDREY = "employee-audrey";

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
    enrollmentClosesAt: null,
    enrollmentClosedAt: new Date(),
    ...overrides,
  };
}

function reviewerRow(id: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name,
    pinHash: "scrypt$already-enrolled",
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    pinSessionsRevokedAt: null,
    ...overrides,
  };
}

function cookieFor(employeeId: string, issuedAt = Date.now(), tokenId = TOKEN_ID) {
  return signReviewerSession({ employeeId, tokenId, issuedAt, secret: SECRET });
}

describe("requireReviewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = SECRET;
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow());
    prismaMock.mycoEmployee.findMany.mockResolvedValue([
      reviewerRow(ADRIENNE, "Adrienne"),
      reviewerRow(AUDREY, "Audrey"),
    ]);
  });

  it("admits an enrolled reviewer holding a matching session", async () => {
    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer("raw-token", cookieFor(ADRIENNE));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.employeeId).toBe(ADRIENNE);
      expect(result.employeeName).toBe("Adrienne");
      expect(result.partnerId).toBe(PARTNER_ID);
    }
  });

  it("resolves identity from the session, so two reviewers on one link stay distinct", async () => {
    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer("raw-token", cookieFor(AUDREY));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.employeeId).toBe(AUDREY);
  });

  it("rejects a session for someone no longer on the roster", async () => {
    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer("raw-token", cookieFor("employee-departed"));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("rejects a session minted before an admin PIN reset", async () => {
    const resetAt = new Date();
    prismaMock.mycoEmployee.findMany.mockResolvedValue([
      reviewerRow(ADRIENNE, "Adrienne", { pinSessionsRevokedAt: resetAt }),
    ]);

    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer("raw-token", cookieFor(ADRIENNE, resetAt.getTime() - 1000));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("admits a session minted after that reset", async () => {
    const resetAt = new Date();
    prismaMock.mycoEmployee.findMany.mockResolvedValue([
      reviewerRow(ADRIENNE, "Adrienne", { pinSessionsRevokedAt: resetAt }),
    ]);

    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer("raw-token", cookieFor(ADRIENNE, resetAt.getTime() + 1000));

    expect(result.ok).toBe(true);
  });

  it("rejects a session for a reviewer whose PIN has been cleared", async () => {
    // Un-enrolled again: an old cookie must not carry them past the enrollment gate.
    prismaMock.mycoEmployee.findMany.mockResolvedValue([
      reviewerRow(ADRIENNE, "Adrienne", { pinHash: null }),
    ]);

    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer("raw-token", cookieFor(ADRIENNE));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("rejects a missing session", async () => {
    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer("raw-token", undefined);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("rejects a session minted on a different link", async () => {
    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer(
      "raw-token",
      cookieFor(ADRIENNE, Date.now(), "another-token")
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("rejects a revoked link before looking at the session at all", async () => {
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(
      linkRow({ status: "revoked", revokedAt: new Date() })
    );

    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer("raw-token", cookieFor(ADRIENNE));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(410);
    expect(prismaMock.mycoEmployee.findMany).not.toHaveBeenCalled();
  });

  it("rejects a link with nobody on its roster", async () => {
    prismaMock.mycoEmployee.findMany.mockResolvedValue([]);

    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer("raw-token", cookieFor(ADRIENNE));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(410);
  });

  it("scopes the roster to the link's partner and to active, opted-in reviewers", async () => {
    const { requireReviewer } = await import("./staffReviewAuth");
    await requireReviewer("raw-token", cookieFor(ADRIENNE));

    expect(prismaMock.mycoEmployee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          partnerId: PARTNER_ID,
          active: true,
          optedOut: false,
        }),
      })
    );
  });

  it("narrows the roster to the bound reviewer on a legacy per-reviewer link", async () => {
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow({ issuedToId: ADRIENNE }));
    prismaMock.mycoEmployee.findMany.mockResolvedValue([reviewerRow(ADRIENNE, "Adrienne")]);

    const { requireReviewer } = await import("./staffReviewAuth");
    await requireReviewer("raw-token", cookieFor(ADRIENNE));

    expect(prismaMock.mycoEmployee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: ADRIENNE }) })
    );
  });
});
