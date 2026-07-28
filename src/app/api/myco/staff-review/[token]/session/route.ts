/**
 * KEWL-2335 — reviewer identification.
 *
 * POST { employeeId, pin } — sets the PIN on first use, verifies it thereafter.
 * DELETE — signs out on this device.
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
  verifyReviewerSession,
} from "@/domain/myco/reviewerPin";
import {
  resolveStaffLink,
  REVIEWER_SESSION_COOKIE,
  reviewerSessionSecret,
} from "@/domain/myco/staffReviewAuth";

export const dynamic = "force-dynamic";

function fail(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, error: { message, ...extra } }, { status });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await resolveStaffLink(token);
  if (!link.ok) return link.response;

  const body = (await request.json().catch(() => ({}))) as { employeeId?: string; pin?: string };
  const employeeId = typeof body.employeeId === "string" ? body.employeeId : "";
  const pin = body.pin;

  if (!isValidPinFormat(pin)) return fail("Your PIN is 4 digits.", 400);

  const existingSession = verifyReviewerSession(
    request.cookies.get(REVIEWER_SESSION_COOKIE)?.value,
    { tokenId: link.tokenId, secret: reviewerSessionSecret() }
  );
  if (existingSession.ok && existingSession.employeeId !== employeeId) {
    return fail("Sign out before choosing a different reviewer.", 409, {
      code: "identity_bound",
    });
  }

  const employee = await prisma.mycoEmployee.findFirst({
    where: { id: employeeId, partnerId: link.partnerId, active: true, optedOut: false },
    select: { id: true, name: true, pinHash: true, pinFailedAttempts: true, pinLockedUntil: true },
  });
  if (!employee) return fail("Pick your name from the list.", 404);

  const lockState = {
    pinFailedAttempts: employee.pinFailedAttempts,
    pinLockedUntil: employee.pinLockedUntil,
  };
  if (isLockedOut(lockState)) {
    return fail(
      `Too many tries. Try again in ${Math.ceil(lockoutSecondsRemaining(lockState) / 60)} minutes.`,
      429,
      { retryAfterSeconds: lockoutSecondsRemaining(lockState) }
    );
  }

  const firstUse = !employee.pinHash;
  if (firstUse) {
    if (isTooObviousPin(pin)) return fail("Pick a less guessable 4 digits.", 400);
    const enrollment = await prisma.mycoEmployee.updateMany({
      // Compare-and-set is the identity-claim boundary for the shared link. If two
      // devices race to enroll the same roster entry, only the first hash may land.
      where: {
        id: employee.id,
        partnerId: link.partnerId,
        active: true,
        optedOut: false,
        pinHash: null,
      },
      data: {
        pinHash: await hashPin(pin),
        pinSetAt: new Date(),
        ...successfulAttemptPatch(),
      },
    });
    if (enrollment.count !== 1) {
      return fail("A PIN was just set for this name. Enter that PIN to continue.", 401, {
        code: "pin_already_set",
      });
    }
  } else {
    const valid = await verifyPin(pin, employee.pinHash);
    if (!valid) {
      const patch = failedAttemptPatch(lockState);
      await prisma.mycoEmployee.update({ where: { id: employee.id }, data: patch });
      const locked = Boolean(patch.pinLockedUntil);
      return fail(
        locked ? "Too many tries. Locked for 15 minutes." : "That PIN doesn't match.",
        locked ? 429 : 401
      );
    }
    await prisma.mycoEmployee.update({
      where: { id: employee.id },
      data: successfulAttemptPatch(),
    });
  }

  const value = signReviewerSession({
    employeeId: employee.id,
    tokenId: link.tokenId,
    issuedAt: Date.now(),
    secret: reviewerSessionSecret(),
  });

  const response = NextResponse.json({
    success: true,
    data: { employeeId: employee.id, employeeName: employee.name, firstUse },
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
