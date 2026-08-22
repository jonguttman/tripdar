/**
 * KEWL-3795 — legacy shared-link PIN enrollment is closed.
 *
 * The staff-link route can still list and revoke existing legacy links, but manager/admin
 * attempts to mint another shared PIN-enrollment link must fail closed and point to email
 * invitations instead.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  partner: { findUnique: vi.fn() },
  mycoEmployee: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));

const getServerSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock(prismaMock) };
});

vi.mock("@/domain/auth/adminSession", () => ({ getAdminSession: getServerSessionMock }));

let POST: typeof import("./route").POST;

beforeEach(async () => {
  vi.clearAllMocks();
  getServerSessionMock.mockResolvedValue({ user: { email: "admin@x.internal" } });
  ({ POST } = await import("./route"));
});

describe("POST /api/admin/myco/staff-links", () => {
  it("refuses to mint another legacy shared PIN-enrollment link", async () => {
    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(410);
    expect(json).toEqual({
      success: false,
      error: {
        code: "legacy_pin_enrollment_closed",
        message:
          "Legacy PIN enrollment is closed. Use staff email invitations for reviewer re-entry.",
      },
    });
    expect(prismaMock.partner.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.mycoEmployee.findMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("still requires admin auth before returning the closed guidance", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(401);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
