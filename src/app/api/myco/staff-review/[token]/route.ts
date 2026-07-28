/**
 * KEWL-2335 — staff link bootstrap.
 *
 * The only endpoint reachable without a PIN. Returns the ONE reviewer this link was
 * issued to and whether they have set a PIN yet. It deliberately does not expose the
 * roster: after KEWL-2364 a link identifies a single person, so listing co-workers would
 * leak names and re-suggest the "pick who you are" flow that caused the hole.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  resolveBoundReviewer,
  REVIEWER_SESSION_COOKIE,
  reviewerSessionSecret,
} from "@/domain/myco/staffReviewAuth";
import { verifyReviewerSession } from "@/domain/myco/reviewerPin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const bound = await resolveBoundReviewer(token);
  if (!bound.ok) return bound.response;
  const reviewer = bound.reviewer;

  const partner = await prisma.partner.findUnique({
    where: { id: bound.partnerId },
    select: { name: true },
  });

  // Mark the link opened once, for the same audit reason KEWL-2332 tracks it.
  await prisma.catalogAccessToken.updateMany({
    where: { id: bound.tokenId, openedAt: null },
    data: { openedAt: new Date() },
  });

  const existing = verifyReviewerSession(
    request.cookies.get(REVIEWER_SESSION_COOKIE)?.value,
    { tokenId: bound.tokenId, secret: reviewerSessionSecret() }
  );

  const now = Date.now();
  return NextResponse.json({
    success: true,
    data: {
      partnerName: partner?.name ?? "",
      signedIn: existing.ok && existing.employeeId === reviewer.id,
      reviewer: {
        id: reviewer.id,
        name: reviewer.name,
        hasPin: reviewer.hasPin,
        lockedOut: Boolean(reviewer.pinLockedUntil && reviewer.pinLockedUntil.getTime() > now),
      },
    },
  });
}
