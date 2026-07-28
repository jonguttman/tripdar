/**
 * KEWL-2394 — the enrollment window is what bounds a shared link, so its edges are
 * tested without a database. The one that matters most is `never_opened`: a link minted
 * before this ticket has both columns NULL, and defaulting that to OPEN would quietly
 * turn every pre-existing staff link into a self-enrollment link.
 */

import { describe, expect, it } from "vitest";
import {
  ENROLLMENT_WINDOW_MS,
  enrollmentWindowExpiry,
  evaluateEnrollmentWindow,
  pinResetPatch,
  toRosterReviewer,
} from "./staffEnrollment";

const NOW = new Date("2026-07-28T20:00:00.000Z");
const HOUR = 60 * 60 * 1000;

describe("evaluateEnrollmentWindow", () => {
  it("is open while the deadline is ahead and nothing closed it", () => {
    const state = evaluateEnrollmentWindow(
      { enrollmentClosesAt: new Date(NOW.getTime() + HOUR), enrollmentClosedAt: null },
      NOW
    );
    expect(state.open).toBe(true);
    expect(state.closedReason).toBeNull();
  });

  it("is closed once the deadline has passed", () => {
    const state = evaluateEnrollmentWindow(
      { enrollmentClosesAt: new Date(NOW.getTime() - 1), enrollmentClosedAt: null },
      NOW
    );
    expect(state.open).toBe(false);
    expect(state.closedReason).toBe("expired");
  });

  it("treats the deadline itself as closed, not open", () => {
    const state = evaluateEnrollmentWindow(
      { enrollmentClosesAt: NOW, enrollmentClosedAt: null },
      NOW
    );
    expect(state.open).toBe(false);
  });

  it("is closed once auto-close or an admin stamped it, even with time left", () => {
    const state = evaluateEnrollmentWindow(
      {
        enrollmentClosesAt: new Date(NOW.getTime() + 48 * HOUR),
        enrollmentClosedAt: new Date(NOW.getTime() - HOUR),
      },
      NOW
    );
    expect(state.open).toBe(false);
    expect(state.closedReason).toBe("closed_early");
  });

  it("fails closed for a legacy link that never had a window", () => {
    const state = evaluateEnrollmentWindow(
      { enrollmentClosesAt: null, enrollmentClosedAt: null },
      NOW
    );
    expect(state.open).toBe(false);
    expect(state.closedReason).toBe("never_opened");
  });
});

describe("enrollmentWindowExpiry", () => {
  it("is 72 hours out from the mint", () => {
    expect(enrollmentWindowExpiry(NOW).getTime() - NOW.getTime()).toBe(ENROLLMENT_WINDOW_MS);
    expect(ENROLLMENT_WINDOW_MS).toBe(72 * HOUR);
  });
});

describe("pinResetPatch", () => {
  it("clears every PIN column and stamps the session revocation epoch", () => {
    // Clearing the hash alone would leave the reviewer's 30-day cookie working.
    expect(pinResetPatch(NOW)).toEqual({
      pinHash: null,
      pinSetAt: null,
      pinFailedAttempts: 0,
      pinLockedUntil: null,
      pinSessionsRevokedAt: NOW,
    });
  });
});

describe("toRosterReviewer", () => {
  const base = {
    id: "employee-1",
    name: "Audrey",
    pinHash: null,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    pinSessionsRevokedAt: null,
  };

  it("exposes only what the picker needs — never the hash", () => {
    const view = toRosterReviewer({ ...base, pinHash: "scrypt$secret" }, NOW);
    expect(view).toEqual({ id: "employee-1", name: "Audrey", hasPin: true, lockedOut: false });
  });

  it("reports a live lockout", () => {
    const view = toRosterReviewer(
      { ...base, pinLockedUntil: new Date(NOW.getTime() + HOUR) },
      NOW
    );
    expect(view.lockedOut).toBe(true);
  });

  it("reports an expired lockout as clear", () => {
    const view = toRosterReviewer(
      { ...base, pinLockedUntil: new Date(NOW.getTime() - HOUR) },
      NOW
    );
    expect(view.lockedOut).toBe(false);
  });
});
