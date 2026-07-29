/**
 * KEWL-2335 — product detail and incremental submit.
 *
 * GET  — every field we hold, with the photo and this reviewer's own prior answers.
 * POST — saves one or more field answers immediately. Staff do this in short bursts
 *        behind a counter, so nothing waits for a "submit the whole product" step.
 *
 * Writes go to KEWL-2332's append-only `CatalogFieldChange`; `CatalogFieldVerificationState`
 * is a derived cache recomputed from that log after every write.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireReviewer, REVIEWER_SESSION_COOKIE } from "@/domain/myco/staffReviewAuth";
import {
  computeFieldStates,
  ensureFieldRules,
  evaluateGateForItem,
  pendingStaffChangesByField,
  reviewerHasPendingAnswer,
  type FieldRuleRow,
} from "@/domain/myco/staffReviewService";
import {
  CONFIRMED_ABSENT_VALUE,
  DONT_KNOW_VALUE,
  PHOTO_CHECK_FIELD,
  REVIEWER_NOTE_FIELD,
} from "@/domain/myco/catalogFieldSpec";
import { reviewerStillOwesField } from "@/domain/myco/staffFieldVerification";
import { buildCatalogFieldChange, type CatalogFieldSource } from "@/domain/myco/catalogProvenance";
import { computeDoseGuidance, type StrengthOffsetValue } from "@/domain/myco/dose";
import { hasMeaningfulVibeProfile, normalizeVibeScores, topVibes } from "@/domain/myco/vibes";
import { computeReadiness } from "@/domain/myco/readiness";
import {
  isCandidacyExcludedCompound,
  isSupportedActiveCompound,
} from "@/domain/recommendation-engine/doseBasis";

export const dynamic = "force-dynamic";

/**
 * KEWL-2458 — the customer-display preview is rendered from values computed HERE,
 * never from raw dose inputs sent to the browser.
 *
 * The dose panel is the reason. `computeDoseGuidance()` is the guarded formatter: it
 * returns null when the active compound is unsupported or the brand ladder is absent,
 * and KEWL-2346 / KEWL-2428 exist because an unguarded unit count is a real safety
 * hazard. Computing it server-side and shipping only the result means the preview
 * *cannot* derive a unit count — the client never receives `brandDoseTiers`,
 * `brandMicro/Mini/MacroUnits`, or the mass basis. Do not "helpfully" add them to the
 * payload so the card looks more complete; that re-creates the hazard on a surface
 * with no guard, and staff would read it as authoritative.
 *
 * The dose panel a customer sees varies with their own experience level and depth.
 * A staff preview has neither, so it is pinned to one labelled representative
 * setting and the client says so rather than implying the panel is fixed.
 */
const PREVIEW_SAMPLE_EXPERIENCE = "experienced" as const;
const PREVIEW_SAMPLE_INTENSITY = "moderate" as const;

const VALID_SOURCES: CatalogFieldSource[] = [
  "packaging",
  "brand-provided",
  "personal-knowledge",
  "unsure",
];
const VALID_ACTIONS = ["confirm", "correct", "fill", "confirmed_absent", "dont_know"] as const;
type ReviewAction = (typeof VALID_ACTIONS)[number];

/**
 * KEWL-2457 — which staff answers are *changes* to the record, and therefore have to
 * wait for Jon rather than going live on arrival.
 *
 * Jon, 2026-07-29: "Have them fill it out and when they make a change I want to review it."
 * The split is on whether the answer mutates the product record, not on how much typing
 * it took:
 *
 *  - `fill` writes a value into an empty field — a change.
 *  - `correct` replaces a value already on the record — a change.
 *  - `confirmed_absent` clears the column to null — a change. It is the one that reads
 *    like a non-answer and isn't; "not on the package" deletes data.
 *  - `confirm` agrees with what is already there and adds a confirmation. It cannot
 *    introduce a value nobody has seen, so it keeps flowing as it always did — that is
 *    the peer-review mechanism, not an edit.
 *  - `dont_know` is not an answer at all and never counts toward anything.
 *
 * Reviewer notes are log-only (no `catalogColumn`), so they cannot reach a customer and
 * do not need a queue; holding them would only delay a teammate reading them.
 */
const CHANGE_ACTIONS = new Set<ReviewAction>(["fill", "correct", "confirmed_absent"]);

function dispositionForAction(action: ReviewAction): "pending" | "accepted" {
  return CHANGE_ACTIONS.has(action) ? "pending" : "accepted";
}

