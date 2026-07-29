/**
 * KEWL-2335 — reviewer sign-in.
 *
 * POST { employeeId, pin } — sets the PIN on first use, verifies it thereafter.
 * DELETE — signs out on this device.
 *
 * KEWL-2379: `employeeId` is client-supplied again, because Jon's override put the shared
 * link and the "pick your name" step back. Two properties keep that honest, and neither
 * depends on trusting the client:
 *
 *  - First use is gated on an OPEN enrollment window (`enrollment_closed` otherwise, never
 *    a silent pass), and every attempt — accepted or rejected — is written to the
 *    append-only ledger with IP and user-agent.
 *  - First use is a compare-and-set on `pinHash IS NULL`, kept from `f0f7d28`. A set PIN
 *    can never be overwritten here, and two devices racing the same name have exactly one
 *    winner. Claiming a name that already has a PIN degenerates to "wrong PIN".
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  failedAttemptPatch,
  hashPin,
  isLockedOut,
  isTooObviousPin,
  isValidPinFormat,
  lockoutSecondsRemaining,
  REVIEWER_SESSION_TTL_MS,
  signReviewerSession,
  successfulAttemptPatch,
  verifyPin,
} from "@/domain/myco/reviewerPin";
import {
  resolveReviewerRoster,
  REVIEWER_SESSION_COOKIE,
  reviewerSessionSecret,
} from "@/domain/myco/staffReviewAuth";
import {
  closeEnrollmentIfRosterComplete,
  ENROLLMENT_CLOSED_CODE,
  ENROLLMENT_CLOSED_MESSAGE,
  recordEnrollmentEvent,
  requestFingerprint,
} from "@/domain/myco/reviewerEnrollment";

export const dynamic = "force-dynamic";

function fail(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, error: { message, ...extra } }, { status });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const roster = await resolveReviewerRoster(token);
  if (!roster.ok) return roster.response;

  const body = (await request.json().catch(() => ({}))) as {
    employeeId?: unknown;
    pin?: unknown;
  };
  const employeeId = typeof body.employeeId === "string" ? body.employeeId : "";
  const pin = body.pin;

  // Must be someone on THIS link's roster — never an arbitrary id from the request.
  const reviewer = roster.reviewers.find((entry) => entry.id === employeeId);
  if (!reviewer) return fail("Pick your name from the list.", 404, { code: "unknown_reviewer" });

  if (!isValidPinFormat(pin)) return fail("Your PIN is 4 digits.", 400);

  const lockState = {
    pinFailedAttempts: reviewer.pinFailedAttempts,
    pinLockedUntil: reviewer.pinLockedUntil,
  };
  if (isLockedOut(lockState)) {
    return fail(
      `Too many tries. Try again in ${Math.ceil(lockoutSecondsRemaining(lockState) / 60)} minutes.`,
      429,
      { retryAfterSeconds: lockoutSecondsRemaining(lockState) }
    );
  }

  const fingerprint = requestFingerprint(request.headers);
  const ledgerIdentity = { partnerId: roster.partnerId, tokenId: roster.tokenId };
  const ledgerReviewer = {
    employeeId: reviewer.id,
    employeeName: reviewer.name,
    employeeEmail: reviewer.email,
  };

  const firstUse = !reviewer.pinHash;
  // `now` is shared by the PIN timestamp and the session signature so the session is never
  // marginally older than the PIN it was minted for (which would read as "reset since").
  const now = new Date();

  if (firstUse) {
    // Fail closed outside the window. Recorded, so an attempt after the deadline is
    // visible to Jon rather than just bouncing silently.
    if (!roster.enrollmentOpen) {
      await recordEnrollmentEvent(prisma, {
        ...ledgerIdentity,
        ...ledgerReviewer,
        eventType: "enrollment_rejected",
        actorType: "enrollment",
        actorIdentity: reviewer.name,
        reason: "enrollment window closed",
        ip: fingerprint.ip,
        userAgent: fingerprint.userAgent,
      });
      return fail(ENROLLMENT_CLOSED_MESSAGE, 403, { code: ENROLLMENT_CLOSED_CODE });
    }

    if (isTooObviousPin(pin)) return fail("Pick a less guessable 4 digits.", 400);

    // Compare-and-set: `pinHash: null` in the WHERE is what makes a set PIN unstealable.
    const claimed = await prisma.mycoEmployee.updateMany({
      where: { id: reviewer.id, pinHash: null },
      data: { pinHash: await hashPin(pin), pinSetAt: now, ...successfulAttemptPatch(now) },
    });
    // Lost the race, or the roster read was stale and a PIN already existed. Same answer as
    // a wrong PIN on purpose — it doesn't tell the caller which of the two happened.
    if (claimed.count === 0) return fail("That PIN doesn't match.", 401);

    await recordEnrollmentEvent(prisma, {
      ...ledgerIdentity,
      ...ledgerReviewer,
      eventType: "enrolled",
      actorType: "enrollment",
      actorIdentity: reviewer.name,
      reason: "first use of the shared staff link",
      ip: fingerprint.ip,
      userAgent: fingerprint.userAgent,
    });

    // Jon's auto-close: the window ends the moment nobody is left to enroll.
    await closeEnrollmentIfRosterComplete(prisma, ledgerIdentity);
  } else {
    const valid = await verifyPin(pin, reviewer.pinHash);
    if (!valid) {
      const patch = failedAttemptPatch(lockState, now);
      await prisma.mycoEmployee.update({ where: { id: reviewer.id }, data: patch });
      const locked = Boolean(patch.pinLockedUntil);
      return fail(
        locked ? "Too many tries. Locked for 15 minutes." : "That PIN doesn't match.",
        locked ? 429 : 401
      );
    }
    await prisma.mycoEmployee.update({
      where: { id: reviewer.id },
      data: successfulAttemptPatch(now),
    });
  }

  const value = signReviewerSession({
    employeeId: reviewer.id,
    tokenId: roster.tokenId,
    issuedAt: now.getTime(),
    secret: reviewerSessionSecret(),
  });

  const response = NextResponse.json({
    success: true,
    data: { employeeId: reviewer.id, employeeName: reviewer.name, firstUse },
  });
  response.cookies.set(REVIEWER_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(REVIEWER_SESSION_TTL_MS / 1000),
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(REVIEWER_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
