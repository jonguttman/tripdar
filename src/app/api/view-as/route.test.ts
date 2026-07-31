import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSessionMock = vi.hoisted(() => vi.fn());
const getUserRoleMock = vi.hoisted(() => vi.fn());
const findUserMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@/domain/auth/config", () => ({ authOptions: {} }));
vi.mock("@/domain/auth/role", () => ({ getUserRole: getUserRoleMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: findUserMock } },
}));

import { POST } from "./route";

function request(userId = "target-id") {
  return new NextRequest("https://tripd.ar/api/view-as", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
}

describe("POST /api/view-as", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = "test-secret-with-enough-entropy";
    getServerSessionMock.mockResolvedValue({
      user: { email: "owner@example.com" },
    });
  });

  it("refuses a real session that is not a super admin", async () => {
    getUserRoleMock.mockResolvedValue("partner_admin");

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "View as is available only to super admins",
    });
    expect(findUserMock).not.toHaveBeenCalled();
  });

  it("sets an HttpOnly cookie only for a partner-admin target", async () => {
    getUserRoleMock.mockImplementation(async (email: string) =>
      email === "owner@example.com" ? "super_admin" : "partner_admin"
    );
    findUserMock.mockResolvedValue({
      id: "target-id",
      email: "partner@example.com",
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(
      /^tripdar_admin_view_as=target-id\.[^;]+;.*Path=\/;.*HttpOnly;.*SameSite=lax/i
    );
  });
});
