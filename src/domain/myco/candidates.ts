/**
 * Recommendation candidate loader — the single code path that decides which
 * products may ever be shown to a customer.
 *
 * Gate: active, not archived, not research-only, recommendation-ready per
 * computeReadiness, and not explicitly unsupported by the current
 * psilocybin-family recommender.
 * Legacy unknown/blank/missing compounds retain product identity but cannot
 * emit dose guidance.
 * Server-only (imports prisma).
 *
 * ---------------------------------------------------------------------------
 * KEWL-2447 — read-time listing-gate plumbing (fix for KEWL-2445).
 *
 * The listing gate (KEWL-2335) is enforced at *activation* time only. Nothing
 * re-evaluated it for products that were already `active` when the gate shipped,
 * so six products are live to customers today with `activeCompound = 'unknown'`,
 * zero staff verification, and no override. This module now evaluates the gate at
 * *read* time as well, so the gate is a standing condition rather than a one-shot
 * check at the moment of activation.
 *
 * What happens to a gate-blocked product is a POLICY question that is not ours to
 * answer — see LISTING_GATE_POSTURE below. This change is deliberately inert: the
 * gate is computed and reported, and nothing is dropped or stripped, until a human
 * selects a posture.
 * ---------------------------------------------------------------------------
 */

import { prisma } from "@/lib/prisma";
import { isCandidacyExcludedCompound } from "@/domain/recommendation-engine/doseBasis";
import { computeReadiness } from "./readiness";
import { normalizeVibeScores } from "./vibes";
import {
  computeFieldStates,
  ensureFieldRules,
  evaluateGateForItem,
  type CatalogChangeRow,
  type FieldRuleRow,
} from "./staffReviewService";
import type { ListingGateResult } from "./listingGate";
import type { ProductCandidate } from "./scoring";
import type { StrengthOffsetValue } from "./dose";

type CatalogItemWithRelations = Awaited<ReturnType<typeof fetchActiveCatalog>>[number];

function fetchActiveCatalog(partnerId: string) {
  return prisma.storeProductCatalog.findMany({
    // `researchOnly: false` is correct under every posture below and is independent
    // of the rest of this change. Until now it was harmless only by luck — the one
    // research-only row (G23 "Isolated Solution") happens to also be inactive.
    // `evaluateListingGate` treats research-only as a *hard* blocker that no override
    // can clear, so excluding it structurally here matches the gate's own intent.
    where: { partnerId, active: true, archivedAt: null, researchOnly: false },
    include: {
      vibeProfile: true,
      strengthOffset: true,
      photos: { orderBy: { sortOrder: "asc" }, take: 1 },
      brandRef: true,
      // Real photo count for the gate's readiness input. The candidate readiness call
      // below keeps using `photos.length` (capped at 1 by `take: 1`); the two are
      // equivalent for readiness, whose only photo test is `photoCount === 0`.
      _count: { select: { photos: true } },
    },
  });
}

/* -------------------------------------------------------------------------- */
/*  THE POSTURE DECISION POINT — parked, awaiting Jon (KEWL-2445)              */
/* -------------------------------------------------------------------------- */

/**
 * What the customer path does with a product that fails the listing gate.
 *
 * The three real options were framed on KEWL-2445 and are NOT interchangeable —
 * they trade customer harm against catalog coverage differently:
 *
 *  - `"suppress"` — the product stays in results, but its unverified fields are
 *    stripped. Maximum coverage, and the customer never sees an unverified claim.
 *    NOTE: the field-level stripping mechanism itself is out of scope for
 *    KEWL-2447 (it follows Jon's answer); this posture currently marks the
 *    candidate `"list_stripped"` so the response layer can act on it.
 *  - `"override"` — the product is dropped unless Jon has explicitly force-listed
 *    it via `listingOverrideAt`/`By`/`Reason`. Safety-first with a human escape
 *    hatch.
 *  - `"dark"` — the product is dropped, full stop; not even an override lists it.
 *    Strictest reading; makes `listingOverrideAt` inert on the customer path.
 *
 * `"inert"` is NOT one of the three. It is the shipping default for this PR: the
 * gate is evaluated and reported on every candidate, but the result changes
 * nothing about what the customer sees. That makes this PR a pure no-op against
 * today's production data, which is exactly what KEWL-2447 asked for — build the
 * plumbing, park the policy.
 *
 * >>> Selecting a posture is a ONE-LINE change to the constant below. <<<
 * Do not add posture logic anywhere else; `dispositionFor()` is the only place
 * that reads it.
 */
export type ListingGatePosture = "inert" | "suppress" | "override" | "dark";

export const LISTING_GATE_POSTURE: ListingGatePosture = "inert";

/** What the customer path should do with one evaluated candidate. */
export type CandidateDisposition = "list" | "list_stripped" | "drop";

