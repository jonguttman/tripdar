/**
 * KEWL-2335 — staff link bootstrap.
 *
 * The only endpoint reachable without a PIN. Returns the reviewer roster so the reviewer
 * can pick their name (KEWL-2379: Jon's one-shared-link override), whether each has set a
 * PIN yet, and the state of the enrollment window so the client can say plainly why an
 * unclaimed name is not selectable rather than failing at the PIN step.
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
  const roster = await resolveReviewerRoster(token);
  if (!roster.ok) return roster.response;

  const partner = await prisma.partner.findUnique({
    where: { id: roster.partnerId },
    select: { name: true },
  });

  // Mark the link opened once, for the same audit reason KEWL-2332 tracks it.
  await prisma.catalogAccessToken.updateMany({
    where: { id: roster.tokenId, openedAt: null },
    data: { openedAt: new Date() },
  });

  const existing = verifyReviewerSession(
    request.cookies.get(REVIEWER_SESSION_COOKIE)?.value,
    { tokenId: roster.tokenId, secret: reviewerSessionSecret() }
  );

  // A session survives a reload only if the PIN behind it hasn't been reset since.
  let signedInAs: string | null = null;
  if (existing.ok) {
    const reviewer = roster.reviewers.find((entry) => entry.id === existing.employeeId);
    if (
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
        open: roster.enrollmentOpen,
        closesAt: roster.enrollmentClosesAt?.toISOString() ?? null,
      },
      reviewers: roster.reviewers.map((reviewer) => ({
        id: reviewer.id,
        name: reviewer.name,
        hasPin: reviewer.hasPin,
        // Unclaimed + window shut = this name cannot be picked at all right now. Told to the
        // client so the picker explains it up front instead of after a wasted PIN attempt.
        claimable: reviewer.hasPin || roster.enrollmentOpen,
        lockedOut: Boolean(reviewer.pinLockedUntil && reviewer.pinLockedUntil.getTime() > now),
      })),
    },
  });
}
