/**
 * KEWL-2379 — the bounds that make a shared staff link acceptable.
 *
 * Jon accepted "everyone picks their PIN on first click" on the understanding that the
 * claim period is bounded, self-closing, logged and reversible. These tests pin each of
 * those four properties, plus the pre-ship assertion that stops a link shipping while
 * someone on the roster cannot claim their own name.
 */

import { describe, expect, it, vi } from "vitest";
import {
  closeEnrollmentIfRosterComplete,
  DEFAULT_ENROLLMENT_HOURS,
  enrollmentClosesAtFrom,
  isEnrollmentOpen,
  isReviewerSessionStale,
  MAX_ENROLLMENT_HOURS,
  MIN_ENROLLMENT_HOURS,
  pinResetPatch,
  preMintPinWarnings,
  recordEnrollmentEvent,
  requestFingerprint,
} from "./reviewerEnrollment";

const NOW = new Date("2026-07-28T22:00:00.000Z");
const HOUR = 60 * 60 * 1000;

describe("isEnrollmentOpen", () => {
  it("is closed when the flag was never set, deadline or not", () => {
    expect(isEnrollmentOpen({ enrollmentOpen: false, enrollmentClosesAt: null }, NOW)).toBe(false);
    expect(
      isEnrollmentOpen(
        { enrollmentOpen: false, enrollmentClosesAt: new Date(NOW.getTime() + HOUR) },
        NOW
      )
    ).toBe(false);
  });

  it("is open inside the window", () => {
    expect(
      isEnrollmentOpen(
        { enrollmentOpen: true, enrollmentClosesAt: new Date(NOW.getTime() + HOUR) },
        NOW
      )
    ).toBe(true);
  });

  it("is closed once the deadline has passed even though the flag is still true", () => {
    // The deadline is enforced at read time, so a missed sweeper can never leave a link
    // claimable past its window.
    expect(
      isEnrollmentOpen(
        { enrollmentOpen: true, enrollmentClosesAt: new Date(NOW.getTime() - 1) },
        NOW
      )
    ).toBe(false);
  });

  it("treats the exact deadline as closed", () => {
    expect(isEnrollmentOpen({ enrollmentOpen: true, enrollmentClosesAt: NOW }, NOW)).toBe(false);
  });
});

describe("enrollmentClosesAtFrom", () => {
  it("defaults to Jon's 72 hours when given nothing usable", () => {
    for (const input of [null, undefined, 0, -5, Number.NaN]) {
      expect(enrollmentClosesAtFrom(input, NOW).getTime()).toBe(
        NOW.getTime() + DEFAULT_ENROLLMENT_HOURS * HOUR
      );
    }
  });

  it("clamps so 'reopen' can never mean 'open forever'", () => {
    expect(enrollmentClosesAtFrom(10_000_000, NOW).getTime()).toBe(
      NOW.getTime() + MAX_ENROLLMENT_HOURS * HOUR
    );
    expect(enrollmentClosesAtFrom(0.001, NOW).getTime()).toBe(
      NOW.getTime() + MIN_ENROLLMENT_HOURS * HOUR
    );
  });
});

describe("isReviewerSessionStale — PIN reset revokes live sessions", () => {
  it("retires every session once the PIN is cleared", () => {
    expect(isReviewerSessionStale({ sessionIssuedAt: NOW.getTime(), pinSetAt: null })).toBe(true);
  });

  it("retires a session signed before the current PIN was set", () => {
    expect(
      isReviewerSessionStale({
        sessionIssuedAt: NOW.getTime() - HOUR,
        pinSetAt: NOW,
      })
    ).toBe(true);
  });

  it("keeps the session minted at the same instant as the PIN", () => {
    // Sign-in writes `pinSetAt` and signs the cookie from one shared `now`, so equal
    // timestamps are the normal successful case, not a stale one.
    expect(isReviewerSessionStale({ sessionIssuedAt: NOW.getTime(), pinSetAt: NOW })).toBe(false);
  });
});

describe("pinResetPatch", () => {
  it("clears the hash, the timestamp and the lockout together", () => {
    expect(pinResetPatch()).toEqual({
      pinHash: null,
      pinSetAt: null,
      pinFailedAttempts: 0,
      pinLockedUntil: null,
    });
  });
});

