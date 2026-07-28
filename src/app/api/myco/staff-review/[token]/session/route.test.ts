/**
 * KEWL-2364 — the reviewer identity-enrollment fix.
 *
 * Architecture Guardian blocked PR #28 because first-use PIN setup took `employeeId`
 * from the request body: any holder of the shared store link could enroll a PIN as any
 * reviewer who had not set one yet, and receive a 30-day session as that person.
 *
 * These tests pin the corrected contract: the reviewer is whoever the LINK was issued
 * to, `employeeId` in the body is inert, unbound links fail closed, and a PIN that is
 * already set can never be overwritten through this route.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { hashPin, verifyReviewerSession, MAX_PIN_ATTEMPTS } from "@/domain/myco/reviewerPin";
import { REVIEWER_SESSION_COOKIE } from "@/domain/myco/staffReviewAuth";

const prismaMock = vi.hoisted(() => ({
  catalogAccessToken: { findUnique: vi.fn() },
  mycoEmployee: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const SECRET = "test-secret-for-reviewer-sessions";
const TOKEN_ID = "token-row-1";
const PARTNER_ID = "partner-1";
const ADRIENNE = "employee-adrienne";
const COWORKER = "employee-coworker";

/** A staff link row as stored: bound to exactly one reviewer via `issuedToId`. */
function linkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TOKEN_ID,
    purpose: "staff_review",
    status: "active",
    partnerId: PARTNER_ID,
    expiresAt: null,
    revokedAt: null,
    brandId: null,
    issuedToId: ADRIENNE,
    ...overrides,
  };
}

function employeeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ADRIENNE,
    name: "Adrienne",
    pinHash: null,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    ...overrides,
  };
}

