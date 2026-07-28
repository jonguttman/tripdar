/**
 * KEWL-2335 — server-side assembly for the staff catalog review surface.
 *
 * Reads the required-field set from `CatalogFieldVerificationRule` (config data),
 * replays the append-only `CatalogFieldChange` log into per-field verification state,
 * and evaluates the listing gate. Everything here is derived from KEWL-2332's tables;
 * no parallel storage.
 */

import { prisma } from "@/lib/prisma";
import {
  CATALOG_FIELD_SPECS,
  PHOTO_CHECK_FIELD,
  REVIEWER_NOTE_FIELD,
  type CatalogFieldSpec,
} from "./catalogFieldSpec";
import {
  computeStaffFieldState,
  reviewerStillOwesField,
  type StaffFieldState,
  type StaffFieldSubmission,
} from "./staffFieldVerification";
import { evaluateListingGate, type GateFieldRule, type ListingGateResult } from "./listingGate";
import type { ReadinessInput } from "./readiness";
import type { CatalogActorType, CatalogFieldSource } from "./catalogProvenance";

export interface FieldRuleRow {
  fieldName: string;
  tier: string;
  requiredConfirmations: number;
  requiresDistinctReviewers: boolean;
  gateRequired: boolean;
  readinessKey: string | null;
  catalogColumn: string | null;
  label: string | null;
  helpText: string | null;
  inputType: string;
  allowsConfirmedAbsent: boolean;
  gateSatisfyingValues: string[];
  sortOrder: number;
}

function specToRow(spec: CatalogFieldSpec): FieldRuleRow {
  return {
    fieldName: spec.fieldName,
    tier: spec.tier,
    requiredConfirmations: spec.requiredConfirmations,
    requiresDistinctReviewers: spec.requiresDistinctReviewers,
    gateRequired: spec.gateRequired,
    readinessKey: spec.readinessKey,
    catalogColumn: spec.catalogColumn,
    label: spec.label,
    helpText: spec.helpText,
    inputType: spec.inputType,
    allowsConfirmedAbsent: spec.allowsConfirmedAbsent,
    gateSatisfyingValues: spec.gateSatisfyingValues,
    sortOrder: spec.sortOrder,
  };
}

/**
 * Seeds the approved Tier A–D set once, then always reads from the DB.
 * Seeding is idempotent and never overwrites an operator's edits.
 */
