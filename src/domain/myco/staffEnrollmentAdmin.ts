/**
 * KEWL-2394 — admin side of staff enrollment.
 *
 * Scope item 6 asked for these as first-class routes rather than one-off scripts, and
 * item 8 for the QA-PIN cleanup to be delivered *through* them. That is the point: a
 * throwaway script leaves no trace of who cleared what, and the next person needing the
 * same fix writes another script. Every operation here appends to the enrollment ledger,
 * so the reset that unblocks Adrienne is the same recorded mechanism Jon will use the
 * next time somebody forgets a PIN.
 *
 * All three are super-admin only and all three demand a typed reason — same bar as the
 * KEWL-2335 listing override, for the same reason: these are identity decisions.
 */

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/domain/auth/config";
import { getUserRole } from "@/domain/auth/role";
import { prisma } from "@/lib/prisma";
import {
  appendEnrollmentEvent,
  enrollmentWindowExpiry,
  ENROLLMENT_WINDOW_MS,
  pinResetPatch,
} from "./staffEnrollment";

export const MIN_REASON_LENGTH = 12;

/** Resolves the caller's email, or the response to return instead. */
export async function requireSuperAdmin(): Promise<string | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json(
      { success: false, error: { message: "Unauthorized" } },
      { status: 401 },
    );
  }
  const role = await getUserRole(session.user.email);
  if (role !== "super_admin") {
    return NextResponse.json(
      {
        success: false,
        error: { message: "Only Jon can change staff enrollment." },
      },
      { status: 403 },
    );
  }
  return session.user.email;
}

export function requireReason(raw: unknown): string | NextResponse {
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (reason.length < MIN_REASON_LENGTH) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: `Type a real reason (at least ${MIN_REASON_LENGTH} characters).`,
        },
      },
      { status: 400 },
    );
  }
  return reason;
}

/* ---------------------------------------------------------------- reopen --- */

export interface ReopenResult {
  tokenId: string;
  enrollmentClosesAt: Date;
  stillUnenrolled: { id: string; name: string }[];
}

/**
 * Reopens self-enrollment on a shared link for another bounded window.
 *
 * Deliberately re-arms `enrollmentClosesAt` from *now* rather than clearing the bound
 * entirely — "reopen" must not be a way to end up with a link that is open forever.
 */
