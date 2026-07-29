/**
 * KEWL-2457 — accept or reject one staff catalog edit.
 *
 * Accept applies the change **through the normal projection path**, not by writing the
 * column directly: flipping the ledger row to `accepted` and then calling
 * `recomputeCatalogItemProjection()` replays the whole append-only log for that item and
 * rebuilds the derived cache and the catalog columns from it. That matters — a bespoke
 * "write this value to this column" would let an accept produce a projection the ledger
 * doesn't support, which is precisely the divergence KEWL-2364 built the repair path for.
 * It also means accepting is idempotent and order-independent: replaying is replaying.
 *
 * Reject records the decision on the row. It never deletes it — the ticket is explicit
 * that a rejected change must be on the record, and `computeFieldStates()` already skips
 * anything that isn't `accepted`, so a rejected row is inert without being erased.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { prisma } from "@/lib/prisma";
import { resolveProductForAdmin } from "@/domain/myco/adminAccess";
import { recomputeCatalogItemProjection } from "@/domain/myco/staffReviewService";

export const dynamic = "force-dynamic";

const VALID_DECISIONS = ["accept", "reject"] as const;
type Decision = (typeof VALID_DECISIONS)[number];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ changeId: string }> }
) {
  const { changeId } = await params;

  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json(
      { success: false, error: { message: "Unauthorized" } },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    decision?: unknown;
    reason?: unknown;
  };
  const decision = body.decision as Decision;
  if (!VALID_DECISIONS.includes(decision)) {
    return NextResponse.json(
      { success: false, error: { message: `Unknown decision: ${String(body.decision)}` } },
      { status: 400 }
    );
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  const change = await prisma.catalogFieldChange.findUnique({
    where: { id: changeId },
    select: {
      id: true,
      catalogItemId: true,
      fieldName: true,
      actorType: true,
      disposition: true,
    },
  });
  if (!change) {
    return NextResponse.json(
      { success: false, error: { message: "Change not found." } },
      { status: 404 }
    );
  }

  // Ownership second, user-supplied ids last. The change id came from the request, so
  // the partner check has to run against the product it points at.
  const access = await resolveProductForAdmin(email, change.catalogItemId);
  if (!access.ok) {
    return NextResponse.json(
      { success: false, error: { message: access.message } },
      { status: access.status }
    );
  }

  // Brand submissions have their own triage surface (KEWL-2331) with different rules —
  // an accepted brand change flips a staff-confirmed field to needs_re_review. Deciding
  // one here would skip that, so this route refuses rather than half-handling it.
  if (change.actorType !== "staff") {
    return NextResponse.json(
      {
        success: false,
        error: { message: "This queue only decides staff edits." },
      },
      { status: 400 }
    );
  }

  if (change.disposition !== "pending") {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: `This edit was already ${change.disposition}.`,
        },
      },
      { status: 409 }
    );
  }

  const updated = await prisma.catalogFieldChange.update({
    where: { id: changeId },
    data: {
      disposition: decision === "accept" ? "accepted" : "rejected",
      dispositionBy: email,
      dispositionAt: new Date(),
      dispositionReason: reason || null,
    },
    select: { id: true, disposition: true, dispositionAt: true },
  });

  // Rebuild both derived projections from the ledger. Run on reject too: cheap,
  // idempotent, and it means the caches are provably consistent with the log after
  // every decision rather than only after the ones that changed a value.
  const repair = await recomputeCatalogItemProjection(change.catalogItemId);

  return NextResponse.json({
    success: true,
    data: {
      id: updated.id,
      disposition: updated.disposition,
      dispositionAt: updated.dispositionAt,
      fieldName: change.fieldName,
      catalogItemId: change.catalogItemId,
      projection: {
        cacheRowsChanged: repair.cacheRowsChanged,
        columnsChanged: repair.columnsChanged,
      },
    },
  });
}
