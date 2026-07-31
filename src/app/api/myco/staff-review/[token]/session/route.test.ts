/**
 * KEWL-2379 — sign-in on the ONE shared staff link.
 *
 * Jon overrode KEWL-2364's per-reviewer binding: everyone gets the same link and picks
 * their PIN on first click. `employeeId` is therefore client-supplied again, which is only
 * defensible because of the bounds these tests pin:
 *
 *  - first use only works inside an OPEN enrollment window; outside it, the request fails
 *    closed and the attempt is logged (never a silent fallback);
 *  - first use is compare-and-set on `pinHash IS NULL`, so a set PIN can never be
 *    overwritten here and a two-device race has exactly one winner;
 *  - the window auto-closes the moment the last roster member enrolls;
 *  - `employeeId` must name someone on THIS link's roster.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { hashPin, verifyReviewerSession, MAX_PIN_ATTEMPTS } from "@/domain/myco/reviewerPin";
import { REVIEWER_SESSION_COOKIE } from "@/domain/myco/staffReviewAuth";

const prismaMock = vi.hoisted(() => ({
  catalogAccessToken: { findUnique: vi.fn(), updateMany: vi.fn() },
  mycoEmployee: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  reviewerEnrollmentEvent: { create: vi.fn() },
}));

// Strict view (KEWL-2467): the code under test sees a Proxy that throws by name on
// any un-stubbed prisma access, so a signature change the mock has not kept up with
// fails as "not stubbed" instead of as a downstream undefined/500.
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock(prismaMock) };
});

const SECRET = "test-secret-for-reviewer-sessions";
const TOKEN_ID = "token-row-1";
const PARTNER_ID = "partner-1";
const CLAY = "employee-clay";
const AUDREY = "employee-audrey";

const HOUR = 60 * 60 * 1000;

/** A shared staff link row: no `issuedToId`, enrollment open for another day. */
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
    enrollmentOpen: true,
    enrollmentClosesAt: new Date(Date.now() + 24 * HOUR),
    ...overrides,
  };
}

function reviewerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CLAY,
    name: "Clay",
    email: "clay@themushroomtop.internal",
    pinHash: null,
    pinSetAt: null,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    ...overrides,
  };
}