const PRODUCT_INCLUDE = {
  brandRef: { select: { name: true } },
  photos: { orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }] },
  vibeProfile: true,
  strengthOffset: true,
  _count: { select: { photos: true } },
  catalogFieldChanges: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      fieldName: true,
      previousValue: true,
      submittedValue: true,
      actorType: true,
      actorIdentity: true,
      source: true,
      disposition: true,
      createdAt: true,
    },
  },
};

/** Prisma needs `DbNull` rather than `null` for a nullable Json column. */
function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined
    ? Prisma.DbNull
    : (value as Prisma.InputJsonValue);
}

/** The value currently stored on the catalog row for a field, if it maps to a column. */
function currentColumnValue(item: Record<string, unknown>, rule: FieldRuleRow): unknown {
  if (!rule.catalogColumn) return null;
  return item[rule.catalogColumn] ?? null;
}

/** Normalises by input type so "250" and 250 never read as a disagreement. */
function normalizeValue(raw: unknown, inputType: string): unknown {
  if (inputType === "number") {
    if (raw === null || raw === undefined || raw === "") return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (inputType === "list") {
    const items = Array.isArray(raw)
      ? raw
      : typeof raw === "string"
        ? raw.split(",")
        : [];
    return items
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  }
  if (typeof raw === "string") return raw.trim();
  return raw;
}

type PreviewItem = Prisma.StoreProductCatalogGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

/**
 * Build the customer-display preview for one catalog row, using the same functions
 * the real recommendation path uses so the preview cannot drift into fiction.
 *
 * `fieldName` tags exist so the client can turn any rendered element into a jump
 * target for the audit field that controls it (KEWL-2458 requirement 2).
 */
function buildPreview(item: PreviewItem) {
  const vibeScores = normalizeVibeScores(item.vibeProfile?.scores ?? null);
  const strengthOffset = (item.strengthOffset?.offset as StrengthOffsetValue | undefined) ?? "standard";

  // The identical call the customer path makes (myco/scoring.ts). Returns null when
  // the guard rejects the compound or the brand ladder is missing — that null is the
  // safety behaviour, so it is passed through untouched rather than filled in.
  const doseGuidance = computeDoseGuidance(
    {
      format: item.format,
      activeCompound: item.activeCompound,
      productUnitMg: item.productUnitMg,
      brandDoseTiers: item.brandDoseTiers,
      brandMicroUnits: item.brandMicroUnits,
      brandMiniUnits: item.brandMiniUnits,
      brandMacroUnits: item.brandMacroUnits,
      strengthOffset,
      strengthRationale: item.strengthOffset?.rationale ?? null,
    },
    PREVIEW_SAMPLE_EXPERIENCE,
    PREVIEW_SAMPLE_INTENSITY
  );

  // Why the panel is absent, so staff see a cause rather than a blank space.
  const hasBrandLadder =
    (Array.isArray(item.brandDoseTiers) && item.brandDoseTiers.length > 0) ||
    Boolean(item.brandMicroUnits || item.brandMiniUnits || item.brandMacroUnits);
  let doseSuppressedReason: string | null = null;
  let doseSuppressedField: string | null = null;
  if (!doseGuidance) {
    if (!isSupportedActiveCompound(item.activeCompound)) {
      doseSuppressedReason =
        "No dose panel: the active compound is not one this recommender can dose for.";
      doseSuppressedField = "activeCompound";
    } else if (!hasBrandLadder) {
      doseSuppressedReason =
        "No dose panel: this brand has no dose ladder set, so there is no starting point to show.";
      doseSuppressedField = null;
    } else {
      doseSuppressedReason = "No dose panel for this product.";
    }
  }

  // The recommender's own gate, which is NOT the staff listing gate — see the
  // `recommendable` note in the client. A product can pass one and fail the other.
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
    photoCount: item._count.photos,
    vibeScores: item.vibeProfile?.scores ?? null,
    strengthOffset: item.strengthOffset
      ? { offset: item.strengthOffset.offset, confirmed: item.strengthOffset.confirmed }
      : null,
  });

  return {
    photoUrl: item.photos[0]?.url ?? item.photoUrl,
    brandName: item.brandRef?.name ?? item.brand,
    productName: item.productName,
    format: item.format,
    strainSlug: item.strainSlug,
    flavors: item.flavors,
    onsetMinutes: item.onsetMinutes,
    durationMinutes: item.durationMinutes,
    keyVibes: vibeScores ? topVibes(vibeScores) : [],
    // Deliberately `hasMeaningfulVibeProfile`, not `Boolean(vibeScores)`:
    // `normalizeVibeScores` returns an all-zero vector for any object, so a profile row
    // holding junk keys would otherwise read as present here while the recommender
    // counts it missing. The preview must agree with the gate, not with the row.
    hasVibeProfile: hasMeaningfulVibeProfile(item.vibeProfile?.scores ?? null),
    doseGuidance,
    doseSuppressedReason,
    doseSuppressedField,
    doseSample: {
      experienceLevel: PREVIEW_SAMPLE_EXPERIENCE,
      intensity: PREVIEW_SAMPLE_INTENSITY,
    },
    // A compound the recommender refuses outright — the product is never a candidate
    // regardless of how complete the audit is.
    candidacyExcluded: isCandidacyExcludedCompound(item.activeCompound),
    recommendable: {
      ready: readiness.ready,
      missing: readiness.missing,
      warnings: readiness.warnings,
    },
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; productId: string }> }
) {
  const { token, productId } = await params;
  const reviewer = await requireReviewer(token, request.cookies.get(REVIEWER_SESSION_COOKIE)?.value);
  if (!reviewer.ok) return reviewer.response;

  const rules = await ensureFieldRules(null);
  const item = await prisma.storeProductCatalog.findFirst({
    where: { id: productId, partnerId: reviewer.partnerId, archivedAt: null },
    include: PRODUCT_INCLUDE,
  });
  if (!item) {
    return NextResponse.json(
      { success: false, error: { message: "Product not found." } },
      { status: 404 }
    );
  }

  const fieldStates = computeFieldStates(rules, item.catalogFieldChanges);
  const pendingByField = pendingStaffChangesByField(item.catalogFieldChanges);
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
    fieldStates,
  });

  const itemRecord = item as unknown as Record<string, unknown>;
  const fields = rules
    .filter((rule) => rule.tier !== "D")
    .map((rule) => {
      const state = fieldStates[rule.fieldName];
      const mine = [...item.catalogFieldChanges]
        .reverse()
        .find(
          (change) =>
            change.fieldName === rule.fieldName &&
            change.actorType === "staff" &&
            change.actorIdentity === reviewer.employeeId
        );
      // KEWL-2457 — queued edits, shown but never counted. `yourPendingValue` is what
      // stops a reviewer's answer from appearing to vanish; the count tells them a
      // teammate has also answered without leaking who.
      const pending = pendingByField[rule.fieldName] ?? [];
      const yourPending = pending.find(
        (change) => change.actorIdentity === reviewer.employeeId
      );
      return {
        fieldName: rule.fieldName,
        label: rule.label ?? rule.fieldName,
        helpText: rule.helpText,
        tier: rule.tier,
        inputType: rule.inputType,
        allowsConfirmedAbsent: rule.allowsConfirmedAbsent,
        requiredConfirmations: state.requiredConfirmations,
        confirmationsCount: state.confirmationsCount,
        state: state.state,
        // The live candidate is what the reviewer must react to. Falling back to the
        // column would show a stale value that "Confirm" would then wrongly agree with.
        currentValue:
          rule.fieldName === PHOTO_CHECK_FIELD
            ? state.liveValue
            : (state.liveValue ?? currentColumnValue(itemRecord, rule)),
        competingValues: state.everConflicted ? state.competingValues : [],
        yourAnswer: mine ? mine.submittedValue : null,
        yourAnswerAt: mine ? mine.createdAt : null,
        pendingCount: pending.length,
        yourPendingValue: yourPending ? yourPending.submittedValue : null,
        yourPendingAt: yourPending ? yourPending.createdAt : null,
        owedByYou:
          reviewerHasPendingAnswer(pending, reviewer.employeeId)
            ? false
            : reviewerStillOwesField(state, reviewer.employeeId),
      };
    });

  const notes = item.catalogFieldChanges
    .filter((change) => change.fieldName === REVIEWER_NOTE_FIELD)
    .map((change) => ({
      note: change.submittedValue,
      createdAt: change.createdAt,
      byYou: change.actorIdentity === reviewer.employeeId,
    }));

  return NextResponse.json({
    success: true,
    data: {
      reviewer: { id: reviewer.employeeId, name: reviewer.employeeName },
      product: {
        id: item.id,
        productName: item.productName,
        brand: item.brandRef?.name ?? item.brand,
        format: item.format,
        sku: item.sku,
        researchOnly: item.researchOnly,
        photos: item.photos.map((photo) => ({
          id: photo.id,
          url: photo.url,
          tag: photo.tag,
          isPrimary: photo.isPrimary,
        })),
      },
      fields,
      notes,
      preview: buildPreview(item),
      gate: {
        listable: gate.listable,
        viaOverride: gate.viaOverride,
        blockers: gate.blockers,
        verifiedFieldCount: gate.verifiedFieldCount,
        requiredFieldCount: gate.requiredFieldCount,
      },
    },
  });
}

