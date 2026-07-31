import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/domain/myco/publicWriteRateLimit", () => ({
  checkPublicWriteRateLimit: vi.fn(),
}));

import { middleware } from "./middleware";
import { createViewAsCookie, VIEW_AS_COOKIE } from "@/domain/auth/viewAs";

const SECRET = "test-secret-with-enough-entropy";

function adminRequest(path: string, method: string, cookie?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: cookie ? { cookie } : undefined,
  });
}

describe("admin View-as write lock middleware", () => {
  it("refuses a real admin write while View-as is active", async () => {
    process.env.NEXTAUTH_SECRET = SECRET;
    const cookie = await createViewAsCookie("user-target", SECRET);
    const response = await middleware(
      adminRequest("/api/admin/myco", "POST", `${VIEW_AS_COOKIE}=${cookie}`)
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("VIEW_AS_READ_ONLY");
    expect(payload.error.message).toContain("read-only");
  });

  it("allows admin reads while View-as is active", async () => {
    process.env.NEXTAUTH_SECRET = SECRET;
    const cookie = await createViewAsCookie("user-target", SECRET);
    const response = await middleware(
      adminRequest("/api/admin/myco", "GET", `${VIEW_AS_COOKIE}=${cookie}`)
    );

    expect(response.status).toBe(200);
  });

  it("does not treat a forged cookie as active View-as state", async () => {
    process.env.NEXTAUTH_SECRET = SECRET;
    const response = await middleware(
      adminRequest("/api/admin/myco", "POST", `${VIEW_AS_COOKIE}=user-target.forged`)
    );

    expect(response.status).toBe(200);
  });
});