async function post(body: Record<string, unknown>) {
  const { POST } = await import("./route");
  const request = new Request("https://tripdar.test/api/myco/staff-review/raw-token/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(request as never, { params: Promise.resolve({ token: "raw-token" }) });
}

describe("staff review session — identity comes from the link (KEWL-2364)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = SECRET;
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow());
    prismaMock.mycoEmployee.findFirst.mockResolvedValue(employeeRow());
    prismaMock.mycoEmployee.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.mycoEmployee.update.mockResolvedValue({});
  });

  it("enrolls the reviewer the link is bound to, ignoring employeeId in the body", async () => {
    // The attack: hold Adrienne's link, claim to be a co-worker who has no PIN yet.
    const response = await post({ employeeId: COWORKER, pin: "8317" });
    expect(response.status).toBe(200);

    // Identity was resolved from the link, so the lookup targeted the bound reviewer...
    expect(prismaMock.mycoEmployee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: ADRIENNE }) })
    );
    // ...and the PIN was written for the bound reviewer, never the requested one.
    expect(prismaMock.mycoEmployee.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: ADRIENNE }) })
    );

    const body = await response.json();
    expect(body.data.employeeId).toBe(ADRIENNE);
    expect(body.data.employeeName).toBe("Adrienne");
  });

  it("mints a session for the bound reviewer, not the requested one", async () => {
    const response = await post({ employeeId: COWORKER, pin: "8317" });
    const cookie = response.cookies.get(REVIEWER_SESSION_COOKIE)?.value;

    const session = verifyReviewerSession(cookie, { tokenId: TOKEN_ID, secret: SECRET });
    expect(session).toEqual({ ok: true, employeeId: ADRIENNE });
  });

  it("fails closed on a link that is not bound to any reviewer", async () => {
    // A legacy shared store-wide link. It must stop working rather than fall back.
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow({ issuedToId: null }));

    const response = await post({ employeeId: ADRIENNE, pin: "8317" });

    expect(response.status).toBe(410);
    expect((await response.json()).error.code).toBe("link_not_bound");
    expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.mycoEmployee.update).not.toHaveBeenCalled();
  });

  it("rejects a link whose bound reviewer is inactive or opted out", async () => {
    prismaMock.mycoEmployee.findFirst.mockResolvedValue(null);

    const response = await post({ pin: "8317" });

    expect(response.status).toBe(410);
    expect((await response.json()).error.code).toBe("reviewer_inactive");
  });

  it("cannot overwrite a PIN that is already set", async () => {
    const stored = await hashPin("8317");
    prismaMock.mycoEmployee.findFirst.mockResolvedValue(employeeRow({ pinHash: stored }));

    // A different PIN must be treated as a failed verification, never as re-enrollment.
    const response = await post({ pin: "9042" });

    expect(response.status).toBe(401);
    expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
    const patch = prismaMock.mycoEmployee.update.mock.calls[0][0].data;
    expect(patch.pinHash).toBeUndefined();
    expect(patch.pinFailedAttempts).toBe(1);
  });

  it("loses the first-use race rather than clobbering a concurrently-set PIN", async () => {
    // Compare-and-set: another device enrolled between our read and our write.
    prismaMock.mycoEmployee.updateMany.mockResolvedValue({ count: 0 });

    const response = await post({ pin: "8317" });

    expect(response.status).toBe(401);
    expect(response.cookies.get(REVIEWER_SESSION_COOKIE)?.value).toBeFalsy();
  });

  it("accepts the correct PIN and resets the failure counter", async () => {
    const stored = await hashPin("8317");
    prismaMock.mycoEmployee.findFirst.mockResolvedValue(
      employeeRow({ pinHash: stored, pinFailedAttempts: 3 })
    );

    const response = await post({ pin: "8317" });

    expect(response.status).toBe(200);
    const patch = prismaMock.mycoEmployee.update.mock.calls[0][0].data;
    expect(patch.pinFailedAttempts).toBe(0);
    expect(patch.pinLockedUntil).toBeNull();
  });

  it("locks out on the final failed attempt", async () => {
    const stored = await hashPin("8317");
    prismaMock.mycoEmployee.findFirst.mockResolvedValue(
      employeeRow({ pinHash: stored, pinFailedAttempts: MAX_PIN_ATTEMPTS - 1 })
    );

    const response = await post({ pin: "9042" });

    expect(response.status).toBe(429);
    expect(prismaMock.mycoEmployee.update.mock.calls[0][0].data.pinLockedUntil).toBeInstanceOf(Date);
  });

  it("refuses to spend a scrypt verification while locked out", async () => {
    prismaMock.mycoEmployee.findFirst.mockResolvedValue(
      employeeRow({ pinHash: "irrelevant", pinLockedUntil: new Date(Date.now() + 60_000) })
    );

    const response = await post({ pin: "8317" });

    expect(response.status).toBe(429);
    expect(prismaMock.mycoEmployee.update).not.toHaveBeenCalled();
  });

  it("rejects a malformed PIN before touching the database", async () => {
    const response = await post({ pin: "12" });

    expect(response.status).toBe(400);
    expect(prismaMock.mycoEmployee.update).not.toHaveBeenCalled();
    expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an obvious PIN at enrollment", async () => {
    const response = await post({ pin: "1234" });

    expect(response.status).toBe(400);
    expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
  });
});

describe("reviewer session replay (KEWL-2364)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = SECRET;
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow());
    prismaMock.mycoEmployee.findFirst.mockResolvedValue(employeeRow());
    prismaMock.mycoEmployee.updateMany.mockResolvedValue({ count: 1 });
  });

  it("does not verify on a different staff link", async () => {
    const response = await post({ pin: "8317" });
    const cookie = response.cookies.get(REVIEWER_SESSION_COOKIE)?.value;

    // Same cookie presented against a token row from another link (or another partner).
    expect(verifyReviewerSession(cookie, { tokenId: "some-other-token", secret: SECRET })).toEqual({
      ok: false,
    });
  });

  it("does not verify under a different server secret", async () => {
    const response = await post({ pin: "8317" });
    const cookie = response.cookies.get(REVIEWER_SESSION_COOKIE)?.value;

    expect(verifyReviewerSession(cookie, { tokenId: TOKEN_ID, secret: "other-secret" })).toEqual({
      ok: false,
    });
  });

  it("does not accept a hand-edited employee id", async () => {
    const response = await post({ pin: "8317" });
    const cookie = response.cookies.get(REVIEWER_SESSION_COOKIE)!.value;

    // Swap the identity segment; the HMAC covers it, so the whole cookie is void.
    const forged = [COWORKER, ...cookie.split(".").slice(1)].join(".");
    expect(verifyReviewerSession(forged, { tokenId: TOKEN_ID, secret: SECRET })).toEqual({
      ok: false,
    });
  });
});
