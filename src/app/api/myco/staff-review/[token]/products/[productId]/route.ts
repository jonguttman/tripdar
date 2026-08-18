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
  appendFullPackageDoseDisputeChanges,
  computeFieldStates,
  ensureFieldRules,
  evaluateGateForItem,
  type FieldRuleRow,
} from "@/domain/myco/staffReviewService";
import {
  CONFIRMED_ABSENT_VALUE,
  DONT_KNOW_VALUE,
  PHOTO_CHECK_FIELD,
  REVIEWER_NOTE_FIELD,
  isCatalogColumnWriteAllowed,
} from "@/domain/myco/catalogFieldSpec";
import { reviewerStillOwesField } from "@/domain/myco/staffFieldVerification";
import { approvedPhotoCount, photoStatusLabel } from "@/domain/myco/photoVisibility";
import { buildCatalogFieldChange, type CatalogFieldSource } from "@/domain/myco/catalogProvenance";

export const dynamic = "force-dynamic";

const VALID_SOURCES: CatalogFieldSource[] = [
  "packaging",
  "brand-provided",
  "personal-knowledge",
  "unsure",
];
const VALID_ACTIONS = ["confirm", "correct", "fill", "confirmed_absent", "dont_know"] as const;
type ReviewAction = (typeof VALID_ACTIONS)[number];

const PRODUCT_INCLUDE = {
  brandRef: { select: { name: true } },
  // The reviewer sees every photo including pending brand submissions — that is
  // the point of this surface — so this include is deliberately unfiltered. The
  // gate count below is taken from the approved subset only (KEWL-2460).
  photos: { orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }] },
  vibeProfile: true,
  strengthOffset: true,
  catalogFieldChanges: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      fieldName: true,
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

