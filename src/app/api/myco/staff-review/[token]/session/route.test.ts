/**
 * KEWL-2394 — sign-in on the shared staff link.
 *
 * Jon overrode the KEWL-2364 per-reviewer-link model on 2026-07-28: one link serves the
 * whole roster and everyone picks a PIN the first time they open it. That deliberately
 * puts `employeeId` back in the request body, so these tests pin the constraints that
 * replace link-binding as the bound on identity claims:
 *
 *  - the id must be on THIS link's roster;
 *  - an unclaimed name may only be claimed while the enrollment window is open, and
 *    fails closed with the reopen instruction once it is not;
 *  - claiming is a compare-and-set that exactly one racer can win;
 *  - an already-enrolled name always demands its PIN and can never be re-claimed;
 *  - every attempt, allowed or denied, appends to the enrollment ledger.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { hashPin, verifyReviewerSession, MAX_PIN_ATTEMPTS } from "@/domain/myco/reviewerPin";
import { REVIEWER_SESSION_COOKIE } from "@/domain/myco/staffReviewAuth";

const prismaMock = vi.hoisted(() => ({
  catalogAccessToken: { findUnique: vi.fn(), updateMany: vi.fn() },
  mycoEmployee: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  reviewerEnrollmentEvent: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const SECRET = "test-secret-for-reviewer-sessions";
const TOKEN_ID = "token-row-1";
const PARTNER_ID = "partner-1";
const ADRIENNE = "employee-adrienne";
const AUDREY = "employee-audrey";
const OUTSIDER = "employee-not-on-this-roster";

const HOUR = 60 * 60 * 1000;

/** A shared staff link: `issuedToId` null, enrollment open for another day. */
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
    enrollmentClosesAt: new Date(Date.now() + 24 * HOUR),
    enrollmentClosedAt: null,
    ...overrides,
  };
}

function reviewerRow(id: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name,
    pinHash: null,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    pinSessionsRevokedAt: null,
    ...overrides,
  };
}

function roster(...rows: ReturnType<typeof reviewerRow>[]) {
  prismaMock.mycoEmployee.findMany.mockResolvedValue(rows);
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

/** The ledger rows this request appended, in order. */
function ledgerEvents() {
  return prismaMock.reviewerEnrollmentEvent.create.mock.calls.map((call) => call[0].data);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = SECRET;
  prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow());
  prismaMock.catalogAccessToken.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.mycoEmployee.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.mycoEmployee.update.mockResolvedValue({});
  prismaMock.reviewerEnrollmentEvent.create.mockResolvedValue({});
  roster(reviewerRow(ADRIENNE, "Adrienne"), reviewerRow(AUDREY, "Audrey"));
});

describe("first-use enrollment on a shared link", () => {
  it("enrolls the reviewer the caller picked and mints their session", async () => {
    const response = await post({ employeeId: AUDREY, pin: "8317" });
    expect(response.status).toBe(200);

    // The PIN is written for the picked reviewer, under the compare-and-set guard.
    expect(prismaMock.mycoEmployee.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: AUDREY, pinHash: null } })
    );

    const body = await response.json();
    expect(body.data).toMatchObject({ employeeId: AUDREY, employeeName: "Audrey", firstUse: true });

    const cookie = response.cookies.get(REVIEWER_SESSION_COOKIE)?.value;
    const session = verifyReviewerSession(cookie, { tokenId: TOKEN_ID, secret: SECRET });
    expect(session.ok).toBe(true);
    if (session.ok) expect(session.employeeId).toBe(AUDREY);
  });

  it("records the enrollment on the append-only ledger", async () => {
    await post({ employeeId: AUDREY, pin: "8317" });

    expect(ledgerEvents()).toContainEqual(
      expect.objectContaining({
        event: "enrolled",
        outcome: "allowed",
        employeeId: AUDREY,
        employeeName: "Audrey",
        actorType: "reviewer",
        accessTokenId: TOKEN_ID,
      })
    );
  });

  it("refuses an employeeId that is not on this link's roster", async () => {
    const response = await post({ employeeId: OUTSIDER, pin: "8317" });

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("unknown_reviewer");
    expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
  });

  it("leaves every other reviewer on the link untouched", async () => {
    await post({ employeeId: AUDREY, pin: "8317" });

    const touched = prismaMock.mycoEmployee.updateMany.mock.calls.map((call) => call[0].where.id);
    expect(touched).toEqual([AUDREY]);
    expect(prismaMock.mycoEmployee.update).not.toHaveBeenCalled();
  });

  it("loses the first-use race rather than clobbering a concurrently-set PIN", async () => {
    prismaMock.mycoEmployee.updateMany.mockResolvedValue({ count: 0 });

    const response = await post({ employeeId: AUDREY, pin: "8317" });

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("already_enrolled");
    expect(response.cookies.get(REVIEWER_SESSION_COOKIE)?.value).toBeFalsy();
    expect(ledgerEvents()).toContainEqual(
      expect.objectContaining({ event: "enrollment_denied", outcome: "denied" })
    );
  });

  it("rejects an obvious PIN at enrollment", async () => {
    const response = await post({ employeeId: AUDREY, pin: "1234" });

    expect(response.status).toBe(400);
    expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a malformed PIN before touching the database", async () => {
    const response = await post({ employeeId: AUDREY, pin: "12" });

    expect(response.status).toBe(400);
    expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.mycoEmployee.update).not.toHaveBeenCalled();
  });

  it("closes the window once the last unclaimed name is taken", async () => {
    prismaMock.catalogAccessToken.updateMany.mockResolvedValue({ count: 1 });
    // The post-enrollment re-read sees the whole roster enrolled.
    prismaMock.mycoEmployee.findMany
      .mockResolvedValueOnce([
        reviewerRow(ADRIENNE, "Adrienne", { pinHash: "scrypt$set" }),
        reviewerRow(AUDREY, "Audrey"),
      ])
      .mockResolvedValueOnce([
        reviewerRow(ADRIENNE, "Adrienne", { pinHash: "scrypt$set" }),
        reviewerRow(AUDREY, "Audrey", { pinHash: "scrypt$set" }),
      ]);

    await post({ employeeId: AUDREY, pin: "8317" });

    expect(prismaMock.catalogAccessToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TOKEN_ID, enrollmentClosedAt: null } })
    );
    expect(ledgerEvents()).toContainEqual(
      expect.objectContaining({ event: "window_auto_closed", actorType: "system" })
    );
  });

  it("leaves the window open while anyone is still unclaimed", async () => {
    await post({ employeeId: AUDREY, pin: "8317" });

    expect(prismaMock.catalogAccessToken.updateMany).not.toHaveBeenCalled();
  });
});

