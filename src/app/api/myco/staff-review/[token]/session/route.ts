/**
 * KEWL-2335 — reviewer sign-in.
 *
 * POST { employeeId, pin } — verifies legacy PINs only.
 * DELETE — signs out on this device.
 *
 * KEWL-3446 / KEWL-3795: TMT's canonical reviewer re-entry path is email possession
 * through StaffReviewInvitation -> StaffReviewSession. The shared-link PIN enrollment path
 * is legacy and now fails closed for first use; do not create a new PIN here.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  failedAttemptPatch,
  isLockedOut,
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
    // KEWL-3446 keeps email re-entry canonical. A still-reachable shared staff link must
    // fail closed for new PIN enrollment even if an old token row still says open.
    await recordEnrollmentEvent(prisma, {
      ...ledgerIdentity,
      ...ledgerReviewer,
      eventType: "enrollment_rejected",
      actorType: "enrollment",
      actorIdentity: reviewer.name,
      reason: "legacy PIN enrollment closed",
      ip: fingerprint.ip,
      userAgent: fingerprint.userAgent,
    });
    return fail(ENROLLMENT_CLOSED_MESSAGE, 403, { code: ENROLLMENT_CLOSED_CODE });
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
