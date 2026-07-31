import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}));
const cookiesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock(prismaMock) };
});
vi.mock("next/headers", () => ({ cookies: cookiesMock }));

import {
  ADMIN_VIEW_AS_COOKIE,
  listAdminViewAsUsers,
  resolveAdminIdentity,
} from "./viewAs";

const SUPER_EMAIL = "jon@example.com";
const PARTNER_EMAIL = "adrienne@theotherpathcbd.com";

function requestWithViewAs(userId: string) {
  return new NextRequest("http://localhost:3000/admin", {
    headers: { cookie: `${ADMIN_VIEW_AS_COOKIE}=${userId}` },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPER_ADMIN_EMAILS = SUPER_EMAIL;
  cookiesMock.mockResolvedValue({ get: vi.fn() });
});

describe("resolveAdminIdentity", () => {
  it("ignores a forged View-as cookie for non-super-admin sessions", async () => {
    const identity = await resolveAdminIdentity(
      "partner@example.com",
      requestWithViewAs("user-target")
    );

    expect(identity.isViewAsActive).toBe(false);
    expect(identity.actualRole).toBe("partner_admin");
    expect(identity.effectiveEmail).toBe("partner@example.com");
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("resolves role and partner from the impersonated user for a real super admin", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-target",
      name: "Adrienne",
      email: PARTNER_EMAIL,
      partnerId: "partner-1",
      partner: { name: "The Other Path" },
    });

    const identity = await resolveAdminIdentity(
      SUPER_EMAIL,
      requestWithViewAs("user-target")
    );

    expect(identity).toMatchObject({
      actualEmail: SUPER_EMAIL,
      actualRole: "super_admin",
      effectiveEmail: PARTNER_EMAIL,
      effectiveRole: "partner_admin",
      effectiveUserId: "user-target",
      effectivePartnerId: "partner-1",
      effectivePartnerName: "The Other Path",
      isViewAsActive: true,
    });
  });
});

describe("listAdminViewAsUsers", () => {
  it("returns users with resolved roles and partner names", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: "super",
        name: "Jon",
        email: SUPER_EMAIL,
        partnerId: null,
        partner: null,
      },
      {
        id: "partner",
        name: "Adrienne",
        email: PARTNER_EMAIL,
        partnerId: "partner-1",
        partner: { name: "The Other Path" },
      },
    ]);

    await expect(listAdminViewAsUsers()).resolves.toEqual([
      {
        id: "super",
        name: "Jon",
        email: SUPER_EMAIL,
        role: "super_admin",
        partnerId: null,
        partnerName: null,
      },
      {
        id: "partner",
        name: "Adrienne",
        email: PARTNER_EMAIL,
        role: "partner_admin",
        partnerId: "partner-1",
        partnerName: "The Other Path",
      },
    ]);
  });
});

