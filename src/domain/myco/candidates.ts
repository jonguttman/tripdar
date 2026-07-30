/**
 * Recommendation candidate loader — the single code path that decides which
 * products may ever be shown to a customer.
 *
 * Gate: active, not archived, recommendation-ready per computeReadiness, and
 * not explicitly unsupported by the current psilocybin-family recommender.
 * Legacy unknown/blank/missing compounds retain product identity but cannot
 * emit dose guidance.
 * Server-only (imports prisma).
 */

import { prisma } from "@/lib/prisma";
import { isCandidacyExcludedCompound } from "@/domain/recommendation-engine/doseBasis";
import { computeReadiness } from "./readiness";
import { APPROVED_PHOTO_WHERE } from "./photoVisibility";
import { normalizeVibeScores } from "./vibes";
import type { ProductCandidate } from "./scoring";
import type { StrengthOffsetValue } from "./dose";

type CatalogItemWithRelations = Awaited<ReturnType<typeof fetchActiveCatalog>>[number];

function fetchActiveCatalog(partnerId: string) {
  return prisma.storeProductCatalog.findMany({
    where: { partnerId, active: true, archivedAt: null },
    include: {
      vibeProfile: true,
      strengthOffset: true,
      // Approved only: a pending brand-portal photo must never reach a customer
      // and must never satisfy the readiness photo gate below (KEWL-2460).
      photos: { where: APPROVED_PHOTO_WHERE, orderBy: { sortOrder: "asc" }, take: 1 },
      brandRef: true,
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
      activeCompound: item.activeCompound,
      productUnitMg: item.productUnitMg,
      brandDoseTiers: item.brandDoseTiers,
      brandMicroUnits: item.brandMicroUnits,
      brandMiniUnits: item.brandMiniUnits,
      brandMacroUnits: item.brandMacroUnits,
    },
  };
}

export async function getRecommendableProducts(partnerId: string): Promise<ProductCandidate[]> {
  const items = await fetchActiveCatalog(partnerId);

  const candidates: ProductCandidate[] = [];
  for (const item of items) {
    if (isCandidacyExcludedCompound(item.activeCompound)) continue;

    const readiness = computeReadiness({
      format: item.format,
      brand: item.brand,
      brandId: item.brandId,
      productUnitMg: item.productUnitMg,
      unitsPerPack: item.unitsPerPack,
      totalDoseMg: item.totalDoseMg,
      onsetMinutes: item.onsetMinutes,
      durationMinutes: item.durationMinutes,
      brandMicroUnits: item.brandMicroUnits,
      brandMiniUnits: item.brandMiniUnits,
      brandMacroUnits: item.brandMacroUnits,
      brandDoseTiers: item.brandDoseTiers,
      photoUrl: item.photoUrl,
      photoCount: item.photos.length,
      vibeScores: item.vibeProfile?.scores ?? null,
      strengthOffset: item.strengthOffset
        ? { offset: item.strengthOffset.offset, confirmed: item.strengthOffset.confirmed }
        : null,
    });
    if (!readiness.ready) continue;

    const candidate = toCandidate(item);
    if (candidate) candidates.push(candidate);
  }

  return candidates;
}
