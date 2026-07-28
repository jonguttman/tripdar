/**
 * Recommendation candidate loader — the single code path that decides which
 * products may ever be shown to a customer.
 *
 * Gate: active, not archived, AND listable under the staff verification gate.
 * Server-only (imports prisma).
 */

import { prisma } from "@/lib/prisma";
import { normalizeVibeScores } from "./vibes";
import type { ProductCandidate } from "./scoring";
import type { StrengthOffsetValue } from "./dose";
import {
  computeFieldStates,
  ensureFieldRules,
  evaluateGateForItem,
} from "./staffReviewService";

type CatalogItemWithRelations = Awaited<ReturnType<typeof fetchActiveCatalog>>[number];

function fetchActiveCatalog(partnerId: string) {
  return prisma.storeProductCatalog.findMany({
    where: { partnerId, active: true, archivedAt: null },
    include: {
      vibeProfile: true,
      strengthOffset: true,
      photos: { orderBy: { sortOrder: "asc" }, take: 1 },
      brandRef: true,
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
  });
}

function toCandidate(item: CatalogItemWithRelations): ProductCandidate | null {
  const vibeScores = normalizeVibeScores(item.vibeProfile?.scores ?? null);
  if (!vibeScores) return null;

  return {
    id: item.id,
    productName: item.productName,
    format: item.format,
    brandName: item.brandRef?.name ?? item.brand,
    strainSlug: item.strainSlug,
    photoUrl: item.photos[0]?.url ?? item.photoUrl,
    ingredients: item.ingredients,
    flavors: item.flavors,
    onsetMinutes: item.onsetMinutes,
    durationMinutes: item.durationMinutes,
    brandDoseInstructions: item.brandDoseInstructions,
    vibeScores,
    strengthOffset: (item.strengthOffset?.offset as StrengthOffsetValue | undefined) ?? "standard",
    strengthRationale: item.strengthOffset?.rationale ?? null,
    dose: {
      format: item.format,
      productUnitMg: item.productUnitMg,
      brandDoseTiers: item.brandDoseTiers,
      brandMicroUnits: item.brandMicroUnits,
      brandMiniUnits: item.brandMiniUnits,
      brandMacroUnits: item.brandMacroUnits,
    },
  };
}

export async function getRecommendableProducts(partnerId: string): Promise<ProductCandidate[]> {
  const [items, rules] = await Promise.all([
    fetchActiveCatalog(partnerId),
    ensureFieldRules(null),
  ]);

  const candidates: ProductCandidate[] = [];
  for (const item of items) {
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
      fieldStates: computeFieldStates(rules, item.catalogFieldChanges),
    });
    if (!gate.listable) continue;

    const candidate = toCandidate(item);
    if (candidate) candidates.push(candidate);
  }

  return candidates;
}
