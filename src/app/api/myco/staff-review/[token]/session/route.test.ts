/**
 * KEWL-3795 — sign-in on the legacy shared staff link.
 *
 * KEWL-3446 made email possession through StaffReviewInvitation -> StaffReviewSession the
 * canonical reviewer path. The old shared link can verify an already-set PIN, but first-use
 * PIN enrollment now fails closed with neutral copy and without writing pinHash.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { hashPin, MAX_PIN_ATTEMPTS } from "@/domain/myco/reviewerPin";
import { REVIEWER_SESSION_COOKIE } from "@/domain/myco/staffReviewAuth";

const prismaMock = vi.hoisted(() => ({
  catalogAccessToken: { findUnique: vi.fn(), updateMany: vi.fn() },
  mycoEmployee: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  partner: { findUnique: vi.fn() },
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

async function bootstrap() {
  const { GET } = await import("../route");
  const request = Object.assign(new Request("https://tripdar.test/api/myco/staff-review/raw-token"), {
    cookies: { get: () => undefined },
  });
  return GET(request as never, { params: Promise.resolve({ token: "raw-token" }) });
}

/** The ledger row written by a request, if any. */
function ledgerEntry(call = 0) {
  return prismaMock.reviewerEnrollmentEvent.create.mock.calls[call]?.[0]?.data;
}

describe("legacy shared staff link sign-in (KEWL-3795)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = SECRET;
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow());
    prismaMock.catalogAccessToken.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.partner.findUnique.mockResolvedValue({ name: "The Mushroom Top" });
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

  describe("legacy shared-link bootstrap copy contract", () => {
    it("marks unclaimed reviewers as not claimable even when the token row still says open", async () => {
      const response = await bootstrap();
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.enrollment.open).toBe(false);
      expect(json.data.reviewers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: CLAY, hasPin: false, claimable: false }),
        ])
      );
    });
  });

  describe("legacy PIN enrollment — fails closed", () => {
    it("refuses an unclaimed reviewer even when a stale token row still says enrollment is open", async () => {
      const response = await post({ employeeId: CLAY, pin: "8317" });
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toMatchObject({
        code: "enrollment_closed",
        message: "PIN enrollment is closed. Ask your manager to approve another PIN enrollment.",
      });

      expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
      expect(response.cookies.get(REVIEWER_SESSION_COOKIE)).toBeUndefined();
    });

    it("logs the rejected enrollment with reviewer, IP and user-agent", async () => {
      await post(
        { employeeId: CLAY, pin: "8317" },
        { "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "Mozilla/5.0 (iPhone)" }
      );

      expect(ledgerEntry()).toMatchObject({
        employeeId: CLAY,
        employeeName: "Clay",
        eventType: "enrollment_rejected",
        actorType: "enrollment",
        reason: "legacy PIN enrollment closed",
        ip: "203.0.113.7",
        userAgent: "Mozilla/5.0 (iPhone)",
      });
    });

    it("does not reveal anything extra for a guessable first-use PIN", async () => {
      const response = await post({ employeeId: CLAY, pin: "1234" });
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error.message).toBe("PIN enrollment is closed. Ask your manager to approve another PIN enrollment.");
      expect(prismaMock.mycoEmployee.updateMany).not.toHaveBeenCalled();
    });

    it("returns the same neutral copy when the window flag is off", async () => {
      prismaMock.catalogAccessToken.findUnique.mockResolvedValue(linkRow({ enrollmentOpen: false }));
      const response = await post({ employeeId: CLAY, pin: "8317" });
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error.code).toBe("enrollment_closed");
      expect(json.error.message).toBe("PIN enrollment is closed. Ask your manager to approve another PIN enrollment.");
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
