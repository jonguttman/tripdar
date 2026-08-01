import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  partner: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  brand: {
    findMany: vi.fn(),
  },
  storeProductCatalog: {
    findMany: vi.fn(),
  },
}));
const getAdminSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock(prismaMock) };
});
vi.mock("@/domain/auth/adminSession", () => ({ getAdminSession: getAdminSessionMock }));
vi.mock("@/domain/strain/blob-store", () => ({ loadStrainData: vi.fn() }));

import { GET } from "./route";

const SUPER_EMAIL = "jon@example.com";
const TARGET_EMAIL = "throwaway-view-as@test.tripdar";
const DEFAULT_PARTNER = {
  id: "partner-default",
  name: "Default Partner",
  subdomain: "default",
  contactInfo: null,
  mycoWelcomeMessage: null,
  active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPER_ADMIN_EMAILS = SUPER_EMAIL;
  getAdminSessionMock.mockResolvedValue({
    user: { email: TARGET_EMAIL },
    viewAs: {
      id: "view-as-user",
      name: "Throwaway View-as",
      email: TARGET_EMAIL,
      role: "partner_admin",
      partnerName: null,
    },
  });
  prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { id?: string; email?: string } }) => {
    if (where.id === "view-as-user" || where.email === TARGET_EMAIL) {
      return {
        id: "view-as-user",
        name: "Throwaway View-as",
        email: TARGET_EMAIL,
        partnerId: null,
        partner: null,
      };
    }
    return null;
  });
  prismaMock.partner.findFirst.mockResolvedValue(DEFAULT_PARTNER);
  prismaMock.partner.findMany.mockResolvedValue([DEFAULT_PARTNER]);
  prismaMock.partner.findUnique.mockResolvedValue(DEFAULT_PARTNER);
  prismaMock.brand.findMany.mockResolvedValue([]);
  prismaMock.storeProductCatalog.findMany.mockResolvedValue([]);
});

describe("GET /api/admin/myco View-as partner fallback", () => {
  it("does not auto-assign partnerId to the impersonated user", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/myco");

    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.userRole).toBe("partner_admin");
    expect(payload.data.partner.id).toBe(DEFAULT_PARTNER.id);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