describe("preMintPinWarnings — the pre-ship assertion", () => {
  it("says nothing when the whole roster is unclaimed", () => {
    expect(
      preMintPinWarnings([
        { name: "Clay", pinHash: null, pinSetAt: null },
        { name: "Audrey", pinHash: null, pinSetAt: null },
      ])
    ).toEqual([]);
  });

  it("names every reviewer who already holds a PIN", () => {
    // This is the exact state today's QA run left behind: four names nobody at the shop
    // can claim, because enrollment is compare-and-set on a null hash.
    const warnings = preMintPinWarnings([
      { name: "Adrienne", pinHash: "scrypt$...", pinSetAt: new Date("2026-07-28T17:39:44.998Z") },
      { name: "Clay", pinHash: null, pinSetAt: null },
      { name: "Devon", pinHash: "scrypt$...", pinSetAt: new Date("2026-07-28T17:39:46.010Z") },
    ]);

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("Adrienne");
    expect(warnings[0]).toContain("CANNOT claim their name");
    expect(warnings[1]).toContain("Devon");
    expect(warnings.join(" ")).not.toContain("Clay");
  });
});

describe("requestFingerprint", () => {
  it("takes the client from the left of x-forwarded-for, not the proxies", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178",
      "user-agent": "Mozilla/5.0 (iPhone)",
    });
    expect(requestFingerprint(headers)).toEqual({
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0 (iPhone)",
    });
  });

  it("falls back to x-real-ip and tolerates neither being present", () => {
    expect(requestFingerprint(new Headers({ "x-real-ip": "198.51.100.4" })).ip).toBe("198.51.100.4");
    expect(requestFingerprint(new Headers())).toEqual({ ip: null, userAgent: null });
  });

  it("truncates a hostile user-agent so it cannot bloat the ledger", () => {
    const headers = new Headers({ "user-agent": "x".repeat(5000) });
    expect(requestFingerprint(headers).userAgent).toHaveLength(256);
  });
});

describe("closeEnrollmentIfRosterComplete — auto-close at six of six", () => {
  function db(unclaimed: number, updatedCount = 1) {
    return {
      mycoEmployee: { count: vi.fn().mockResolvedValue(unclaimed) },
      catalogAccessToken: { updateMany: vi.fn().mockResolvedValue({ count: updatedCount }) },
      reviewerEnrollmentEvent: { create: vi.fn().mockResolvedValue({}) },
    };
  }

  it("leaves the window open while anyone is still unclaimed", async () => {
    const client = db(1);
    const closed = await closeEnrollmentIfRosterComplete(client as never, {
      tokenId: "token-1",
      partnerId: "partner-1",
    });

    expect(closed).toBe(false);
    expect(client.catalogAccessToken.updateMany).not.toHaveBeenCalled();
    expect(client.reviewerEnrollmentEvent.create).not.toHaveBeenCalled();
  });

  it("closes the window and logs it once nobody is left", async () => {
    const client = db(0);
    const closed = await closeEnrollmentIfRosterComplete(client as never, {
      tokenId: "token-1",
      partnerId: "partner-1",
    });

    expect(closed).toBe(true);
    expect(client.catalogAccessToken.updateMany).toHaveBeenCalledWith({
      // The `enrollmentOpen: true` guard is what makes the close idempotent.
      where: { id: "token-1", enrollmentOpen: true },
      data: { enrollmentOpen: false },
    });
    expect(client.reviewerEnrollmentEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "enrollment_closed", actorType: "system" }),
      })
    );
  });

  it("does not log a second close when a concurrent request already closed it", async () => {
    const client = db(0, 0);
    const closed = await closeEnrollmentIfRosterComplete(client as never, {
      tokenId: "token-1",
      partnerId: "partner-1",
    });

    expect(closed).toBe(false);
    expect(client.reviewerEnrollmentEvent.create).not.toHaveBeenCalled();
  });
});

describe("recordEnrollmentEvent", () => {
  it("writes the reviewer, actor, reason and fingerprint that Jon asked for", async () => {
    const client = { reviewerEnrollmentEvent: { create: vi.fn().mockResolvedValue({}) } };

    await recordEnrollmentEvent(client as never, {
      partnerId: "partner-1",
      tokenId: "token-1",
      employeeId: "employee-clay",
      employeeName: "Clay",
      employeeEmail: "clay@themushroomtop.internal",
      eventType: "enrolled",
      actorType: "enrollment",
      actorIdentity: "Clay",
      reason: "first use of the shared staff link",
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0 (iPhone)",
    });

    expect(client.reviewerEnrollmentEvent.create).toHaveBeenCalledWith({
      data: {
        partnerId: "partner-1",
        tokenId: "token-1",
        employeeId: "employee-clay",
        employeeName: "Clay",
        employeeEmail: "clay@themushroomtop.internal",
        eventType: "enrolled",
        actorType: "enrollment",
        actorIdentity: "Clay",
        reason: "first use of the shared staff link",
        ip: "203.0.113.7",
        userAgent: "Mozilla/5.0 (iPhone)",
      },
    });
  });
});
