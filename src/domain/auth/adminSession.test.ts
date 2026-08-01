import { beforeEach, describe, expect, it, vi } from "vitest";
import { createViewAsCookie, VIEW_AS_COOKIE } from "./viewAs";

const getServerSessionMock = vi.hoisted(() => vi.fn());
const getUserRoleMock = vi.hoisted(() => vi.fn());
const cookieGetMock = vi.hoisted(() => vi.fn());
const findUserMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: cookieGetMock })),
}));
vi.mock("@/domain/auth/config", () => ({ authOptions: {} }));
vi.mock("@/domain/auth/role", () => ({ getUserRole: getUserRoleMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: findUserMock } },
}));

import { getAdminSession } from "./adminSession";

const SECRET = "test-secret-with-enough-entropy";
const actualSession = {
  user: { email: "owner@example.com", name: "Owner", image: "owner.png" },
  expires: "2099-01-01T00:00:00.000Z",
};

describe("getAdminSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = SECRET;
    getServerSessionMock.mockResolvedValue(actualSession);
  });

  it("never honors the override for a non-super-admin session", async () => {
    getUserRoleMock.mockResolvedValue("partner_admin");
    cookieGetMock.mockReturnValue({ name: VIEW_AS_COOKIE, value: "attacker.value" });

    const session = await getAdminSession();

    expect(session?.user?.email).toBe("owner@example.com");
    expect(session?.viewAs).toBeNull();
    expect(findUserMock).not.toHaveBeenCalled();
  });

  it("uses a signed, current partner-admin target for a real super admin", async () => {
    const cookie = await createViewAsCookie("target-id", SECRET);
    cookieGetMock.mockReturnValue({ name: VIEW_AS_COOKIE, value: cookie });
    getUserRoleMock.mockImplementation(async (email: string) =>
      email === "owner@example.com" ? "super_admin" : "partner_admin"
    );
    findUserMock.mockResolvedValue({
      id: "target-id",
      email: "partner@example.com",
      name: "Partner Person",
      image: null,
      partner: { name: "The Other Path" },
    });

    const session = await getAdminSession();

    expect(session?.actualUser).toEqual({
      email: "owner@example.com",
      role: "super_admin",
    });
    expect(session?.user?.email).toBe("partner@example.com");
    expect(session?.viewAs).toMatchObject({
      id: "target-id",
      role: "partner_admin",
      partnerName: "The Other Path",
    });
  });

  it("stops honoring a target that has become a super admin", async () => {
    const cookie = await createViewAsCookie("target-id", SECRET);
    cookieGetMock.mockReturnValue({ name: VIEW_AS_COOKIE, value: cookie });
    getUserRoleMock.mockResolvedValue("super_admin");
    findUserMock.mockResolvedValue({
      id: "target-id",
      email: "promoted@example.com",
      name: "Promoted",
      image: null,
      partner: null,
    });

    const session = await getAdminSession();

    expect(session?.user?.email).toBe("owner@example.com");
    expect(session?.viewAs).toBeNull();
  });
});
