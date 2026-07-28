/**
 * KEWL-2364 — `requireReviewer` is the gate in front of every staff-review read and
 * write. It must agree with the link about who the reviewer is, so a session that was
 * valid for a link re-issued to someone else stops working.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { signReviewerSession } from "./reviewerPin";

const prismaMock = vi.hoisted(() => ({
  catalogAccessToken: { findUnique: vi.fn() },
  mycoEmployee: { findFirst: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const SECRET = "test-secret-for-reviewer-sessions";
const TOKEN_ID = "token-row-1";
const PARTNER_ID = "partner-1";
const ADRIENNE = "employee-adrienne";

function linkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TOKEN_ID,
    purpose: "staff_review",
    status: "active",
    partnerId: PARTNER_ID,
    expiresAt: null,
    revokedAt: null,
    brandId: null,
    issuedToId: ADRIENNE,
    ...overrides,
  };
}

function cookieFor(employeeId: string, tokenId = TOKEN_ID) {
  return signReviewerSession({ employeeId, tokenId, issuedAt: Date.now(), secret: SECRET });
}

describe("requireReviewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = SECRET;
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow());
    prismaMock.mycoEmployee.findFirst.mockResolvedValue({
      id: ADRIENNE,
      name: "Adrienne",
      pinHash: "scrypt$...",
      pinFailedAttempts: 0,
      pinLockedUntil: null,
    });
  });

  it("admits the bound reviewer holding a matching session", async () => {
    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer("raw-token", cookieFor(ADRIENNE));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.employeeId).toBe(ADRIENNE);
      expect(result.partnerId).toBe(PARTNER_ID);
    }
  });

  it("rejects a session whose identity no longer matches the link", async () => {
    // The link was re-issued to a different reviewer after this session was minted.
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

  it("rejects an unbound link before looking at the session at all", async () => {
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow({ issuedToId: null }));

    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer("raw-token", cookieFor(ADRIENNE));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(410);
    expect(prismaMock.mycoEmployee.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a revoked link", async () => {
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(
      linkRow({ status: "revoked", revokedAt: new Date() })
    );

    const { requireReviewer } = await import("./staffReviewAuth");
    const result = await requireReviewer("raw-token", cookieFor(ADRIENNE));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(410);
  });

  it("scopes the reviewer lookup to the link's partner", async () => {
    const { requireReviewer } = await import("./staffReviewAuth");
    await requireReviewer("raw-token", cookieFor(ADRIENNE));

    expect(prismaMock.mycoEmployee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: ADRIENNE,
          partnerId: PARTNER_ID,
          active: true,
          optedOut: false,
        }),
      })
    );
  });
});
