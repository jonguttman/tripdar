import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/domain/myco/publicWriteRateLimit", () => ({
  checkPublicWriteRateLimit: vi.fn(),
}));

import { middleware } from "./middleware";

const ADMIN_VIEW_AS_COOKIE = "tripdar_admin_view_as_user_id";

function adminRequest(path: string, method: string, cookie?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: cookie ? { cookie } : undefined,
  });
}

describe("admin View-as write lock middleware", () => {
  it("refuses a real admin write while View-as is active", async () => {
    const response = await middleware(
      adminRequest("/api/admin/myco", "POST", `${ADMIN_VIEW_AS_COOKIE}=user-target`)
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("VIEW_AS_READ_ONLY");
    expect(payload.error.message).toContain("read-only");
  });

  it("allows admin reads while View-as is active", async () => {
    const response = await middleware(
      adminRequest("/api/admin/myco", "GET", `${ADMIN_VIEW_AS_COOKIE}=user-target`)
    );

    expect(response.status).toBe(200);
  });

  it("allows entering View-as before the View-as cookie exists", async () => {
    const response = await middleware(adminRequest("/api/admin/view-as", "POST"));

    expect(response.status).toBe(200);
  });
});
