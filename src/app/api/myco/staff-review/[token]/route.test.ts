import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { STAFF_REVIEWER_EMAILS } from "@/domain/myco/staffReviewRoster";

const prismaMock = vi.hoisted(() => ({
  catalogAccessToken: { findUnique: vi.fn(), updateMany: vi.fn() },
  partner: { findUnique: vi.fn() },
  mycoEmployee: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const TOKEN_ID = "shared-token-row";
const PARTNER_ID = "partner-tmt";

describe("shared staff-link bootstrap roster (KEWL-2393)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = "test-secret-for-reviewer-sessions";
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
    prismaMock.catalogAccessToken.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.partner.findUnique.mockResolvedValue({ name: "The Mushroom Top" });
    prismaMock.mycoEmployee.findMany.mockResolvedValue(
      ["Adrienne", "Audrey", "Clay", "Dani", "Devon", "Eddie"].map((name) => ({
        id: `employee-${name.toLowerCase()}`,
        name,
        pinHash: null,
        pinLockedUntil: null,
      }))
    );
  });

  it("queries only the configured six reviewers even when other active employees exist", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("https://tripdar.test/api/myco/staff-review/shared"),
      { params: Promise.resolve({ token: "shared" }) }
    );

    expect(response.status).toBe(200);
    expect(prismaMock.mycoEmployee.findMany).toHaveBeenCalledWith({
      where: {
        partnerId: PARTNER_ID,
        active: true,
        optedOut: false,
        email: { in: [...STAFF_REVIEWER_EMAILS] },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, pinHash: true, pinLockedUntil: true },
    });
    const body = await response.json();
    expect(body.data.reviewers).toHaveLength(6);
  });
});