describe("enrollment window fail-closed", () => {
  const CLOSED_MESSAGE = "Enrollment for this link has closed. Ask Jon to reopen enrollment.";

  it("refuses an unclaimed name after the window has expired", async () => {
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(
      linkRow({ enrollmentClosesAt: new Date(Date.now() - HOUR) })
    );

    const response = await post({ employeeId: AUDREY, pin: "8317" });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("enrollment_closed");
    expect(body.error.message).toBe(CLOSED_MESSAGE);
    expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
  });

  it("refuses an unclaimed name after the window was closed early", async () => {
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(
      linkRow({ enrollmentClosedAt: new Date(Date.now() - HOUR) })
    );

    const response = await post({ employeeId: AUDREY, pin: "8317" });

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("enrollment_closed");
  });

  it("refuses on a legacy link that never had a window", async () => {
    // A link minted before KEWL-2394 has both columns NULL. Defaulting that to OPEN would
    // silently turn every old link into a self-enrollment link.
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(
      linkRow({ enrollmentClosesAt: null, enrollmentClosedAt: null })
    );

    const response = await post({ employeeId: AUDREY, pin: "8317" });

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("enrollment_closed");
  });

  it("logs the refusal instead of failing silently", async () => {
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(
      linkRow({ enrollmentClosesAt: new Date(Date.now() - HOUR) })
    );

    await post({ employeeId: AUDREY, pin: "8317" });

    expect(ledgerEvents()).toContainEqual(
      expect.objectContaining({
        event: "enrollment_denied",
        outcome: "denied",
        employeeId: AUDREY,
        reason: CLOSED_MESSAGE,
      })
    );
  });

  it("still lets an ALREADY-ENROLLED reviewer sign in after the window shuts", async () => {
    // Closing enrollment must not lock out the people who did enroll in time.
    const stored = await hashPin("8317");
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(
      linkRow({ enrollmentClosedAt: new Date(Date.now() - HOUR) })
    );
    roster(reviewerRow(ADRIENNE, "Adrienne", { pinHash: stored }), reviewerRow(AUDREY, "Audrey"));

    const response = await post({ employeeId: ADRIENNE, pin: "8317" });

    expect(response.status).toBe(200);
    expect((await response.json()).data.firstUse).toBe(false);
  });
});

