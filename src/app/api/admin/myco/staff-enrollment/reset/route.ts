/**
 * KEWL-2394 — reset ONE reviewer's PIN. Super-admin only.
 *
 * Puts a single name back in play (and signs that reviewer's devices out) for the
 * everyday case: somebody forgot their four digits. The window still governs whether
 * they can re-enroll, so a reset is not a back door around a closed window.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireReason, requireSuperAdmin, resetReviewerPin } from "@/domain/myco/staffEnrollmentAdmin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as {
    employeeId?: unknown;
    reason?: unknown;
  };

  const reason = requireReason(body.reason);
  if (reason instanceof NextResponse) return reason;

  if (typeof body.employeeId !== "string" || !body.employeeId) {
    return NextResponse.json(
      { success: false, error: { message: "employeeId is required." } },
      { status: 400 }
    );
  }

  const result = await resetReviewerPin({
    employeeId: body.employeeId,
    actorEmail: auth,
    reason,
  });
  if ("error" in result) return result.error;

  return NextResponse.json({ success: true, data: { reset: result } });
}
