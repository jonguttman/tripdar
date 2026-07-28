/**
 * KEWL-2394 — reset EVERY reviewer's PIN for a partner. Super-admin only.
 *
 * The control scope item 8 requires. The four QA enrollments left on the TMT roster by
 * the PR #28 build run made those names unclaimable by the actual staff, and clearing
 * them by hand would have been exactly the silent `UPDATE` this ticket prohibits — so
 * the cleanup runs through here and lands on the ledger like anything else.
 *
 * Blast radius is a whole store's roster, so it demands an explicit `partnerId` (never
 * inferred) on top of the typed reason.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireReason,
  requireSuperAdmin,
  resetAllReviewerPins,
} from "@/domain/myco/staffEnrollmentAdmin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as {
    partnerId?: unknown;
    reason?: unknown;
  };

  const reason = requireReason(body.reason);
  if (reason instanceof NextResponse) return reason;

  if (typeof body.partnerId !== "string" || !body.partnerId) {
    return NextResponse.json(
      { success: false, error: { message: "partnerId is required." } },
      { status: 400 }
    );
  }

  const result = await resetAllReviewerPins({
    partnerId: body.partnerId,
    actorEmail: auth,
    reason,
  });
  if ("error" in result) return result.error;

  return NextResponse.json({
    success: true,
    data: {
      partnerId: result.partnerId,
      clearedCount: result.cleared.filter((reviewer) => reviewer.hadPin).length,
      reviewers: result.cleared,
    },
  });
}