function currentReviewValue(
  item: Record<string, unknown>,
  rule: FieldRuleRow,
  liveValue: unknown
): unknown {
  const columnValue = currentColumnValue(item, rule);
  if (liveValue === null || liveValue === undefined) return columnValue;

  const normalizedLiveValue = normalizeValue(liveValue, rule.inputType);
  if (rule.inputType === "number" && normalizedLiveValue === null && columnValue !== null) {
    return columnValue;
  }

  return liveValue;
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

  const actorIds = [
    ...new Set(
      item.catalogFieldChanges
        .filter((change) => change.actorType === "staff")
        .map((change) => change.actorIdentity)
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
  const fieldStates = computeFieldStates(
    rules,
    appendFullPackageDoseDisputeChanges(item, item.catalogFieldChanges),
    identityAliases
  );
  const gate = evaluateGateForItem({
    item,
    extras: {
      photoCount: approvedPhotoCount(item.photos),
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
      return {
        fieldName: rule.fieldName,
        label: rule.label ?? rule.fieldName,
        helpText: rule.helpText,
        tier: rule.tier,
        inputType: rule.inputType,
        // KEWL-2473: a `readiness` blocker carries no fieldName, so the client needs the
        // rule's readiness key to route "Missing mg per unit" to the card that supplies it.
        readinessKey: rule.readinessKey,
        allowsConfirmedAbsent: rule.allowsConfirmedAbsent,
        requiredConfirmations: state.requiredConfirmations,
        confirmationsCount: state.confirmationsCount,
        state: state.state,
        // The live candidate is what the reviewer must react to. Falling back to the
        // column would show a stale value that "Confirm" would then wrongly agree with.
        currentValue:
          rule.fieldName === PHOTO_CHECK_FIELD
            ? state.liveValue
            : currentReviewValue(itemRecord, rule, state.liveValue),
        competingValues: state.everConflicted ? state.competingValues : [],
        yourAnswer: mine ? mine.submittedValue : null,
        yourAnswerAt: mine ? mine.createdAt : null,
        owedByYou: reviewerStillOwesField(state, reviewer.employeeId),
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
          // Pending brand submissions render here labelled, never as live assets.
          status: photo.status,
          statusLabel: photoStatusLabel(photo.status),
          submissionSource: photo.submissionSource,
        })),
      },
      fields,
      notes,
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
  const priorActorIds = [
    ...new Set(
      item.catalogFieldChanges
        .filter((change) => change.actorType === "staff")
        .map((change) => change.actorIdentity)
    ),
  ];
  const priorIdentityAliases =
    priorActorIds.length === 0
      ? []
      : await prisma.staffReviewerIdentityAlias.findMany({
          where: {
            partnerId: reviewer.partnerId,
            OR: [{ legacyEmployeeId: { in: priorActorIds } }, { employeeId: { in: priorActorIds } }],
          },
          select: { legacyEmployeeId: true, employeeId: true },
        });
  const priorStates = computeFieldStates(
    rules,
    appendFullPackageDoseDisputeChanges(item, item.catalogFieldChanges),
    priorIdentityAliases
  );
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

    // "Confirm" means agreeing with what is on screen. For synthetic numeric disputes,
    // descriptive competing values stay visible, but the submitted value must stay numeric.
    const previousValue = currentReviewValue(itemRecord, rule, priorStates[fieldName]?.liveValue);

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
        // Staff answers are the audit itself — accepted on arrival. Brand submissions
        // stay `pending` for admin triage; that path is KEWL-2331.
        disposition: "accepted",
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
    const refreshedActorIds = [
      ...new Set(
        refreshedItem.catalogFieldChanges
          .filter((change) => change.actorType === "staff")
          .map((change) => change.actorIdentity)
      ),
    ];
    const refreshedIdentityAliases =
      refreshedActorIds.length === 0
        ? []
        : await tx.staffReviewerIdentityAlias.findMany({
            where: {
              partnerId: reviewer.partnerId,
              OR: [
                { legacyEmployeeId: { in: refreshedActorIds } },
                { employeeId: { in: refreshedActorIds } },
              ],
            },
            select: { legacyEmployeeId: true, employeeId: true },
          });
    const states = computeFieldStates(
      rules,
      appendFullPackageDoseDisputeChanges(refreshedItem, refreshedItem.catalogFieldChanges),
      refreshedIdentityAliases
    );
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
        if (!isCatalogColumnWriteAllowed(rule.catalogColumn)) {
          console.warn("[staff-review] Skipping disallowed catalog column projection", {
            catalogItemId: item.id,
            fieldName: rule.fieldName,
            catalogColumn: rule.catalogColumn,
            source: "staffReviewProductSubmit",
          });
          continue;
        }

        updates[rule.catalogColumn] =
          state.confirmedValue === CONFIRMED_ABSENT_VALUE ? null : state.confirmedValue;
      }
    }

    if (Object.keys(updates).length > 0) {
      await tx.storeProductCatalog.update({
        where: { id: item.id },
        // Prisma's generated type would reject arbitrary StoreProductCatalog keys
        // such as `active`; this dynamic-column cast is safe only after allowlist filtering.
        data: updates as never,
      });
    }

    return { refreshed: refreshedItem, fieldStates: states, columnUpdates: updates };
  });

  const gate = evaluateGateForItem({
    // The projection merge is runtime-safe, but TypeScript cannot prove the result
    // still satisfies the exact catalog item shape expected by evaluateGateForItem.
    item: { ...refreshed, ...(columnUpdates as object) } as never,
    extras: {
      photoCount: approvedPhotoCount(refreshed.photos),
      vibeScores: refreshed.vibeProfile?.scores ?? null,
      strengthOffset: refreshed.strengthOffset
        ? { offset: refreshed.strengthOffset.offset, confirmed: refreshed.strengthOffset.confirmed }
        : null,
    },
    rules,
    fieldStates,
  });

  return NextResponse.json({
    success: true,
    data: {
      saved: changeRows.length,
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
