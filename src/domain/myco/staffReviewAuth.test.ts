import { beforeEach, describe, expect, it, vi } from "vitest";
import { signReviewerSession } from "./reviewerPin";
import { requireReviewer } from "./staffReviewAuth";
import { STAFF_REVIEWER_EMAILS } from "./staffReviewRoster";

const prismaMock = vi.hoisted(() => ({
  catalogAccessToken: { findUnique: vi.fn() },
  mycoEmployee: { findFirst: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const SECRET = "test-secret-for-reviewer-sessions";
const TOKEN_ID = "shared-token-row";
const PARTNER_ID = "partner-tmt";
const CLAY = "employee-clay";

describe("staff-review session authorization (KEWL-2393)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = SECRET;
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue({
      id: TOKEN_ID,
      purpose: "staff_review",
      status: "active",
      partnerId: PARTNER_ID,
      expiresAt: null,
      revokedAt: null,
      brandId: null,
      issuedToId: null,
    });
  });

  it("revalidates an existing HMAC session against the fixed, active, non-opted-out roster", async () => {
    prismaMock.mycoEmployee.findFirst.mockResolvedValue(null);
    const cookie = signReviewerSession({
      employeeId: CLAY,
      tokenId: TOKEN_ID,
      issuedAt: Date.now(),
      secret: SECRET,
    });

    const result = await requireReviewer("shared", cookie);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(prismaMock.mycoEmployee.findFirst).toHaveBeenCalledWith({
      where: {
        id: CLAY,
        partnerId: PARTNER_ID,
        active: true,
        optedOut: false,
        email: { in: [...STAFF_REVIEWER_EMAILS] },
      },
      select: { id: true, name: true },
    });
  });
});
