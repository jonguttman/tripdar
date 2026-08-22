/**
 * KEWL-2335 — staff link bootstrap.
 *
 * The only endpoint reachable without a PIN. Returns the reviewer roster so the reviewer
 * can pick their name (KEWL-2379: Jon's one-shared-link override), whether each has set a
 * PIN yet. KEWL-3795 keeps legacy PIN enrollment closed for unclaimed reviewers; email
 * possession through StaffReviewInvitation -> StaffReviewSession is the canonical path.
 *
 * `hasPin` is roster metadata, not a secret: everyone holding this link is one of six
 * named co-workers who already know each other.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  resolveReviewerRoster,
  REVIEWER_SESSION_COOKIE,
  reviewerSessionSecret,
} from "@/domain/myco/staffReviewAuth";
import { verifyReviewerSession } from "@/domain/myco/reviewerPin";
import { isReviewerSessionStale } from "@/domain/myco/reviewerEnrollment";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const roster = await resolveReviewerRoster(
    token,
    request.cookies.get(REVIEWER_SESSION_COOKIE)?.value
  );
  if (!roster.ok) return roster.response;

  const partner = await prisma.partner.findUnique({
    where: { id: roster.partnerId },
    select: { name: true },
  });

  if (roster.kind === "catalog_token") {
    // Legacy shared-link audit behavior. Invitation session bootstrap is deliberately not
    // a CatalogAccessToken read, so it never mutates token openedAt.
    await prisma.catalogAccessToken.updateMany({
      where: { id: roster.tokenId, openedAt: null },
      data: { openedAt: new Date() },
    });
  }

  const cookieValue = request.cookies.get(REVIEWER_SESSION_COOKIE)?.value;
  const existing = verifyReviewerSession(cookieValue, {
    tokenId: roster.tokenId,
    secret: reviewerSessionSecret(),
  });

  // A session survives a reload only if the PIN behind it hasn't been reset since.
  let signedInAs: string | null = null;
  if (existing.ok) {
    const reviewer = roster.reviewers.find((entry) => entry.id === existing.employeeId);
    if (reviewer && roster.kind === "staff_session") {
      signedInAs = reviewer.id;
    } else if (
      reviewer &&
      !isReviewerSessionStale({ sessionIssuedAt: existing.issuedAt, pinSetAt: reviewer.pinSetAt })
    ) {
      signedInAs = reviewer.id;
    }
  }

  const now = Date.now();
  return NextResponse.json({
    success: true,
    data: {
      partnerName: partner?.name ?? "",
      signedInAs,
      enrollment: {
        open: roster.kind === "catalog_token" ? false : roster.enrollmentOpen,
        closesAt: roster.enrollmentClosesAt?.toISOString() ?? null,
      },
      reviewers: roster.reviewers.map((reviewer) => ({
        id: reviewer.id,
        name: reviewer.name,
        hasPin: reviewer.hasPin,
        // Unclaimed + window shut = this name cannot be picked at all right now. Told to the
        // client so the picker explains it up front instead of after a wasted PIN attempt.
        claimable: reviewer.hasPin,
        lockedOut: Boolean(reviewer.pinLockedUntil && reviewer.pinLockedUntil.getTime() > now),
      })),
    },
  });
}
