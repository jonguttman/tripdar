/**
 * KEWL-2335 — server-side assembly for the staff catalog review surface.
 *
 * Reads the required-field set from `CatalogFieldVerificationRule` (config data),
 * replays the append-only `CatalogFieldChange` log into per-field verification state,
 * and evaluates the listing gate. Everything here is derived from KEWL-2332's tables;
 * no parallel storage.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CATALOG_FIELD_SPECS,
  CONFIRMED_ABSENT_VALUE,
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

/**
 * Replays the append-only log into per-field state. **Only `accepted` changes count.**
 *
 * KEWL-2457 — this filter is the whole gate, not the `disposition` literal the submit
 * route writes. It used to skip only `rejected`, which meant a `pending` change counted
 * toward its confirmation threshold exactly like an accepted one, reached `confirmed`,
 * and was written through to the live `StoreProductCatalog` column by the same
 * transaction. Marking staff edits `pending` upstream without changing this line is a
 * no-op: the value still reaches a customer with nobody having reviewed it.
 *
 * So: pending is genuinely inert here. It does not set `liveValue`, cannot be the value
 * a teammate "Confirm"s, contributes no confirmation, and can never satisfy the listing
 * gate. It becomes visible only after an admin accepts it, at which point the ledger row
 * flips to `accepted` and this function starts counting it — the same path an
 * accepted-on-arrival answer always took.
 *
 * Pending changes are not lost, just not counted: see `pendingStaffChangesByField()`.
 */
