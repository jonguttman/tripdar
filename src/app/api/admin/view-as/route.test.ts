import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn() },
}));
const getServerSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock(prismaMock) };
});
vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@/domain/auth/config", () => ({ authOptions: {} }));

import { ADMIN_VIEW_AS_COOKIE } from "@/domain/auth/viewAs";
import { POST } from "./route";

const SUPER_EMAIL = "jon@example.com";
const PARTNER_EMAIL = "adrienne@theotherpathcbd.com";

function postRequest(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost:3000/api/admin/view-as", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPER_ADMIN_EMAILS = SUPER_EMAIL;
});

describe("POST /api/admin/view-as", () => {
  it("refuses a non-super-admin even when they submit a user id", async () => {
    getServerSessionMock.mockResolvedValue({ user: { email: PARTNER_EMAIL } });

    const response = await POST(postRequest({ userId: "user-target" }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("VIEW_AS_FORBIDDEN");
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("sets an HttpOnly View-as cookie for a super-admin target selection", async () => {
    getServerSessionMock.mockResolvedValue({ user: { email: SUPER_EMAIL } });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-target",
      name: "Adrienne",
      email: PARTNER_EMAIL,
      partnerId: "partner-1",
      partner: { name: "The Other Path" },
    });

    const response = await POST(postRequest({ userId: "user-target" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.user.email).toBe(PARTNER_EMAIL);
    expect(response.headers.get("set-cookie")).toContain(
      `${ADMIN_VIEW_AS_COOKIE}=user-target`
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("refuses to switch targets with View-as already active", async () => {
    getServerSessionMock.mockResolvedValue({ user: { email: SUPER_EMAIL } });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "current-target",
      name: "Adrienne",
      email: PARTNER_EMAIL,
      partnerId: "partner-1",
      partner: { name: "The Other Path" },
    });

    const response = await POST(
      postRequest(
        { userId: "new-target" },
        `${ADMIN_VIEW_AS_COOKIE}=current-target`
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("VIEW_AS_READ_ONLY");
  });
});
