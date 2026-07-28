/**
 * KEWL-2335 — reviewer sign-in.
 *
 * POST { pin } — sets the PIN on first use, verifies it thereafter.
 * DELETE — signs out on this device.
 *
 * The reviewer is whoever the link was issued to. `employeeId` is deliberately NOT
 * accepted from the request body: per KEWL-2364, letting the client name the employee
 * turned first-use PIN setup into an unauthenticated identity claim.
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
  resolveBoundReviewer,
  REVIEWER_SESSION_COOKIE,
  reviewerSessionSecret,
} from "@/domain/myco/staffReviewAuth";

export const dynamic = "force-dynamic";

function fail(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, error: { message, ...extra } }, { status });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const bound = await resolveBoundReviewer(token);
  if (!bound.ok) return bound.response;
  const reviewer = bound.reviewer;

  const body = (await request.json().catch(() => ({}))) as { pin?: unknown };
  const pin = body.pin;

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

  const firstUse = !reviewer.pinHash;
  if (firstUse) {
    if (isTooObviousPin(pin)) return fail("Pick a less guessable 4 digits.", 400);
    // `pinHash: null` in the WHERE clause makes enrollment a compare-and-set: two devices
    // racing first use cannot both win, and a set PIN can never be overwritten here.
    const claimed = await prisma.mycoEmployee.updateMany({
      where: { id: reviewer.id, pinHash: null },
      data: { pinHash: await hashPin(pin), pinSetAt: new Date(), ...successfulAttemptPatch() },
    });
    if (claimed.count === 0) return fail("That PIN doesn't match.", 401);
  } else {
    const valid = await verifyPin(pin, reviewer.pinHash);
    if (!valid) {
      const patch = failedAttemptPatch(lockState);
      await prisma.mycoEmployee.update({ where: { id: reviewer.id }, data: patch });
      const locked = Boolean(patch.pinLockedUntil);
      return fail(
        locked ? "Too many tries. Locked for 15 minutes." : "That PIN doesn't match.",
        locked ? 429 : 401
      );
    }
    await prisma.mycoEmployee.update({
      where: { id: reviewer.id },
      data: successfulAttemptPatch(),
    });
  }

  const value = signReviewerSession({
    employeeId: reviewer.id,
    tokenId: bound.tokenId,
    issuedAt: Date.now(),
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
