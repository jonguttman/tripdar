/**
 * KEWL-2394 — reopen self-enrollment on a shared staff link. Super-admin only.
 *
 * This is the other half of the fail-closed rule: a reviewer who missed the window is
 * told "ask Jon to reopen enrollment", and this is what Jon does. Re-arms a bounded
 * window rather than removing the bound.
 */

import { NextRequest, NextResponse } from "next/server";
import { reopenEnrollment, requireReason, requireSuperAdmin } from "@/domain/myco/staffEnrollmentAdmin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as {
    tokenId?: unknown;
    reason?: unknown;
    hours?: unknown;
  };

  const reason = requireReason(body.reason);
  if (reason instanceof NextResponse) return reason;

  if (typeof body.tokenId !== "string" || !body.tokenId) {
    return NextResponse.json(
      { success: false, error: { message: "tokenId is required." } },
      { status: 400 }
    );
  }

  const result = await reopenEnrollment({
    tokenId: body.tokenId,
    actorEmail: auth,
    reason,
    hours: typeof body.hours === "number" ? body.hours : undefined,
  });
  if ("error" in result) return result.error;

  return NextResponse.json({
    success: true,
    data: {
      tokenId: result.tokenId,
      enrollmentClosesAt: result.enrollmentClosesAt,
      stillUnenrolled: result.stillUnenrolled,
    },
  });
}
