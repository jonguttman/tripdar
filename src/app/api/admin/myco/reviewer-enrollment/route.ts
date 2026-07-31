/**
 * KEWL-2379 — Jon's controls over the staff-review enrollment window.
 *
 * Super-admin only, mirroring the force-list override: the window is what makes a shared
 * link acceptable, so opening one is Jon's call and nobody else's.
 *
 * GET  — roster PIN status, live link windows, and the enrollment ledger.
 * POST — `open` / `close` a window, `reset` one reviewer's PIN, `reset_all` for the roster.
 *
 * Never a silent UPDATE. Every action requires a typed reason and writes an append-only
 * ledger row, which is also what Jon asked for when clearing today's QA enrollments —
 * those four PINs were set by a build run, not by Adrienne, Devon, Dani or Eddie, and
 * because enrollment is compare-and-set on a null hash they block the real person from
 * ever claiming their own name until reset.
 *
 * Resetting a PIN also revokes that reviewer's live sessions: clearing `pinSetAt` retires
 * every session cookie signed before it (see `isReviewerSessionStale`).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/domain/auth/adminSession";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/domain/auth/role";
import { staffReviewerWhere } from "@/domain/myco/staffReviewRoster";
import {
  DEFAULT_ENROLLMENT_HOURS,
  enrollmentClosesAtFrom,
  isEnrollmentOpen,
  pinResetPatch,
  recordEnrollmentEvent,
  requestFingerprint,
} from "@/domain/myco/reviewerEnrollment";

export const dynamic = "force-dynamic";

const MIN_REASON_LENGTH = 12;
const LEDGER_PAGE_SIZE = 200;

async function requireSuperAdmin() {
  const session = await getAdminSession();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }
  const role = await getUserRole(session.user.email);
  if (role !== "super_admin") {
    return NextResponse.json(
      {
        success: false,
        error: { message: "Only Jon can change staff-review enrollment." },
      },
      { status: 403 }
    );
  }
  return session.user.email;
}

function badRequest(message: string) {
  return NextResponse.json({ success: false, error: { message } }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth instanceof NextResponse) return auth;

  const partnerId = request.nextUrl.searchParams.get("partnerId") ?? "";
  if (!partnerId) return badRequest("partnerId is required");

  const [reviewers, tokens, events] = await Promise.all([
    prisma.mycoEmployee.findMany({
      where: staffReviewerWhere(partnerId),
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, pinHash: true, pinSetAt: true, pinLockedUntil: true },
    }),
    prisma.catalogAccessToken.findMany({
      where: { purpose: "staff_review", partnerId, status: "active" },
      orderBy: { issuedAt: "desc" },
      select: {
        id: true,
        issuedAt: true,
        issuedToId: true,
        expiresAt: true,
        openedAt: true,
        enrollmentOpen: true,
        enrollmentClosesAt: true,
      },
    }),
    prisma.reviewerEnrollmentEvent.findMany({
      where: { partnerId },
      orderBy: { createdAt: "desc" },
      take: LEDGER_PAGE_SIZE,
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      reviewers: reviewers.map((reviewer) => ({
        id: reviewer.id,
        name: reviewer.name,
        email: reviewer.email,
        // The hash itself never leaves the server.
        hasPin: Boolean(reviewer.pinHash),
        pinSetAt: reviewer.pinSetAt,
        lockedOut: Boolean(reviewer.pinLockedUntil && reviewer.pinLockedUntil > new Date()),
      })),
      unclaimedCount: reviewers.filter((reviewer) => !reviewer.pinHash).length,
      links: tokens.map((token) => ({
        ...token,
        // Stored flag AND deadline — a lapsed window reads as closed even if the flag is set.
        enrollmentEffectivelyOpen: isEnrollmentOpen(token),
      })),
      events,
      ledgerTruncatedAt: events.length === LEDGER_PAGE_SIZE ? LEDGER_PAGE_SIZE : null,
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < MIN_REASON_LENGTH) {
    return badRequest(`Type a real reason (at least ${MIN_REASON_LENGTH} characters).`);
  }

  const fingerprint = requestFingerprint(request.headers);

  if (action === "open" || action === "close") {
    const tokenId = typeof body.tokenId === "string" ? body.tokenId : "";
    const token = await prisma.catalogAccessToken.findFirst({
      where: { id: tokenId, purpose: "staff_review" },
      select: { id: true, partnerId: true, status: true },
    });
    if (!token) return NextResponse.json({ success: false, error: { message: "Staff link not found" } }, { status: 404 });
    // Reopening a dead link would create a window nobody can reach.
    if (token.status !== "active") return badRequest("That staff link is revoked or expired. Mint a new one.");

    const opening = action === "open";
    const closesAt = opening
      ? enrollmentClosesAtFrom(typeof body.hours === "number" ? body.hours : DEFAULT_ENROLLMENT_HOURS)
      : null;

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.catalogAccessToken.update({
        where: { id: token.id },
        data: { enrollmentOpen: opening, enrollmentClosesAt: closesAt },
        select: { id: true, enrollmentOpen: true, enrollmentClosesAt: true },
      });
      await recordEnrollmentEvent(tx, {
        partnerId: token.partnerId,
        tokenId: token.id,
        employeeName: "—",
        eventType: opening ? "enrollment_opened" : "enrollment_closed",
        actorType: "admin",
        actorIdentity: auth,
        reason,
        ip: fingerprint.ip,
        userAgent: fingerprint.userAgent,
      });
      return next;
    });

    return NextResponse.json({ success: true, data: updated });
  }

  if (action === "reset" || action === "reset_all") {
    const partnerId = typeof body.partnerId === "string" ? body.partnerId : "";
    const employeeId = typeof body.employeeId === "string" ? body.employeeId : "";
    if (action === "reset" && !employeeId) return badRequest("employeeId is required");
    if (action === "reset_all" && !partnerId) return badRequest("partnerId is required");

    const reviewers = await prisma.mycoEmployee.findMany({
      // Both branches go through the allowlist: passing an employeeId must not be a way
      // to reset (and so re-open enrollment for) somebody who is not an approved reviewer.
      where:
        action === "reset"
          ? staffReviewerWhere(undefined, employeeId)
          : staffReviewerWhere(partnerId),
      select: { id: true, name: true, email: true, partnerId: true, pinHash: true },
    });
    if (reviewers.length === 0) {
      return NextResponse.json({ success: false, error: { message: "Reviewer not found" } }, { status: 404 });
    }

    // One transaction: either every PIN in the batch is cleared and logged, or none is.
    const cleared = await prisma.$transaction(async (tx) => {
      const done: string[] = [];
      for (const reviewer of reviewers) {
        await tx.mycoEmployee.update({ where: { id: reviewer.id }, data: pinResetPatch() });
        await recordEnrollmentEvent(tx, {
          partnerId: reviewer.partnerId,
          employeeId: reviewer.id,
          employeeName: reviewer.name,
          employeeEmail: reviewer.email,
          eventType: "pin_reset",
          actorType: "admin",
          actorIdentity: auth,
          // Says whether there was actually a PIN to clear, so a no-op reset is honest.
          reason: reviewer.pinHash ? reason : `${reason} (no PIN was set)`,
          ip: fingerprint.ip,
          userAgent: fingerprint.userAgent,
        });
        done.push(reviewer.name);
      }
      return done;
    });

    return NextResponse.json({
      success: true,
      data: {
        reset: cleared,
        // Sessions die with the PIN — no separate revocation step to forget.
        sessionsRevoked: true,
      },
    });
  }

  return badRequest("action must be one of: open, close, reset, reset_all");
}