export async function reopenEnrollment(input: {
  tokenId: string;
  actorEmail: string;
  reason: string;
  hours?: number;
  now?: Date;
}): Promise<ReopenResult | { error: NextResponse }> {
  const now = input.now ?? new Date();
  const token = await prisma.catalogAccessToken.findUnique({
    where: { id: input.tokenId },
    select: {
      id: true,
      partnerId: true,
      purpose: true,
      status: true,
      enrollmentClosesAt: true,
      enrollmentClosedAt: true,
    },
  });
  if (!token || token.purpose !== "staff_review") {
    return {
      error: NextResponse.json(
        { success: false, error: { message: "Staff link not found." } },
        { status: 404 },
      ),
    };
  }
  if (token.status !== "active") {
    return {
      error: NextResponse.json(
        {
          success: false,
          error: {
            message:
              "That link is revoked. Mint a new one instead of reopening it.",
          },
        },
        { status: 422 },
      ),
    };
  }

  const hours =
    typeof input.hours === "number" && Number.isFinite(input.hours)
      ? input.hours
      : null;
  const closesAt =
    hours && hours > 0
      ? new Date(now.getTime() + hours * 60 * 60 * 1000)
      : enrollmentWindowExpiry(now);

  await prisma.catalogAccessToken.update({
    where: { id: token.id },
    data: { enrollmentClosesAt: closesAt, enrollmentClosedAt: null },
  });

  const unenrolled = await prisma.mycoEmployee.findMany({
    where: {
      partnerId: token.partnerId,
      active: true,
      optedOut: false,
      pinHash: null,
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  await appendEnrollmentEvent(prisma, {
    partnerId: token.partnerId,
    accessTokenId: token.id,
    event: "window_reopened",
    outcome: "allowed",
    actorType: "admin",
    actorIdentity: input.actorEmail,
    reason: input.reason,
    metadata: {
      previousClosesAt: token.enrollmentClosesAt?.toISOString() ?? null,
      previousClosedAt: token.enrollmentClosedAt?.toISOString() ?? null,
      closesAt: closesAt.toISOString(),
      windowMs: closesAt.getTime() - now.getTime(),
      defaultWindowMs: ENROLLMENT_WINDOW_MS,
      stillUnenrolled: unenrolled.map((reviewer) => reviewer.name),
    },
  });

  return {
    tokenId: token.id,
    enrollmentClosesAt: closesAt,
    stillUnenrolled: unenrolled,
  };
}

/* ----------------------------------------------------------------- reset --- */

export interface ResetOutcome {
  id: string;
  name: string;
  hadPin: boolean;
}

/**
 * Clears one reviewer's PIN and revokes their live sessions, in one transaction with the
 * ledger append so a reset can never land without its record.
 */
export async function resetReviewerPin(input: {
  employeeId: string;
  actorEmail: string;
  reason: string;
  now?: Date;
}): Promise<ResetOutcome | { error: NextResponse }> {
  const now = input.now ?? new Date();
  const employee = await prisma.mycoEmployee.findUnique({
    where: { id: input.employeeId },
    select: {
      id: true,
      name: true,
      partnerId: true,
      pinHash: true,
      pinSetAt: true,
    },
  });
  if (!employee) {
    return {
      error: NextResponse.json(
        { success: false, error: { message: "Reviewer not found." } },
        { status: 404 },
      ),
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.mycoEmployee.update({
      where: { id: employee.id },
      data: pinResetPatch(now),
    });
    await appendEnrollmentEvent(tx, {
      partnerId: employee.partnerId,
      employeeId: employee.id,
      employeeName: employee.name,
      event: "pin_reset",
      outcome: "allowed",
      actorType: "admin",
      actorIdentity: input.actorEmail,
      reason: input.reason,
      metadata: {
        hadPin: Boolean(employee.pinHash),
        previousPinSetAt: employee.pinSetAt?.toISOString() ?? null,
        sessionsRevokedAt: now.toISOString(),
      },
    });
  });

  return {
    id: employee.id,
    name: employee.name,
    hadPin: Boolean(employee.pinHash),
  };
}

/* ------------------------------------------------------------- reset-all --- */

export interface ResetAllResult {
  partnerId: string;
  cleared: ResetOutcome[];
}

/**
 * Clears every active reviewer's PIN for a partner.
 *
 * This is the control scope item 8 requires: the four QA enrollments from the PR #28
 * build run (Adrienne, Devon, Dani, Eddie) left real roster names permanently unclaimable,
 * because enrollment is compare-and-set on `pinHash IS NULL`. One ledger row per reviewer
 * plus a `pin_reset_all` summary, all in one transaction — not a silent `UPDATE`, and not
 * a script that leaves no trace.
 */
export async function resetAllReviewerPins(input: {
  partnerId: string;
  actorEmail: string;
  reason: string;
  now?: Date;
}): Promise<ResetAllResult | { error: NextResponse }> {
  const now = input.now ?? new Date();
  const partner = await prisma.partner.findUnique({
    where: { id: input.partnerId },
    select: { id: true },
  });
  if (!partner) {
    return {
      error: NextResponse.json(
        { success: false, error: { message: "Partner not found." } },
        { status: 404 },
      ),
    };
  }

  const roster = await prisma.mycoEmployee.findMany({
    where: { partnerId: partner.id, active: true, optedOut: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, pinHash: true, pinSetAt: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.mycoEmployee.updateMany({
      where: { id: { in: roster.map((reviewer) => reviewer.id) } },
      data: pinResetPatch(now),
    });
    for (const reviewer of roster) {
      await appendEnrollmentEvent(tx, {
        partnerId: partner.id,
        employeeId: reviewer.id,
        employeeName: reviewer.name,
        event: "pin_reset",
        outcome: "allowed",
        actorType: "admin",
        actorIdentity: input.actorEmail,
        reason: input.reason,
        metadata: {
          viaResetAll: true,
          hadPin: Boolean(reviewer.pinHash),
          previousPinSetAt: reviewer.pinSetAt?.toISOString() ?? null,
          sessionsRevokedAt: now.toISOString(),
        },
      });
    }
    await appendEnrollmentEvent(tx, {
      partnerId: partner.id,
      event: "pin_reset_all",
      outcome: "allowed",
      actorType: "admin",
      actorIdentity: input.actorEmail,
      reason: input.reason,
      metadata: {
        reviewerCount: roster.length,
        clearedNames: roster.filter((r) => r.pinHash).map((r) => r.name),
      },
    });
  });

  return {
    partnerId: partner.id,
    cleared: roster.map((reviewer) => ({
      id: reviewer.id,
      name: reviewer.name,
      hadPin: Boolean(reviewer.pinHash),
    })),
  };
}
