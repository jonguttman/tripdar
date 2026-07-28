/**
 * KEWL-2393 — shared-link roster enrollment.
 *
 * The employee id is intentionally selected by the visitor from the shared roster.
 * The security boundary is the compare-and-set PIN write plus an HMAC session bound
 * to both the shared link and the selected employee.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  hashPin,
  MAX_PIN_ATTEMPTS,
  verifyPin,
  verifyReviewerSession,
} from "@/domain/myco/reviewerPin";
import { REVIEWER_SESSION_COOKIE } from "@/domain/myco/staffReviewAuth";
import { STAFF_REVIEWER_EMAILS } from "@/domain/myco/staffReviewRoster";

const prismaMock = vi.hoisted(() => ({
  catalogAccessToken: { findUnique: vi.fn() },
  mycoEmployee: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const SECRET = "test-secret-for-reviewer-sessions";
const TOKEN_ID = "shared-token-row";
const PARTNER_ID = "partner-tmt";
const CLAY = "employee-clay";
const ADRIENNE = "employee-adrienne";

function linkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TOKEN_ID,
    purpose: "staff_review",
    status: "active",
    partnerId: PARTNER_ID,
    expiresAt: null,
    revokedAt: null,
    brandId: null,
    issuedToId: null,
    ...overrides,
  };
}

function employeeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CLAY,
    name: "Clay",
    pinHash: null,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    ...overrides,
  };
}

async function post(body: Record<string, unknown>, cookie?: string) {
  const { POST } = await import("./route");
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie) headers.set("cookie", `${REVIEWER_SESSION_COOKIE}=${cookie}`);
  const request = new NextRequest("https://tripdar.test/api/myco/staff-review/shared/session", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ token: "shared" }) });
}

describe("shared staff-link enrollment (KEWL-2393)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = SECRET;
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow());
    prismaMock.mycoEmployee.findFirst.mockResolvedValue(employeeRow());
    prismaMock.mycoEmployee.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.mycoEmployee.update.mockResolvedValue({});
  });

  it("uses the roster-selected employeeId and compare-and-sets their first PIN", async () => {
    const response = await post({ employeeId: CLAY, pin: "8317" });

    expect(response.status).toBe(200);
    expect(prismaMock.mycoEmployee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: CLAY,
          partnerId: PARTNER_ID,
          active: true,
          optedOut: false,
          email: { in: [...STAFF_REVIEWER_EMAILS] },
        },
      })
    );
    expect(prismaMock.mycoEmployee.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: CLAY,
          partnerId: PARTNER_ID,
          active: true,
          optedOut: false,
          email: { in: [...STAFF_REVIEWER_EMAILS] },
          pinHash: null,
        }),
      })
    );

    const body = await response.json();
    expect(body.data).toMatchObject({ employeeId: CLAY, employeeName: "Clay", firstUse: true });
  });

  it("loses a first-use race without overwriting the winning PIN or minting a session", async () => {
    prismaMock.mycoEmployee.updateMany.mockResolvedValue({ count: 0 });

    const response = await post({ employeeId: CLAY, pin: "9042" });

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("pin_already_set");
    expect(response.cookies.get(REVIEWER_SESSION_COOKIE)?.value).toBeFalsy();
    expect(prismaMock.mycoEmployee.update).not.toHaveBeenCalled();
  });

  it("mints an HMAC session for the selected reviewer and shared link", async () => {
    const response = await post({ employeeId: CLAY, pin: "8317" });
    const cookie = response.cookies.get(REVIEWER_SESSION_COOKIE)?.value;

    expect(verifyReviewerSession(cookie, { tokenId: TOKEN_ID, secret: SECRET })).toEqual({
      ok: true,
      employeeId: CLAY,
    });
    expect(verifyReviewerSession(cookie, { tokenId: "another-link", secret: SECRET })).toEqual({
      ok: false,
    });
  });

  it("rejects a hand-edited employee identity because the HMAC covers employeeId", async () => {
    const response = await post({ employeeId: CLAY, pin: "8317" });
    const cookie = response.cookies.get(REVIEWER_SESSION_COOKIE)!.value;
    const forged = [ADRIENNE, ...cookie.split(".").slice(1)].join(".");

    expect(verifyReviewerSession(forged, { tokenId: TOKEN_ID, secret: SECRET })).toEqual({
      ok: false,
    });
  });

  it("cannot swap reviewer identity while the current link session is bound", async () => {
    const firstResponse = await post({ employeeId: CLAY, pin: "8317" });
    const cookie = firstResponse.cookies.get(REVIEWER_SESSION_COOKIE)!.value;

    const swapResponse = await post(
      { employeeId: ADRIENNE, pin: "5729" },
      cookie
    );

    expect(swapResponse.status).toBe(409);
    expect((await swapResponse.json()).error.code).toBe("identity_bound");
    expect(prismaMock.mycoEmployee.findFirst).toHaveBeenCalledTimes(1);
  });

  it("cannot overwrite a PIN that is already set", async () => {
    const stored = await hashPin("8317");
    prismaMock.mycoEmployee.findFirst.mockResolvedValue(employeeRow({ pinHash: stored }));

    const response = await post({ employeeId: CLAY, pin: "9042" });

    expect(response.status).toBe(401);
    expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
    const patch = prismaMock.mycoEmployee.update.mock.calls[0][0].data;
    expect(patch.pinHash).toBeUndefined();
    expect(patch.pinFailedAttempts).toBe(1);
    expect(await verifyPin("8317", stored)).toBe(true);
  });

  it("accepts the established PIN and resets failed attempts", async () => {
    const stored = await hashPin("8317");
    prismaMock.mycoEmployee.findFirst.mockResolvedValue(
      employeeRow({ pinHash: stored, pinFailedAttempts: 3 })
    );

    const response = await post({ employeeId: CLAY, pin: "8317" });

    expect(response.status).toBe(200);
    expect(prismaMock.mycoEmployee.update.mock.calls[0][0].data).toMatchObject({
      pinFailedAttempts: 0,
      pinLockedUntil: null,
    });
  });

  it("locks the selected reviewer on the final failed attempt", async () => {
    const stored = await hashPin("8317");
    prismaMock.mycoEmployee.findFirst.mockResolvedValue(
      employeeRow({ pinHash: stored, pinFailedAttempts: MAX_PIN_ATTEMPTS - 1 })
    );

    const response = await post({ employeeId: CLAY, pin: "9042" });

    expect(response.status).toBe(429);
    expect(prismaMock.mycoEmployee.update.mock.calls[0][0].data.pinLockedUntil).toBeInstanceOf(Date);
  });

  it("rejects a seventh active partner employee outside the fixed six-person roster", async () => {
    prismaMock.mycoEmployee.findFirst.mockResolvedValue(null);

    const response = await post({ employeeId: "employee-seventh-active", pin: "8317" });

    expect(response.status).toBe(404);
    expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.mycoEmployee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "employee-seventh-active",
          email: { in: [...STAFF_REVIEWER_EMAILS] },
        }),
      })
    );
  });
});
