/**
 * KEWL-2335 / KEWL-2394 — reviewer sign-in on the shared staff link.
 *
 * POST { employeeId, pin } — enrolls on first use, verifies thereafter.
 * DELETE — signs out on this device.
 *
 * `employeeId` IS accepted from the body: Jon's shared-link ruling makes picking your own
 * name the first step, so the roster picker has to be able to say who it picked. The
 * checks that keep that from being a free identity claim are all here and in
 * `staffEnrollment.ts` — the id must be on this link's roster, an unclaimed name may only
 * be claimed while the enrollment window is open, claiming is a compare-and-set that
 * exactly one racer can win, and every attempt (allowed or denied) hits the ledger.
 *
 * Once a name is enrolled it behaves exactly as before: PIN required, lockout enforced.
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
  resolveStaffRoster,
  REVIEWER_SESSION_COOKIE,
  reviewerSessionSecret,
} from "@/domain/myco/staffReviewAuth";
import {
  appendEnrollmentEvent,
  autoCloseWindowIfRosterEnrolled,
  ENROLLMENT_CLOSED_MESSAGE,
} from "@/domain/myco/staffEnrollment";

export const dynamic = "force-dynamic";

function fail(
  message: string,
  status: number,
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json(
    { success: false, error: { message, ...extra } },
    { status },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const now = new Date();
  const resolved = await resolveStaffRoster(token, now);
  if (!resolved.ok) return resolved.response;
  const { link, roster } = resolved;

  const body = (await request.json().catch(() => ({}))) as {
    pin?: unknown;
    employeeId?: unknown;
  };

  const requestedId =
    typeof body.employeeId === "string" ? body.employeeId : null;
  // A legacy per-reviewer link has a roster of one; let it sign in without an id so old
  // links keep working unchanged.
  const reviewer =
    roster.find((candidate) => candidate.id === requestedId) ??
    (roster.length === 1 && !requestedId ? roster[0] : undefined);

  // Deliberately the same 404 shape a bad name would get: a holder probing ids learns
  // nothing about who exists at this partner beyond the roster the link already showed.
  if (!reviewer)
    return fail("Pick your name from the list.", 404, {
      code: "unknown_reviewer",
    });

  const pin = body.pin;
  if (!isValidPinFormat(pin)) return fail("Your PIN is 4 digits.", 400);

  const lockState = {
    pinFailedAttempts: reviewer.pinFailedAttempts,
    pinLockedUntil: reviewer.pinLockedUntil,
  };
  if (isLockedOut(lockState, now)) {
    return fail(
      `Too many tries. Try again in ${Math.ceil(lockoutSecondsRemaining(lockState, now) / 60)} minutes.`,
      429,
      { retryAfterSeconds: lockoutSecondsRemaining(lockState, now) },
    );
  }

  const ledgerBase = {
    partnerId: link.partnerId,
    accessTokenId: link.tokenId,
    employeeId: reviewer.id,
    employeeName: reviewer.name,
    actorType: "reviewer" as const,
    actorIdentity: reviewer.name,
  };

  const firstUse = !reviewer.pinHash;
  if (firstUse) {
    // Scope item 3 — the fail-closed branch. An unclaimed name outside the window is a
    // dead end on purpose, and the message names the way out rather than just refusing.
    if (!link.window.open) {
      await appendEnrollmentEvent(prisma, {
        ...ledgerBase,
        event: "enrollment_denied",
        outcome: "denied",
        reason: ENROLLMENT_CLOSED_MESSAGE,
        metadata: {
          closedReason: link.window.closedReason,
          closesAt: link.window.closesAt?.toISOString() ?? null,
          closedAt: link.window.closedAt?.toISOString() ?? null,
        },
      });
      return fail(ENROLLMENT_CLOSED_MESSAGE, 403, {
        code: "enrollment_closed",
      });
    }

    if (isTooObviousPin(pin)) return fail("Pick a less guessable 4 digits.", 400);

    // `pinHash: null` in the WHERE clause makes enrollment a compare-and-set: two devices
    // racing first use cannot both win, and a set PIN can never be overwritten here.
    const claimed = await prisma.mycoEmployee.updateMany({
      where: { id: reviewer.id, pinHash: null },
      data: {
        pinHash: await hashPin(pin),
        pinSetAt: now,
        ...successfulAttemptPatch(now),
      },
    });
    if (claimed.count === 0) {
      // Lost the race, or an admin enrolled them in between. Their name is taken now, so
      // the honest instruction is to enter the PIN — not to try claiming again.
      await appendEnrollmentEvent(prisma, {
        ...ledgerBase,
        event: "enrollment_denied",
        outcome: "denied",
        reason: "name was claimed by a concurrent first use",
      });
      return fail("That name was just claimed. Enter its PIN.", 409, {
        code: "already_enrolled",
      });
    }

    await appendEnrollmentEvent(prisma, {
      ...ledgerBase,
      event: "enrolled",
      outcome: "allowed",
      reason: "first use of the shared staff link",
      metadata: { closesAt: link.window.closesAt?.toISOString() ?? null },
    });

    // Scope item 4 — shutting the window as soon as the last name is taken means the
    // 72h ceiling is a worst case, not the normal exposure.
    await autoCloseWindowIfRosterEnrolled(
      prisma,
      {
        partnerId: link.partnerId,
        accessTokenId: link.tokenId,
        issuedToId: link.issuedToId,
      },
      now,
    );
  } else {
    const valid = await verifyPin(pin, reviewer.pinHash);
    if (!valid) {
      const patch = failedAttemptPatch(lockState, now);
      await prisma.mycoEmployee.update({
        where: { id: reviewer.id },
        data: patch,
      });
      const locked = Boolean(patch.pinLockedUntil);
      await appendEnrollmentEvent(prisma, {
        ...ledgerBase,
        event: "pin_failed",
        outcome: "denied",
        reason: locked ? "locked out after repeated failures" : "wrong PIN",
      });
      return fail(
        locked
          ? "Too many tries. Locked for 15 minutes."
          : "That PIN doesn't match.",
        locked ? 429 : 401,
      );
    }
    await prisma.mycoEmployee.update({
      where: { id: reviewer.id },
      data: successfulAttemptPatch(now),
    });
    await appendEnrollmentEvent(prisma, {
      ...ledgerBase,
      event: "pin_verified",
      outcome: "allowed",
    });
  }

  const value = signReviewerSession({
    employeeId: reviewer.id,
    tokenId: link.tokenId,
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
