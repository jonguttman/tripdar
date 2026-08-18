/**
 * KEWL-2335 — the reviewer's product list.
 *
 * Ordered by urgency tier: disputed first (a disputed dose must read louder than a
 * blank), then never-reviewed, then not-reviewed-by-you, then done.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireReviewer, REVIEWER_SESSION_COOKIE } from "@/domain/myco/staffReviewAuth";
import {
  appendFullPackageDoseDisputeChanges,
  computeFieldStates,
  ensureFieldRules,
  evaluateGateForItem,
  fieldsOwedBy,
  urgencyRank,
  urgencyTierFor,
  URGENCY_TIER_LABELS,
} from "@/domain/myco/staffReviewService";
import { APPROVED_PHOTO_WHERE } from "@/domain/myco/photoVisibility";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const reviewer = await requireReviewer(token, request.cookies.get(REVIEWER_SESSION_COOKIE)?.value);
  if (!reviewer.ok) return reviewer.response;

  const rules = await ensureFieldRules(null);
  const items = await prisma.storeProductCatalog.findMany({
    where: { partnerId: reviewer.partnerId, archivedAt: null },
    include: {
      brandRef: { select: { name: true } },
      // Approved only: this drives both the row thumbnail and the gate photo
      // count, and neither may be satisfied by a pending brand photo (KEWL-2460).
      photos: {
        where: APPROVED_PHOTO_WHERE,
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        select: { id: true, url: true },
      },
      vibeProfile: true,
      strengthOffset: true,
      catalogFieldChanges: {
        select: {
          fieldName: true,
          submittedValue: true,
          actorType: true,
          actorIdentity: true,
          source: true,
          disposition: true,
          createdAt: true,
        },
      },
    },
    orderBy: { productName: "asc" },
  });

  const reviewableRules = rules.filter((rule) => rule.tier !== "D");
  const actorIds = [
    ...new Set(
      items.flatMap((item) =>
        item.catalogFieldChanges
          .filter((change) => change.actorType === "staff")
          .map((change) => change.actorIdentity)
      )
    ),
  ];
  const identityAliases =
    actorIds.length === 0
      ? []
      : await prisma.staffReviewerIdentityAlias.findMany({
          where: {
            partnerId: reviewer.partnerId,
            OR: [{ legacyEmployeeId: { in: actorIds } }, { employeeId: { in: actorIds } }],
          },
          select: { legacyEmployeeId: true, employeeId: true },
        });
  let fullyReviewed = 0;

  const products = items.map((item) => {
    const fieldStates = computeFieldStates(
      rules,
      appendFullPackageDoseDisputeChanges(item, item.catalogFieldChanges),
      identityAliases
    );
    const gate = evaluateGateForItem({
      item,
      extras: {
        photoCount: item.photos.length,
        vibeScores: item.vibeProfile?.scores ?? null,
        strengthOffset: item.strengthOffset
          ? { offset: item.strengthOffset.offset, confirmed: item.strengthOffset.confirmed }
          : null,
      },
      rules,
      fieldStates,
    });
    const tier = urgencyTierFor({ fieldStates, rules, reviewerId: reviewer.employeeId });
    const owed = fieldsOwedBy({ rules, fieldStates, reviewerId: reviewer.employeeId });

    const verifiedCount = reviewableRules.filter(
      (rule) => fieldStates[rule.fieldName]?.state === "confirmed"
    ).length;
    if (verifiedCount === reviewableRules.length) fullyReviewed += 1;

    return {
      id: item.id,
      productName: item.productName,
      brand: item.brandRef?.name ?? item.brand,
      format: item.format,
      photoUrl: item.photos[0]?.url ?? item.photoUrl,
      researchOnly: item.researchOnly,
      urgencyTier: tier,
      urgencyLabel: URGENCY_TIER_LABELS[tier],
      disputedFields: reviewableRules
        .filter((rule) => fieldStates[rule.fieldName]?.state === "disputed")
        .map((rule) => rule.label ?? rule.fieldName),
      fieldsOwedByYou: owed.length,
      verifiedFieldCount: verifiedCount,
      reviewableFieldCount: reviewableRules.length,
      listable: gate.listable,
      listedViaOverride: gate.viaOverride,
      blockerCount: gate.blockers.length,
    };
  });

  products.sort((a, b) => {
    // Explicit rank, not the tier number — disputes (3) lead, then 1, 2, 4.
    const rank = urgencyRank(a.urgencyTier) - urgencyRank(b.urgencyTier);
    if (rank !== 0) return rank;
    return a.productName.localeCompare(b.productName);
  });

  return NextResponse.json({
    success: true,
    data: {
      reviewer: { id: reviewer.employeeId, name: reviewer.employeeName },
      coverage: {
        fullyReviewed,
        total: products.length,
        // "What's left for me"
        owedByYou: products.filter((product) => product.fieldsOwedByYou > 0).length,
      },
      products,
    },
  });
}
