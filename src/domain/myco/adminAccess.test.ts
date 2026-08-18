import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserRoleMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  partner: { findUnique: vi.fn() },
  storeProductCatalog: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}));

vi.mock("@/domain/auth/role", () => ({
  getUserRole: getUserRoleMock,
}));
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock(prismaMock) };
});

import { resolvePartnerMutationForAdmin } from "./adminAccess";

describe("resolvePartnerMutationForAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserRoleMock.mockResolvedValue("partner_admin");
    prismaMock.partner.findUnique.mockResolvedValue({ id: "partner_tmt" });
    prismaMock.user.findUnique.mockResolvedValue({ partnerId: "partner_tmt" });
  });

  it("lets super admins mutate any existing partner", async () => {
    getUserRoleMock.mockResolvedValue("super_admin");
    prismaMock.partner.findUnique.mockResolvedValue({ id: "partner_other" });

    await expect(resolvePartnerMutationForAdmin("jon@example.com", "partner_other")).resolves.toEqual({
      ok: true,
      partnerId: "partner_other",
    });
    expect(prismaMock.partner.findUnique).toHaveBeenCalledWith({
      where: { id: "partner_other" },
      select: { id: true },
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("lets partner admins mutate only their persisted partner", async () => {
    await expect(resolvePartnerMutationForAdmin("audrey@example.com", "partner_tmt")).resolves.toEqual({
      ok: true,
      partnerId: "partner_tmt",
    });

    expect(getUserRoleMock).toHaveBeenCalledWith("audrey@example.com");
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: "audrey@example.com" },
      select: { partnerId: true },
    });
  });

  it("refuses arbitrary partnerId for partner admins without confirming existence", async () => {
    await expect(resolvePartnerMutationForAdmin("audrey@example.com", "partner_other")).resolves.toEqual({
      ok: false,
      status: 404,
      message: "Partner not found",
    });

    expect(prismaMock.partner.findUnique).not.toHaveBeenCalled();
  });
});
