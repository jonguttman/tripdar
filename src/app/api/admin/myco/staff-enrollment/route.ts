/**
 * KEWL-2394 — staff enrollment status, super-admin only.
 *
 * The read that makes the write routes usable: who is enrolled, which shared links are
 * live, whether the window is open, and the tail of the append-only ledger. Without it
 * an admin would have to guess a `tokenId` before they could reopen a window.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateEnrollmentWindow } from "@/domain/myco/staffEnrollment";
import { requireSuperAdmin } from "@/domain/myco/staffEnrollmentAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth instanceof NextResponse) return auth;

  const partnerId = request.nextUrl.searchParams.get("partnerId");
  if (!partnerId) {
    return NextResponse.json(
      { success: false, error: { message: "partnerId is required." } },
      { status: 400 }
    );
  }

  const now = new Date();
  const [reviewers, tokens, ledger] = await Promise.all([
    prisma.mycoEmployee.findMany({
      where: { partnerId, active: true, optedOut: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, pinHash: true, pinSetAt: true, pinLockedUntil: true },
    }),
    prisma.catalogAccessToken.findMany({
      where: { partnerId, purpose: "staff_review", status: "active" },
      orderBy: { issuedAt: "desc" },
      select: {
        id: true,
        issuedToId: true,
        issuedAt: true,
        openedAt: true,
        enrollmentClosesAt: true,
        enrollmentClosedAt: true,
      },
    }),
    prisma.reviewerEnrollmentEvent.findMany({
      where: { partnerId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      reviewers: reviewers.map((reviewer) => ({
        id: reviewer.id,
        name: reviewer.name,
        enrolled: Boolean(reviewer.pinHash),
        pinSetAt: reviewer.pinSetAt,
        lockedOut: Boolean(
          reviewer.pinLockedUntil && reviewer.pinLockedUntil.getTime() > now.getTime()
        ),
      })),
      links: tokens.map((token) => ({
        id: token.id,
        shared: token.issuedToId === null,
        issuedAt: token.issuedAt,
        openedAt: token.openedAt,
        enrollment: evaluateEnrollmentWindow(
          {
            enrollmentClosesAt: token.enrollmentClosesAt,
            enrollmentClosedAt: token.enrollmentClosedAt,
          },
          now
        ),
      })),
      ledger,
    },
  });
}
