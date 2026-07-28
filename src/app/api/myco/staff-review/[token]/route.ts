/**
 * KEWL-2335 / KEWL-2394 — staff link bootstrap.
 *
 * The only endpoint reachable without a PIN. Returns the roster this link serves so the
 * reviewer can pick their name, plus the state of the enrollment window so the client
 * can tell "pick a PIN" from "ask Jon to reopen enrollment" before anyone types digits.
 *
 * Listing co-workers' first names on a link the whole store already holds is the point
 * of Jon's ruling, not a leak — nothing here exposes an email, a PIN, or a hash.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  resolveStaffRoster,
  REVIEWER_SESSION_COOKIE,
  reviewerSessionSecret,
} from "@/domain/myco/staffReviewAuth";
import { verifyReviewerSession } from "@/domain/myco/reviewerPin";
import { ENROLLMENT_CLOSED_MESSAGE, toRosterReviewer } from "@/domain/myco/staffEnrollment";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const now = new Date();
  const resolved = await resolveStaffRoster(token, now);
  if (!resolved.ok) return resolved.response;
  const { link, roster } = resolved;

  const partner = await prisma.partner.findUnique({
    where: { id: link.partnerId },
    select: { name: true },
  });

  // Mark the link opened once, for the same audit reason KEWL-2332 tracks it.
  await prisma.catalogAccessToken.updateMany({
    where: { id: link.tokenId, openedAt: null },
    data: { openedAt: now },
  });

  const existing = verifyReviewerSession(request.cookies.get(REVIEWER_SESSION_COOKIE)?.value, {
    tokenId: link.tokenId,
    secret: reviewerSessionSecret(),
  });
  const signedInReviewer = existing.ok
    ? roster.find(
        (reviewer) =>
          reviewer.id === existing.employeeId &&
          Boolean(reviewer.pinHash) &&
          !(
            reviewer.pinSessionsRevokedAt &&
            existing.issuedAt <= reviewer.pinSessionsRevokedAt.getTime()
          )
      )
    : undefined;

  return NextResponse.json({
    success: true,
    data: {
      partnerName: partner?.name ?? "",
      signedIn: Boolean(signedInReviewer),
      signedInReviewerId: signedInReviewer?.id ?? null,
      enrollment: {
        open: link.window.open,
        closesAt: link.window.closesAt?.toISOString() ?? null,
        closedAt: link.window.closedAt?.toISOString() ?? null,
        // The client shows this verbatim next to any unclaimed name once the window is
        // shut, so the dead end names its own way out instead of just failing.
        closedMessage: link.window.open ? null : ENROLLMENT_CLOSED_MESSAGE,
      },
      roster: roster.map((reviewer) => toRosterReviewer(reviewer, now)),
    },
  });
}
