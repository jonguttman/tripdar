/**
 * KEWL-2335 — staff link bootstrap.
 *
 * The only endpoint reachable without a PIN. Returns the fixed reviewer roster so the
 * reviewer can pick their name, and whether each one has set a PIN yet.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveStaffLink, REVIEWER_SESSION_COOKIE, reviewerSessionSecret } from "@/domain/myco/staffReviewAuth";
import { verifyReviewerSession } from "@/domain/myco/reviewerPin";
import { staffReviewerWhere } from "@/domain/myco/staffReviewRoster";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await resolveStaffLink(token);
  if (!link.ok) return link.response;

  const [partner, reviewers] = await Promise.all([
    prisma.partner.findUnique({ where: { id: link.partnerId }, select: { name: true } }),
    prisma.mycoEmployee.findMany({
      where: staffReviewerWhere(link.partnerId),
      orderBy: { name: "asc" },
      select: { id: true, name: true, pinHash: true, pinLockedUntil: true },
    }),
  ]);

  // Mark the link opened once, for the same audit reason KEWL-2332 tracks it.
  await prisma.catalogAccessToken.updateMany({
    where: { id: link.tokenId, openedAt: null },
    data: { openedAt: new Date() },
  });

  const existing = verifyReviewerSession(
    request.cookies.get(REVIEWER_SESSION_COOKIE)?.value,
    { tokenId: link.tokenId, secret: reviewerSessionSecret() }
  );

  const now = Date.now();
  return NextResponse.json({
    success: true,
    data: {
      partnerName: partner?.name ?? "",
      signedInAs: existing.ok ? existing.employeeId : null,
      reviewers: reviewers.map((reviewer) => ({
        id: reviewer.id,
        name: reviewer.name,
        hasPin: Boolean(reviewer.pinHash),
        lockedOut: Boolean(reviewer.pinLockedUntil && reviewer.pinLockedUntil.getTime() > now),
      })),
    },
  });
}
