import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getUserRole: vi.fn(),
  ensureFieldRules: vi.fn(),
  userFindUnique: vi.fn(),
  partnerFindUnique: vi.fn(),
  tokenFindMany: vi.fn(),
  tokenFindUnique: vi.fn(),
  tokenUpdate: vi.fn(),
  tokenUpdateMany: vi.fn(),
  tokenCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/domain/auth/config", () => ({ authOptions: {} }));
vi.mock("@/domain/auth/role", () => ({ getUserRole: mocks.getUserRole }));
vi.mock("@/domain/myco/staffReviewService", () => ({
  ensureFieldRules: mocks.ensureFieldRules,
}));
vi.mock("@/domain/myco/catalogTokens", () => ({
  buildRevokedTokenPatch: (by: string, reason: string) => ({
    status: "revoked",
    revokedBy: by,
    revocationReason: reason,
  }),
  createCatalogAccessToken: () => "raw-shared-token",
  hashCatalogAccessToken: () => "hashed-shared-token",
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    partner: { findUnique: mocks.partnerFindUnique },
    catalogAccessToken: {
      findMany: mocks.tokenFindMany,
      findUnique: mocks.tokenFindUnique,
      update: mocks.tokenUpdate,
      updateMany: mocks.tokenUpdateMany,
      create: mocks.tokenCreate,
    },
    $transaction: mocks.transaction,
  },
}));

const PARTNER_A = "partner-a";
const PARTNER_B = "partner-b";

function request(method: "POST" | "DELETE", body: Record<string, unknown>) {
  return new Request("https://tripdar.test/api/admin/myco/staff-links", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("staff-link admin boundary (KEWL-2393)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: "admin@partner.test" } });
    mocks.getUserRole.mockResolvedValue("partner_admin");
    mocks.userFindUnique.mockResolvedValue({ partnerId: PARTNER_A });
    mocks.partnerFindUnique.mockResolvedValue({ id: PARTNER_A });
    mocks.ensureFieldRules.mockResolvedValue([]);
    mocks.tokenFindMany.mockResolvedValue([]);
    mocks.tokenUpdate.mockResolvedValue({});
    mocks.tokenUpdateMany.mockResolvedValue({ count: 1 });
    mocks.tokenCreate.mockResolvedValue({
      id: "new-link",
      issuedAt: new Date("2026-07-28T20:00:00Z"),
      expiresAt: null,
    });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        catalogAccessToken: {
          updateMany: mocks.tokenUpdateMany,
          create: mocks.tokenCreate,
        },
      })
    );
  });

  it("rejects an unauthenticated request", async () => {
    mocks.getServerSession.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.tokenFindMany).not.toHaveBeenCalled();
  });

  it("rejects a partner admin with no assigned partner", async () => {
    mocks.userFindUnique.mockResolvedValue({ partnerId: null });
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.tokenFindMany).not.toHaveBeenCalled();
  });

  it("scopes partner-admin listing to their assigned partner", async () => {
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.tokenFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ partnerId: PARTNER_A, purpose: "staff_review" }),
      })
    );
  });

  it("does not let a partner admin mint for another partner", async () => {
    const { POST } = await import("./route");

    const response = await POST(request("POST", { partnerId: PARTNER_B }) as never);

    expect(response.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rotates all prior partner staff links into one shared unbound link", async () => {
    const { POST } = await import("./route");

    const response = await POST(request("POST", { partnerId: PARTNER_A }) as never);

    expect(response.status).toBe(200);
    expect(mocks.tokenUpdateMany).toHaveBeenCalledWith({
      where: {
        purpose: "staff_review",
        partnerId: PARTNER_A,
        status: "active",
        catalogItemId: null,
      },
      data: expect.objectContaining({
        status: "revoked",
        revocationReason: "superseded by shared staff link",
      }),
    });
    expect(mocks.tokenCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purpose: "staff_review",
        partnerId: PARTNER_A,
        issuedToId: null,
        tokenHash: "hashed-shared-token",
      }),
      select: { id: true, issuedAt: true, expiresAt: true },
    });
  });

  it("hides another partner's link on revoke", async () => {
    mocks.tokenFindUnique.mockResolvedValue({
      id: "partner-b-link",
      partnerId: PARTNER_B,
      purpose: "staff_review",
    });
    const { DELETE } = await import("./route");

    const response = await DELETE(request("DELETE", { id: "partner-b-link" }) as never);

    expect(response.status).toBe(404);
    expect(mocks.tokenUpdate).not.toHaveBeenCalled();
  });

  it("allows a super admin to rotate another partner's link", async () => {
    mocks.getUserRole.mockResolvedValue("super_admin");
    mocks.userFindUnique.mockResolvedValue({ partnerId: null });
    mocks.partnerFindUnique.mockResolvedValue({ id: PARTNER_B });
    const { POST } = await import("./route");

    const response = await POST(request("POST", { partnerId: PARTNER_B }) as never);

    expect(response.status).toBe(200);
    expect(mocks.tokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ partnerId: PARTNER_B, issuedToId: null }),
      })
    );
  });
});