async function post(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const { POST } = await import("./route");
  const request = new Request("https://tripdar.test/api/myco/staff-review/raw-token/session", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  // The test uses the web Request shape; this cast silences the narrower NextRequest
  // handler signature, not a runtime difference in the fields this route reads.
  return POST(request as never, { params: Promise.resolve({ token: "raw-token" }) });
}

/** The ledger row written by a request, if any. */
function ledgerEntry(call = 0) {
  return prismaMock.reviewerEnrollmentEvent.create.mock.calls[call]?.[0]?.data;
}

describe("shared staff link sign-in (KEWL-2379)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = SECRET;
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow());
    prismaMock.catalogAccessToken.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.mycoEmployee.findMany.mockResolvedValue([
      reviewerRow(),
      reviewerRow({ id: AUDREY, name: "Audrey", email: "audrey@themushroomtop.internal" }),
    ]);
    prismaMock.mycoEmployee.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.mycoEmployee.update.mockResolvedValue({});
    // Someone is still unclaimed by default, so auto-close does not fire.
    prismaMock.mycoEmployee.count.mockResolvedValue(1);
    prismaMock.reviewerEnrollmentEvent.create.mockResolvedValue({});
  });

  describe("enrollment inside the window", () => {
    it("lets an unclaimed reviewer set their PIN and signs them in as themselves", async () => {
      const response = await post({ employeeId: CLAY, pin: "8317" });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toMatchObject({ employeeId: CLAY, employeeName: "Clay", firstUse: true });

      // Compare-and-set, not a bare update: the null-hash guard is the whole protection.
      expect(prismaMock.mycoEmployee.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: CLAY, pinHash: null } })
      );

      const cookie = response.cookies.get(REVIEWER_SESSION_COOKIE);
      const session = verifyReviewerSession(cookie?.value, { tokenId: TOKEN_ID, secret: SECRET });
      expect(session.ok && session.employeeId).toBe(CLAY);
    });

    it("logs the enrollment with reviewer, IP and user-agent", async () => {
      await post(
        { employeeId: CLAY, pin: "8317" },
        { "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "Mozilla/5.0 (iPhone)" }
      );

      expect(ledgerEntry()).toMatchObject({
        employeeId: CLAY,
        employeeName: "Clay",
        eventType: "enrolled",
        actorType: "enrollment",
        ip: "203.0.113.7",
        userAgent: "Mozilla/5.0 (iPhone)",
      });
    });

    it("still refuses a guessable PIN at enrollment", async () => {
      const response = await post({ employeeId: CLAY, pin: "1234" });
      expect(response.status).toBe(400);
      expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("enrollment outside the window — fails closed", () => {
    it("refuses an unclaimed reviewer when the window flag is off", async () => {
      prismaMock.catalogAccessToken.findUnique.mockResolvedValue(
        linkRow({ enrollmentOpen: false, enrollmentClosesAt: null })
      );

      const response = await post({ employeeId: CLAY, pin: "8317" });
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error.code).toBe("enrollment_closed");
      // No silent fallback: nothing was written and no session was issued.
      expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
      expect(response.cookies.get(REVIEWER_SESSION_COOKIE)).toBeUndefined();
    });

    it("refuses once the deadline has passed even with the flag still set", async () => {
      prismaMock.catalogAccessToken.findUnique.mockResolvedValue(
        linkRow({ enrollmentOpen: true, enrollmentClosesAt: new Date(Date.now() - 1000) })
      );

      const response = await post({ employeeId: CLAY, pin: "8317" });
      expect(response.status).toBe(403);
      expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
    });

    it("records the rejected attempt so a late claim is visible to Jon", async () => {
      prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow({ enrollmentOpen: false }));

      await post({ employeeId: CLAY, pin: "8317" }, { "x-real-ip": "198.51.100.4" });

      expect(ledgerEntry()).toMatchObject({
        employeeName: "Clay",
        eventType: "enrollment_rejected",
        actorType: "enrollment",
        ip: "198.51.100.4",
      });
    });

    it("still lets an ALREADY-enrolled reviewer sign in after the window shuts", async () => {
      // Closing enrollment must not lock out the people who already set a PIN.
      prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow({ enrollmentOpen: false }));
      prismaMock.mycoEmployee.findMany.mockResolvedValue([
        reviewerRow({ pinHash: await hashPin("8317"), pinSetAt: new Date(Date.now() - HOUR) }),
      ]);

      const response = await post({ employeeId: CLAY, pin: "8317" });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.firstUse).toBe(false);
    });
  });

  describe("a set PIN is never overwritable", () => {
    it("rejects a wrong PIN for a reviewer who has already enrolled", async () => {
      prismaMock.mycoEmployee.findMany.mockResolvedValue([
        reviewerRow({ pinHash: await hashPin("8317"), pinSetAt: new Date() }),
      ]);

      const response = await post({ employeeId: CLAY, pin: "4429" });

      expect(response.status).toBe(401);
      // Went down the verify path, never the enrollment path.
      expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
    });

    it("gives the loser of a first-use race a plain wrong-PIN answer", async () => {
      // Both devices read a null hash; the compare-and-set lets exactly one through.
      prismaMock.mycoEmployee.updateMany.mockResolvedValue({ count: 0 });

      const response = await post({ employeeId: CLAY, pin: "8317" });
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error.message).toBe("That PIN doesn't match.");
      // Losing the race is not an enrollment — nothing goes in the ledger.
      expect(prismaMock.reviewerEnrollmentEvent.create).not.toHaveBeenCalled();
      expect(response.cookies.get(REVIEWER_SESSION_COOKIE)).toBeUndefined();
    });

    it("locks out after repeated wrong PINs", async () => {
      prismaMock.mycoEmployee.findMany.mockResolvedValue([
        reviewerRow({
          pinHash: await hashPin("8317"),
          pinSetAt: new Date(),
          pinFailedAttempts: MAX_PIN_ATTEMPTS - 1,
        }),
      ]);

      const response = await post({ employeeId: CLAY, pin: "4429" });
      expect(response.status).toBe(429);
    });
  });

  describe("auto-close at full roster coverage", () => {
    it("closes the window when the last unclaimed reviewer enrolls", async () => {
      prismaMock.mycoEmployee.count.mockResolvedValue(0);

      await post({ employeeId: CLAY, pin: "8317" });

      expect(prismaMock.catalogAccessToken.updateMany).toHaveBeenCalledWith({
        where: { id: TOKEN_ID, enrollmentOpen: true },
        data: { enrollmentOpen: false },
      });
      expect(ledgerEntry(1)).toMatchObject({
        eventType: "enrollment_closed",
        actorType: "system",
      });
    });

    it("leaves the window open while someone is still unclaimed", async () => {
      prismaMock.mycoEmployee.count.mockResolvedValue(2);

      await post({ employeeId: CLAY, pin: "8317" });

      expect(prismaMock.catalogAccessToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("employeeId must name someone on this link's roster", () => {
    it("rejects an id that is not on the roster", async () => {
      const response = await post({ employeeId: "employee-somebody-else", pin: "8317" });
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error.code).toBe("unknown_reviewer");
      expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
    });

    it("narrows the roster to the bound reviewer on a legacy per-reviewer link", async () => {
      // Pre-override links still carry `issuedToId`. Honouring it can only RESTRICT a link,
      // so an already-issued link never silently gains authority over the rest of the roster.
      prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow({ issuedToId: AUDREY }));
      prismaMock.mycoEmployee.findMany.mockResolvedValue([
        reviewerRow({ id: AUDREY, name: "Audrey", email: "audrey@themushroomtop.internal" }),
      ]);

      const response = await post({ employeeId: CLAY, pin: "8317" });

      expect(response.status).toBe(404);
      expect(prismaMock.mycoEmployee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: AUDREY }) })
      );
    });
  });

  describe("link state still gates everything", () => {
    it("refuses a revoked link before looking at the roster at all", async () => {
      prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow({ status: "revoked" }));

      const response = await post({ employeeId: CLAY, pin: "8317" });

      expect(response.status).toBe(410);
      expect(prismaMock.mycoEmployee.findMany).not.toHaveBeenCalled();
    });

    it("rejects a malformed PIN without touching the database", async () => {
      const response = await post({ employeeId: CLAY, pin: "83" });

      expect(response.status).toBe(400);
      expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
    });
  });
});