describe("an already-enrolled reviewer", () => {
  it("cannot be re-claimed with a different PIN", async () => {
    const stored = await hashPin("8317");
    roster(reviewerRow(AUDREY, "Audrey", { pinHash: stored }));

    const response = await post({ employeeId: AUDREY, pin: "9042" });

    expect(response.status).toBe(401);
    expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
    const patch = prismaMock.mycoEmployee.update.mock.calls[0][0].data;
    expect(patch.pinHash).toBeUndefined();
    expect(patch.pinFailedAttempts).toBe(1);
    expect(ledgerEvents()).toContainEqual(
      expect.objectContaining({ event: "pin_failed", outcome: "denied" })
    );
  });

  it("signs in with the correct PIN and clears the failure counter", async () => {
    const stored = await hashPin("8317");
    roster(reviewerRow(AUDREY, "Audrey", { pinHash: stored, pinFailedAttempts: 3 }));

    const response = await post({ employeeId: AUDREY, pin: "8317" });

    expect(response.status).toBe(200);
    const patch = prismaMock.mycoEmployee.update.mock.calls[0][0].data;
    expect(patch.pinFailedAttempts).toBe(0);
    expect(patch.pinLockedUntil).toBeNull();
    expect(ledgerEvents()).toContainEqual(
      expect.objectContaining({ event: "pin_verified", outcome: "allowed" })
    );
  });

  it("locks out on the final failed attempt", async () => {
    const stored = await hashPin("8317");
    roster(reviewerRow(AUDREY, "Audrey", { pinHash: stored, pinFailedAttempts: MAX_PIN_ATTEMPTS - 1 }));

    const response = await post({ employeeId: AUDREY, pin: "9042" });

    expect(response.status).toBe(429);
    expect(prismaMock.mycoEmployee.update.mock.calls[0][0].data.pinLockedUntil).toBeInstanceOf(Date);
  });

  it("refuses to spend a scrypt verification while locked out", async () => {
    roster(
      reviewerRow(AUDREY, "Audrey", {
        pinHash: "irrelevant",
        pinLockedUntil: new Date(Date.now() + 60_000),
      })
    );

    const response = await post({ employeeId: AUDREY, pin: "8317" });

    expect(response.status).toBe(429);
    expect(prismaMock.mycoEmployee.update).not.toHaveBeenCalled();
  });
});

describe("legacy per-reviewer links (KEWL-2364) keep working", () => {
  it("signs in without an employeeId, because the roster has exactly one name", async () => {
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow({ issuedToId: ADRIENNE }));
    roster(reviewerRow(ADRIENNE, "Adrienne"));

    const response = await post({ pin: "8317" });

    expect(response.status).toBe(200);
    expect((await response.json()).data.employeeId).toBe(ADRIENNE);
    // The roster query was narrowed to the bound reviewer, so the link still can't be
    // used to enrol anyone else.
    expect(prismaMock.mycoEmployee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: ADRIENNE }) })
    );
  });

  it("cannot be used to claim a co-worker", async () => {
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow({ issuedToId: ADRIENNE }));
    roster(reviewerRow(ADRIENNE, "Adrienne"));

    const response = await post({ employeeId: AUDREY, pin: "8317" });

    expect(response.status).toBe(404);
    expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
  });
});

describe("link state", () => {
  it("rejects a revoked link before any reviewer lookup", async () => {
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(
      linkRow({ status: "revoked", revokedAt: new Date() })
    );

    const response = await post({ employeeId: AUDREY, pin: "8317" });

    expect(response.status).toBe(410);
    expect(prismaMock.mycoEmployee.findMany).not.toHaveBeenCalled();
  });

  it("rejects a link whose roster is empty", async () => {
    roster();

    const response = await post({ employeeId: AUDREY, pin: "8317" });

    expect(response.status).toBe(410);
    expect((await response.json()).error.code).toBe("no_reviewers");
  });
});

describe("reviewer session replay", () => {
  it("does not verify on a different staff link", async () => {
    const response = await post({ employeeId: AUDREY, pin: "8317" });
    const cookie = response.cookies.get(REVIEWER_SESSION_COOKIE)?.value;

    expect(verifyReviewerSession(cookie, { tokenId: "some-other-token", secret: SECRET })).toEqual({
      ok: false,
    });
  });

  it("does not verify under a different server secret", async () => {
    const response = await post({ employeeId: AUDREY, pin: "8317" });
    const cookie = response.cookies.get(REVIEWER_SESSION_COOKIE)?.value;

    expect(verifyReviewerSession(cookie, { tokenId: TOKEN_ID, secret: "other-secret" })).toEqual({
      ok: false,
    });
  });

  it("does not accept a hand-edited employee id", async () => {
    const response = await post({ employeeId: AUDREY, pin: "8317" });
    const cookie = response.cookies.get(REVIEWER_SESSION_COOKIE)!.value;

    // Swap the identity segment; the HMAC covers it, so the whole cookie is void.
    const forged = [ADRIENNE, ...cookie.split(".").slice(1)].join(".");
    expect(verifyReviewerSession(forged, { tokenId: TOKEN_ID, secret: SECRET })).toEqual({
      ok: false,
    });
  });
});
