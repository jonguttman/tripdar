/**
 * KEWL-2457 — the admin queue for staff catalog edits.
 *
 * Jon, 2026-07-29: "Have them fill it out and when they make a change I want to review it."
 * Before this route existed there was no admin surface for staff-supplied changes at all:
 * `/admin/reviews` moderates customer strain reviews, and the brand queue (KEWL-2331)
 * only sees `actorType: "brand"`. A staff answer went straight to a live customer-facing
 * column with nobody on our side ever seeing it.
 *
 * Read-only. Accept/reject is the sibling `[changeId]` route.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/domain/auth/role";
import { ensureFieldRules } from "@/domain/myco/staffReviewService";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["pending", "accepted", "rejected"] as const;
type QueueStatus = (typeof VALID_STATUSES)[number];

/**
 * Auth then ownership, never the other way round (BUG-2026-06-09-001). A partner admin
 * sees only their own partner's queue; a super admin sees everything. Returning the
 * scope rather than a boolean keeps the caller from having to re-derive it.
 */
async function requireQueueAccess(): Promise<
  { ok: true; email: string; partnerId: string | null } | { ok: false; response: NextResponse }
> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: { message: "Unauthorized" } },
        { status: 401 }
      ),
    };
  }

  const role = await getUserRole(email);
  if (role === "super_admin") return { ok: true, email, partnerId: null };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { partnerId: true },
  });
  if (!user?.partnerId) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: { message: "No partner assigned to this account." } },
        { status: 403 }
      ),
    };
  }
  return { ok: true, email, partnerId: user.partnerId };
}

export async function GET(request: NextRequest) {
  const access = await requireQueueAccess();
  if (!access.ok) return access.response;

  const requested = request.nextUrl.searchParams.get("status");
  const status: QueueStatus = VALID_STATUSES.includes(requested as QueueStatus)
    ? (requested as QueueStatus)
    : "pending";

  const rules = await ensureFieldRules(null);
  const ruleByField = new Map(rules.map((rule) => [rule.fieldName, rule]));

  const changes = await prisma.catalogFieldChange.findMany({
    where: {
      actorType: "staff",
      disposition: status,
      catalogItem: {
        archivedAt: null,
        ...(access.partnerId ? { partnerId: access.partnerId } : {}),
      },
    },
    // Oldest first for `pending`: a queue Jon works top-down should not reshuffle as
    // staff keep answering. Newest first once decided, where recency is what's useful.
    orderBy: { createdAt: status === "pending" ? "asc" : "desc" },
    take: 500,
    select: {
      id: true,
      catalogItemId: true,
      fieldName: true,
      previousValue: true,
      submittedValue: true,
      actorIdentity: true,
      source: true,
      disposition: true,
      dispositionBy: true,
      dispositionAt: true,
      dispositionReason: true,
      createdAt: true,
      catalogItem: {
        select: {
          id: true,
          productName: true,
          brand: true,
          format: true,
          photoUrl: true,
          brandRef: { select: { name: true } },
        },
      },
    },
  });

  // `actorIdentity` is a MycoEmployee id. Jon needs a name — "which reviewer" is an
  // explicit requirement, and an opaque cuid does not answer it. One batched lookup
  // rather than a join so a deleted employee degrades to the raw id instead of dropping
  // the row from the queue entirely.
  const reviewerIds = [...new Set(changes.map((change) => change.actorIdentity))];
  const reviewers = reviewerIds.length
    ? await prisma.mycoEmployee.findMany({
        where: { id: { in: reviewerIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const reviewerById = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer]));

  const items = changes.map((change) => {
    const rule = ruleByField.get(change.fieldName);
    const reviewer = reviewerById.get(change.actorIdentity);
    return {
      id: change.id,
      catalogItemId: change.catalogItemId,
      productName: change.catalogItem.productName,
      brand: change.catalogItem.brandRef?.name ?? change.catalogItem.brand,
      format: change.catalogItem.format,
      photoUrl: change.catalogItem.photoUrl,
      fieldName: change.fieldName,
      fieldLabel: rule?.label ?? change.fieldName,
      tier: rule?.tier ?? null,
      // Null here is meaningful and must not be smoothed over: it is the difference
      // between filling a blank and overwriting something we already held.
      previousValue: change.previousValue ?? null,
      submittedValue: change.submittedValue ?? null,
      reviewerId: change.actorIdentity,
      reviewerName: reviewer?.name ?? null,
      reviewerEmail: reviewer?.email ?? null,
      source: change.source,
      disposition: change.disposition,
      dispositionBy: change.dispositionBy,
      dispositionAt: change.dispositionAt,
      dispositionReason: change.dispositionReason,
      createdAt: change.createdAt,
    };
  });

  const pendingCount = await prisma.catalogFieldChange.count({
    where: {
      actorType: "staff",
      disposition: "pending",
      catalogItem: {
        archivedAt: null,
        ...(access.partnerId ? { partnerId: access.partnerId } : {}),
      },
    },
  });

  return NextResponse.json({
    success: true,
    data: { status, pendingCount, changes: items },
  });
}