export async function ensureFieldRules(partnerId: string | null = null): Promise<FieldRuleRow[]> {
  const existing = await prisma.catalogFieldVerificationRule.findMany({
    where: { partnerId },
  });
  const byName = new Map(existing.map((row) => [row.fieldName, row]));
  const missing = CATALOG_FIELD_SPECS.filter((spec) => !byName.has(spec.fieldName));

  if (missing.length > 0) {
    await prisma.catalogFieldVerificationRule.createMany({
      data: missing.map((spec) => ({ partnerId, ...specToRow(spec) })),
      skipDuplicates: true,
    });
  }

  const rows = await prisma.catalogFieldVerificationRule.findMany({
    where: { partnerId, active: true },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((row) => ({
    fieldName: row.fieldName,
    tier: row.tier,
    requiredConfirmations: row.requiredConfirmations,
    requiresDistinctReviewers: row.requiresDistinctReviewers,
    gateRequired: row.gateRequired,
    readinessKey: row.readinessKey,
    catalogColumn: row.catalogColumn,
    label: row.label,
    helpText: row.helpText,
    inputType: row.inputType,
    allowsConfirmedAbsent: row.allowsConfirmedAbsent,
    gateSatisfyingValues: row.gateSatisfyingValues,
    sortOrder: row.sortOrder,
  }));
}

export function ruleToGateRule(rule: FieldRuleRow): GateFieldRule {
  return {
    fieldName: rule.fieldName,
    tier: rule.tier,
    gateRequired: rule.gateRequired,
    readinessKey: rule.readinessKey,
    label: rule.label,
    gateSatisfyingValues: rule.gateSatisfyingValues,
  };
}

export interface CatalogChangeRow {
  fieldName: string;
  submittedValue: unknown;
  actorType: string;
  actorIdentity: string;
  source: string;
  disposition: string;
  createdAt: Date;
}

/** Replays the append-only log into per-field state. Rejected changes are skipped. */
export function computeFieldStates(
  rules: FieldRuleRow[],
  changes: CatalogChangeRow[]
): Record<string, StaffFieldState> {
  const byField = new Map<string, StaffFieldSubmission[]>();
  for (const change of changes) {
    if (change.disposition === "rejected") continue;
    const submission: StaffFieldSubmission = {
      value: change.submittedValue,
      actorType: change.actorType as CatalogActorType,
      actorIdentity: change.actorIdentity,
      source: change.source as CatalogFieldSource,
      createdAt: change.createdAt,
    };
    byField.set(change.fieldName, [...(byField.get(change.fieldName) ?? []), submission]);
  }

  const states: Record<string, StaffFieldState> = {};
  for (const rule of rules) {
    states[rule.fieldName] = computeStaffFieldState({
      submissions: byField.get(rule.fieldName) ?? [],
      rule: {
        requiredConfirmations: rule.requiredConfirmations,
        requiresDistinctReviewers: rule.requiresDistinctReviewers,
      },
    });
  }
  return states;
}

type CatalogItemForGate = {
  format: string;
  brand: string | null;
  brandId: string | null;
  productUnitMg: number | null;
  unitsPerPack: number | null;
  totalDoseMg: number | null;
  onsetMinutes: number | null;
  durationMinutes: number | null;
  brandMicroUnits: number | null;
  brandMiniUnits: number | null;
  brandMacroUnits: number | null;
  brandDoseTiers: unknown;
  photoUrl: string | null;
  activeCompound: string;
  researchOnly: boolean;
  listingOverrideAt: Date | null;
  listingOverrideBy: string | null;
  listingOverrideReason: string | null;
};

export function toReadinessInput(
  item: CatalogItemForGate,
  extras: { photoCount: number; vibeScores: unknown; strengthOffset: { offset: string; confirmed: boolean } | null }
): ReadinessInput {
  return {
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
    photoCount: extras.photoCount,
    vibeScores: extras.vibeScores,
    strengthOffset: extras.strengthOffset,
  };
}

export function evaluateGateForItem(input: {
  item: CatalogItemForGate;
  extras: { photoCount: number; vibeScores: unknown; strengthOffset: { offset: string; confirmed: boolean } | null };
  rules: FieldRuleRow[];
  fieldStates: Record<string, StaffFieldState>;
}): ListingGateResult {
  return evaluateListingGate({
    readiness: toReadinessInput(input.item, input.extras),
    rules: input.rules.map(ruleToGateRule),
    fieldStates: input.fieldStates,
    activeCompound: input.item.activeCompound,
    researchOnly: input.item.researchOnly,
    override: {
      at: input.item.listingOverrideAt,
      by: input.item.listingOverrideBy,
      reason: input.item.listingOverrideReason,
    },
  });
}

/**
 * Loads a product and evaluates the listing gate for it. This is the single entry point
 * activation must call — see the PATCH handler in /api/admin/myco/[id].
 */
export async function loadGateForProduct(catalogItemId: string): Promise<ListingGateResult | null> {
  const rules = await ensureFieldRules(null);
  const item = await prisma.storeProductCatalog.findUnique({
    where: { id: catalogItemId },
    include: {
      vibeProfile: true,
      strengthOffset: true,
      _count: { select: { photos: true } },
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
  if (!item) return null;

  return evaluateGateForItem({
    item,
    extras: {
      photoCount: item._count.photos,
      vibeScores: item.vibeProfile?.scores ?? null,
      strengthOffset: item.strengthOffset
        ? { offset: item.strengthOffset.offset, confirmed: item.strengthOffset.confirmed }
        : null,
    },
    rules,
    fieldStates: computeFieldStates(rules, item.catalogFieldChanges),
  });
}

export type ProductUrgencyTier = 1 | 2 | 3 | 4;

/**
 * Urgency tiers, most urgent first. Tier 3 outranks tier 1 and 2 on purpose:
 * disputed dosing must read louder than a blank.
 */
export function urgencyTierFor(input: {
  fieldStates: Record<string, StaffFieldState>;
  rules: FieldRuleRow[];
  reviewerId: string;
}): ProductUrgencyTier {
  const reviewable = input.rules.filter((rule) => rule.tier !== "D");
  let anyoneReviewed = false;
  let thisReviewerReviewed = false;
  let disputed = false;

  for (const rule of reviewable) {
    const state = input.fieldStates[rule.fieldName];
    if (!state) continue;
    if (state.answeredReviewers.length > 0) anyoneReviewed = true;
    if (state.answeredReviewers.includes(input.reviewerId)) thisReviewerReviewed = true;
    if (state.state === "disputed") disputed = true;
  }

  if (disputed) return 3;
  if (!anyoneReviewed) return 1;
  if (!thisReviewerReviewed) return 2;
  return 4;
}

/**
 * Display order, most urgent first. NOT the numeric tier order: a disputed field (3)
 * outranks a never-reviewed product (1), because disputed dosing must read louder than
 * a blank. Sorting on the tier number alone silently buries disputes.
 */
export const URGENCY_TIER_ORDER: ProductUrgencyTier[] = [3, 1, 2, 4];

export function urgencyRank(tier: ProductUrgencyTier): number {
  return URGENCY_TIER_ORDER.indexOf(tier);
}

export const URGENCY_TIER_LABELS: Record<ProductUrgencyTier, string> = {
  3: "Disputed — needs a tiebreak",
  1: "Nobody has reviewed this",
  2: "You haven't reviewed this",
  4: "You're done here",
};

/** Fields this reviewer still owes on this product — powers "What's left for me". */
export function fieldsOwedBy(input: {
  rules: FieldRuleRow[];
  fieldStates: Record<string, StaffFieldState>;
  reviewerId: string;
}): string[] {
  return input.rules
    .filter((rule) => rule.tier !== "D")
    .filter((rule) => {
      const state = input.fieldStates[rule.fieldName];
      return state ? reviewerStillOwesField(state, input.reviewerId) : true;
    })
    .map((rule) => rule.fieldName);
}

/** Reserved log field names that are answers about the product, not catalog columns. */
export const NON_COLUMN_FIELDS = new Set<string>([PHOTO_CHECK_FIELD, REVIEWER_NOTE_FIELD]);