/**
 * The single drop/strip/allow decision. Pure, so it is exhaustively testable
 * without a database.
 *
 * `gate.listable` is already true when a product is listable *via* a valid
 * override, which is why `"override"` can just read `listable` directly. `"dark"`
 * has to additionally reject `viaOverride`, since under that posture an override
 * carries no weight on the customer path.
 */
export function dispositionFor(
  gate: ListingGateResult,
  posture: ListingGatePosture = LISTING_GATE_POSTURE
): CandidateDisposition {
  switch (posture) {
    case "inert":
      // Gate computed and reported; enforcement parked. No behaviour change.
      return "list";
    case "suppress":
      return gate.listable ? "list" : "list_stripped";
    case "override":
      // `listable` already honours a valid override (`isValidOverride`).
      return gate.listable ? "list" : "drop";
    case "dark":
      // An override is deliberately not honoured here.
      return gate.listable && !gate.viaOverride ? "list" : "drop";
  }
}

/* -------------------------------------------------------------------------- */

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

/**
 * Loads every `CatalogFieldChange` for the whole candidate set in ONE query and
 * replays it per item.
 *
 * We batch `CatalogFieldChange` — the append-only source of truth that
 * `computeFieldStates()` replays and that `loadGateForProduct()` reads — rather than
 * the denormalized `CatalogFieldVerificationState` cache. Reading the cache here
 * would let the customer path and the staff/admin path disagree whenever the cache
 * is stale, which is the same class of bug as KEWL-2445 itself.
 *
 * Deliberately NOT `loadGateForProduct()`: that is a per-item `findUnique` and would
 * be N+1 on the customer hot path.
 */
async function loadFieldStatesByItem(
  itemIds: string[],
  rules: FieldRuleRow[]
): Promise<Map<string, ReturnType<typeof computeFieldStates>>> {
  const byItem = new Map<string, CatalogChangeRow[]>();
  for (const id of itemIds) byItem.set(id, []);

  if (itemIds.length > 0) {
    const changes = await prisma.catalogFieldChange.findMany({
      where: { catalogItemId: { in: itemIds } },
      select: {
        catalogItemId: true,
        fieldName: true,
        submittedValue: true,
        actorType: true,
        actorIdentity: true,
        source: true,
        disposition: true,
        createdAt: true,
      },
    });
    for (const change of changes) {
      byItem.get(change.catalogItemId)?.push(change);
    }
  }

  const states = new Map<string, ReturnType<typeof computeFieldStates>>();
  for (const id of itemIds) {
    states.set(id, computeFieldStates(rules, byItem.get(id) ?? []));
  }
  return states;
}

/** A candidate plus the listing-gate verdict that was computed for it. */
export interface EvaluatedCandidate {
  candidate: ProductCandidate;
  gate: ListingGateResult;
  disposition: CandidateDisposition;
}

/**
 * The full read-time evaluation: candidacy + readiness + listing gate + posture.
 *
 * Returns every product that clears candidacy and readiness, each carrying its gate
 * result and disposition — including the ones the active posture would drop, so that
 * callers (and tests, and the demotion tooling) can see what the gate decided rather
 * than just what survived it.
 */
export async function evaluateRecommendableProducts(
  partnerId: string,
  posture: ListingGatePosture = LISTING_GATE_POSTURE
): Promise<EvaluatedCandidate[]> {
  const items = await fetchActiveCatalog(partnerId);

  // Candidacy + readiness first, so the gate work is only done for products that
  // could actually be shown.
  const eligible: CatalogItemWithRelations[] = [];
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

    eligible.push(item);
  }

  if (eligible.length === 0) return [];

  // Two queries total for the whole candidate set, regardless of its size.
  const rules = await ensureFieldRules(null);
  const fieldStatesByItem = await loadFieldStatesByItem(
    eligible.map((item) => item.id),
    rules
  );

  const evaluated: EvaluatedCandidate[] = [];
  for (const item of eligible) {
    const candidate = toCandidate(item);
    if (!candidate) continue;

    const gate = evaluateGateForItem({
      item,
      extras: {
        photoCount: item._count.photos,
        vibeScores: item.vibeProfile?.scores ?? null,
        strengthOffset: item.strengthOffset
          ? { offset: item.strengthOffset.offset, confirmed: item.strengthOffset.confirmed }
          : null,
      },
      rules,
      fieldStates: fieldStatesByItem.get(item.id) ?? {},
    });

    evaluated.push({ candidate, gate, disposition: dispositionFor(gate, posture) });
  }

  return evaluated;
}

/**
 * The customer-facing selector. Unchanged signature; under the shipping `"inert"`
 * posture it returns exactly what it returned before this change.
 */
export async function getRecommendableProducts(partnerId: string): Promise<ProductCandidate[]> {
  const evaluated = await evaluateRecommendableProducts(partnerId);
  return evaluated
    .filter((entry) => entry.disposition !== "drop")
    .map((entry) => entry.candidate);
}