interface AnswerInput {
  fieldName?: unknown;
  action?: unknown;
  value?: unknown;
  source?: unknown;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; productId: string }> }
) {
  const { token, productId } = await params;
  const reviewer = await requireReviewer(token, request.cookies.get(REVIEWER_SESSION_COOKIE)?.value);
  if (!reviewer.ok) return reviewer.response;

  const body = (await request.json().catch(() => ({}))) as {
    answers?: AnswerInput[];
    note?: unknown;
  };
  const answers = Array.isArray(body.answers) ? body.answers : [];
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (answers.length === 0 && !note) {
    return NextResponse.json(
      { success: false, error: { message: "Nothing to save." } },
      { status: 400 }
    );
  }

  const rules = await ensureFieldRules(null);
  const rulesByName = new Map(rules.map((rule) => [rule.fieldName, rule]));

  const item = await prisma.storeProductCatalog.findFirst({
    where: { id: productId, partnerId: reviewer.partnerId, archivedAt: null },
    include: PRODUCT_INCLUDE,
  });
  if (!item) {
    return NextResponse.json(
      { success: false, error: { message: "Product not found." } },
      { status: 404 }
    );
  }

  const itemRecord = item as unknown as Record<string, unknown>;
  const priorStates = computeFieldStates(rules, item.catalogFieldChanges);
  const changeRows: ReturnType<typeof buildCatalogFieldChange>[] = [];

  for (const answer of answers) {
    const fieldName = typeof answer.fieldName === "string" ? answer.fieldName : "";
    const rule = rulesByName.get(fieldName);
    if (!rule || rule.tier === "D") {
      return NextResponse.json(
        { success: false, error: { message: `Unknown field: ${fieldName}` } },
        { status: 400 }
      );
    }
    const action = answer.action as ReviewAction;
    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { success: false, error: { message: `Unknown action: ${String(answer.action)}` } },
        { status: 400 }
      );
    }
    const source = VALID_SOURCES.includes(answer.source as CatalogFieldSource)
      ? (answer.source as CatalogFieldSource)
      : "unsure";

    // "Confirm" means agreeing with what is on screen, which is the live candidate from
    // the log — NOT the catalog column, which lags until a field reaches its threshold.
    const previousValue =
      priorStates[fieldName]?.liveValue ?? currentColumnValue(itemRecord, rule);

    let submittedValue: unknown;
    if (action === "dont_know") {
      submittedValue = DONT_KNOW_VALUE;
    } else if (action === "confirmed_absent") {
      if (!rule.allowsConfirmedAbsent) {
        return NextResponse.json(
          { success: false, error: { message: `${rule.label ?? fieldName} cannot be marked absent.` } },
          { status: 400 }
        );
      }
      submittedValue = CONFIRMED_ABSENT_VALUE;
    } else if (action === "confirm") {
      // Confirming means agreeing with what is on screen. The server resolves the value
      // so a stale client cannot silently confirm something different.
      submittedValue = normalizeValue(previousValue, rule.inputType);
      if (
        submittedValue === null ||
        submittedValue === "" ||
        (Array.isArray(submittedValue) && submittedValue.length === 0)
      ) {
        return NextResponse.json(
          { success: false, error: { message: `${rule.label ?? fieldName} has no value to confirm.` } },
          { status: 400 }
        );
      }
    } else {
      submittedValue = normalizeValue(answer.value, rule.inputType);
      if (
        submittedValue === null ||
        submittedValue === "" ||
        (Array.isArray(submittedValue) && submittedValue.length === 0)
      ) {
        return NextResponse.json(
          { success: false, error: { message: `${rule.label ?? fieldName} needs a value.` } },
          { status: 400 }
        );
      }
    }

    changeRows.push(
      buildCatalogFieldChange({
        fieldName,
        previousValue,
        submittedValue,
        actorType: "staff",
        actorIdentity: reviewer.employeeId,
        source,
        // KEWL-2457: staff answers are no longer accepted on arrival. A change to the
        // record queues for Jon (see CHANGE_ACTIONS); a confirmation flows as before.
        disposition: dispositionForAction(action),
      })
    );
  }

  if (note) {
    changeRows.push(
      buildCatalogFieldChange({
        fieldName: REVIEWER_NOTE_FIELD,
        previousValue: null,
        submittedValue: note,
        actorType: "staff",
        actorIdentity: reviewer.employeeId,
        source: "personal-knowledge",
        disposition: "accepted",
      })
    );
  }

  const touched = new Set(changeRows.map((row) => row.fieldName));

  // KEWL-2364: the ledger append, the derived verification cache, and the catalog column
  // projection are one atomic unit. Partially applied, they would leave the cache and the
  // columns disagreeing with the append-only log that is supposed to be the source of
  // truth — and the gate reads the projection. `recomputeCatalogItemProjection()` in
  // staffReviewService.ts is the matching repair path if a row is ever found diverged.
  const { refreshed, fieldStates, columnUpdates } = await prisma.$transaction(async (tx) => {
    await tx.catalogFieldChange.createMany({
      data: changeRows.map((row) => ({
        ...row,
        catalogItemId: item.id,
        previousValue: toJsonInput(row.previousValue),
        submittedValue: toJsonInput(row.submittedValue),
      })),
    });

    // Recompute from the log (never from the request) and refresh the derived cache.
    const refreshedItem = await tx.storeProductCatalog.findUniqueOrThrow({
      where: { id: item.id },
      include: PRODUCT_INCLUDE,
    });
    const states = computeFieldStates(rules, refreshedItem.catalogFieldChanges);
    const updates: Record<string, unknown> = {};

    for (const fieldName of touched) {
      const rule = rulesByName.get(fieldName);
      if (!rule) continue;
      const state = states[fieldName];
      if (!state) continue;

      await tx.catalogFieldVerificationState.upsert({
        where: { catalogItemId_fieldName: { catalogItemId: item.id, fieldName } },
        create: {
          catalogItemId: item.id,
          fieldName,
          state: state.state,
          requiredConfirmations: state.requiredConfirmations,
          confirmationsCount: state.confirmationsCount,
          confirmedValue: toJsonInput(state.confirmedValue),
          reviewedAt: new Date(),
        },
        update: {
          state: state.state,
          requiredConfirmations: state.requiredConfirmations,
          confirmationsCount: state.confirmationsCount,
          confirmedValue: toJsonInput(state.confirmedValue),
          reviewedAt: new Date(),
        },
      });

      // A field that reaches `confirmed` writes through to the catalog column — that is
      // the point of the audit. "Confirmed absent" clears the column rather than storing
      // the sentinel.
      if (rule.catalogColumn && state.state === "confirmed") {
        updates[rule.catalogColumn] =
          state.confirmedValue === CONFIRMED_ABSENT_VALUE ? null : state.confirmedValue;
      }
    }

    if (Object.keys(updates).length > 0) {
      await tx.storeProductCatalog.update({
        where: { id: item.id },
        data: updates as never,
      });
    }

    return { refreshed: refreshedItem, fieldStates: states, columnUpdates: updates };
  });

  const gate = evaluateGateForItem({
    item: { ...refreshed, ...(columnUpdates as object) } as never,
    extras: {
      photoCount: refreshed._count.photos,
      vibeScores: refreshed.vibeProfile?.scores ?? null,
      strengthOffset: refreshed.strengthOffset
        ? { offset: refreshed.strengthOffset.offset, confirmed: refreshed.strengthOffset.confirmed }
        : null,
    },
    rules,
    fieldStates,
  });

  // KEWL-2457 — the client has to be able to say "sent for review" rather than "saved",
  // so the response reports which of the just-written rows are queued. Read off the rows
  // actually built, not re-derived from the action, so the two can never disagree.
  const queuedFields = changeRows
    .filter((row) => row.disposition === "pending")
    .map((row) => row.fieldName);

  return NextResponse.json({
    success: true,
    data: {
      saved: changeRows.length,
      queuedForReview: queuedFields,
      fieldStates: Object.fromEntries(
        [...touched].map((fieldName) => [
          fieldName,
          {
            state: fieldStates[fieldName]?.state,
            confirmationsCount: fieldStates[fieldName]?.confirmationsCount,
            requiredConfirmations: fieldStates[fieldName]?.requiredConfirmations,
          },
        ])
      ),
      gate: { listable: gate.listable, blockers: gate.blockers.length },
    },
  });
}