export function computeFieldStates(
  rules: FieldRuleRow[],
  changes: CatalogChangeRow[]
): Record<string, StaffFieldState> {
  const byField = new Map<string, StaffFieldSubmission[]>();
  for (const change of changes) {
    if (change.disposition !== "accepted") continue;
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

/** One staff answer sitting in the admin queue, still invisible to the gate. */
export interface PendingStaffChange {
  id: string;
  fieldName: string;
  previousValue: unknown;
  submittedValue: unknown;
  actorIdentity: string;
  source: string;
  createdAt: Date;
}

type PendingChangeRow = CatalogChangeRow & { id: string; previousValue?: unknown };

/**
 * KEWL-2457 — the staff answers awaiting an admin decision, grouped by field.
 *
 * Deliberately separate from `computeFieldStates()`: these must be *shown* (so a
 * reviewer's answer doesn't appear to vanish, and so they aren't asked the same
 * question again) without being *counted*. Keeping them in a second structure is what
 * makes that split impossible to get wrong by accident — there is no code path where a
 * caller reading field state accidentally picks up a pending value.
 *
 * Brand/import/admin rows are excluded for the same reason `computeStaffFieldState`
 * excludes them: this is the staff audit queue, and the brand queue is KEWL-2331's.
 */
export function pendingStaffChangesByField(
  changes: PendingChangeRow[]
): Record<string, PendingStaffChange[]> {
  const byField: Record<string, PendingStaffChange[]> = {};
  for (const change of changes) {
    if (change.disposition !== "pending") continue;
    if (change.actorType !== "staff") continue;
    if (change.fieldName === REVIEWER_NOTE_FIELD) continue;
    (byField[change.fieldName] ??= []).push({
      id: change.id,
      fieldName: change.fieldName,
      previousValue: change.previousValue ?? null,
      submittedValue: change.submittedValue,
      actorIdentity: change.actorIdentity,
      source: change.source,
      createdAt: change.createdAt,
    });
  }
  for (const list of Object.values(byField)) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  return byField;
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
  /** KEWL-2457 — queued answers count as "reviewed" for urgency, though not for the gate. */
  pendingByField?: Record<string, PendingStaffChange[]>;
}): ProductUrgencyTier {
  const reviewable = input.rules.filter((rule) => rule.tier !== "D");
  let anyoneReviewed = false;
  let thisReviewerReviewed = false;
  let disputed = false;

  for (const rule of reviewable) {
    const pending = input.pendingByField?.[rule.fieldName];
    if (pending && pending.length > 0) {
      anyoneReviewed = true;
      if (reviewerHasPendingAnswer(pending, input.reviewerId)) thisReviewerReviewed = true;
    }
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

/**
 * True when this reviewer has an answer for this field sitting in the admin queue.
 *
 * KEWL-2457 requirement 4 — a reviewer who has already answered must not be asked the
 * same question again just because their answer is awaiting review. Without this the
 * pending change is invisible to `computeFieldStates()` (by design), so the field reads
 * as untouched and the reviewer is nagged to re-enter what they already submitted.
 */
export function reviewerHasPendingAnswer(
  pending: PendingStaffChange[] | undefined,
  reviewerId: string
): boolean {
  return (pending ?? []).some((change) => change.actorIdentity === reviewerId);
}

/** Fields this reviewer still owes on this product — powers "What's left for me". */
export function fieldsOwedBy(input: {
  rules: FieldRuleRow[];
  fieldStates: Record<string, StaffFieldState>;
  reviewerId: string;
  /** KEWL-2457 — a field you have already answered into the queue is not owed. */
  pendingByField?: Record<string, PendingStaffChange[]>;
}): string[] {
  return input.rules
    .filter((rule) => rule.tier !== "D")
    .filter((rule) => {
      if (reviewerHasPendingAnswer(input.pendingByField?.[rule.fieldName], input.reviewerId)) {
        return false;
      }
      const state = input.fieldStates[rule.fieldName];
      return state ? reviewerStillOwesField(state, input.reviewerId) : true;
    })
    .map((rule) => rule.fieldName);
}

/** Reserved log field names that are answers about the product, not catalog columns. */
export const NON_COLUMN_FIELDS = new Set<string>([PHOTO_CHECK_FIELD, REVIEWER_NOTE_FIELD]);

export interface ProjectionRepairResult {
  catalogItemId: string;
  fieldsRecomputed: number;
  cacheRowsChanged: string[];
  columnsChanged: string[];
}

/**
 * Repair path for the derived projections (KEWL-2364).
 *
 * `CatalogFieldChange` is the append-only source of truth; `CatalogFieldVerificationState`
 * and the `StoreProductCatalog` columns are caches derived from it. The submit route
 * writes all three in one transaction, so they should never diverge — but because the
 * ledger alone is authoritative, divergence must be *repairable* rather than merely
 * unlikely. This rebuilds both projections from the log for one item and reports what it
 * had to change; an empty report means the projections were already correct.
 *
 * Safe to run against healthy rows — it is idempotent and never writes to the ledger.
 */
export async function recomputeCatalogItemProjection(
  catalogItemId: string
): Promise<ProjectionRepairResult> {
  const rules = await ensureFieldRules(null);

  const item = await prisma.storeProductCatalog.findUniqueOrThrow({
    where: { id: catalogItemId },
    include: {
      catalogFieldChanges: {
        orderBy: { createdAt: "asc" },
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
      fieldVerificationStates: true,
    },
  });

  const fieldStates = computeFieldStates(rules, item.catalogFieldChanges);
  const existingCache = new Map(
    (item.fieldVerificationStates ?? []).map((row) => [row.fieldName, row])
  );
  const itemRecord = item as unknown as Record<string, unknown>;

  const cacheRowsChanged: string[] = [];
  const columnsChanged: string[] = [];
  const columnUpdates: Record<string, unknown> = {};

  for (const rule of rules) {
    const state = fieldStates[rule.fieldName];
    if (!state) continue;

    const cached = existingCache.get(rule.fieldName);
    const cacheDiverged =
      !cached ||
      cached.state !== state.state ||
      cached.requiredConfirmations !== state.requiredConfirmations ||
      cached.confirmationsCount !== state.confirmationsCount ||
      JSON.stringify(cached.confirmedValue ?? null) !== JSON.stringify(state.confirmedValue ?? null);

    if (cacheDiverged) cacheRowsChanged.push(rule.fieldName);

    if (rule.catalogColumn && state.state === "confirmed") {
      const expected =
        state.confirmedValue === CONFIRMED_ABSENT_VALUE ? null : state.confirmedValue;
      const actual = itemRecord[rule.catalogColumn] ?? null;
      if (JSON.stringify(actual) !== JSON.stringify(expected ?? null)) {
        columnUpdates[rule.catalogColumn] = expected;
        columnsChanged.push(rule.catalogColumn);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const fieldName of cacheRowsChanged) {
      const state = fieldStates[fieldName];
      const payload = {
        state: state.state,
        requiredConfirmations: state.requiredConfirmations,
        confirmationsCount: state.confirmationsCount,
        confirmedValue:
          state.confirmedValue === null || state.confirmedValue === undefined
            ? Prisma.DbNull
            : (state.confirmedValue as Prisma.InputJsonValue),
        reviewedAt: new Date(),
      };
      await tx.catalogFieldVerificationState.upsert({
        where: { catalogItemId_fieldName: { catalogItemId, fieldName } },
        create: { catalogItemId, fieldName, ...payload },
        update: payload,
      });
    }

    if (Object.keys(columnUpdates).length > 0) {
      await tx.storeProductCatalog.update({
        where: { id: catalogItemId },
        data: columnUpdates as never,
      });
    }
  });

  return {
    catalogItemId,
    fieldsRecomputed: rules.length,
    cacheRowsChanged,
    columnsChanged,
  };
}
