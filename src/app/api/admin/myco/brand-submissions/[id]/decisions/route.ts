/**
 * KEWL-2368 — field/asset-level brand-submission decisions.
 *
 * Accepting a product field promotes the already-written pending CatalogFieldChange
 * by setting its disposition and then projects that accepted value onto the catalog
 * column when a column exists. Rejection also stays on the same change-log row.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Decision = "accepted" | "rejected";

interface FieldDecision {
  id: string;
  decision: Decision;
  reason?: string | null;
}

interface PhotoDecision {
  id: string;
  decision: Decision;
  reason?: string | null;
}

interface BrandFieldDecision {
  fieldName: string;
  decision: Decision;
  reason?: string | null;
}

interface BrandAssetDecision {
  kind: "logo" | "artwork";
  decision: Decision;
  reason?: string | null;
}

const PRODUCT_FIELD_TO_COLUMN: Record<string, string> = {
  productName: "productName",
  sku: "sku",
  format: "format",
  productUnitMg: "productUnitMg",
  unitsPerPack: "unitsPerPack",
  ingredients: "ingredients",
  flavors: "flavors",
  onsetMinutes: "onsetMinutes",
  durationMinutes: "durationMinutes",
  brandDoseInstructions: "brandDoseInstructions",
  active: "active",
};

const BRAND_FIELD_TO_COLUMN: Record<string, string> = {
  shortDescription: "shortDescription",
  websiteUrl: "websiteUrl",
  supportEmail: "supportEmail",
  primaryColor: "primaryColor",
  secondaryColor: "secondaryColor",
  accentColor: "accentColor",
};

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }
  return session.user.email;
}

function cleanReason(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}

function isDecision(value: unknown): value is Decision {
  return value === "accepted" || value === "rejected";
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function parseFieldDecisions(value: unknown): FieldDecision[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): FieldDecision | null => {
      const input = asObject(entry);
      const id = typeof input.id === "string" ? input.id : "";
      if (!id || !isDecision(input.decision)) return null;
      return { id, decision: input.decision, reason: cleanReason(input.reason) };
    })
    .filter((entry): entry is FieldDecision => Boolean(entry));
}

function parsePhotoDecisions(value: unknown): PhotoDecision[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): PhotoDecision | null => {
      const input = asObject(entry);
      const id = typeof input.id === "string" ? input.id : "";
      if (!id || !isDecision(input.decision)) return null;
      return { id, decision: input.decision, reason: cleanReason(input.reason) };
    })
    .filter((entry): entry is PhotoDecision => Boolean(entry));
}

function parseBrandFieldDecisions(value: unknown): BrandFieldDecision[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): BrandFieldDecision | null => {
      const input = asObject(entry);
      const fieldName = typeof input.fieldName === "string" ? input.fieldName : "";
      if (!fieldName || !isDecision(input.decision)) return null;
      return { fieldName, decision: input.decision, reason: cleanReason(input.reason) };
    })
    .filter((entry): entry is BrandFieldDecision => Boolean(entry));
}

function parseBrandAssetDecisions(value: unknown): BrandAssetDecision[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): BrandAssetDecision | null => {
      const input = asObject(entry);
      const kind = input.kind === "logo" || input.kind === "artwork" ? input.kind : null;
      if (!kind || !isDecision(input.decision)) return null;
      return { kind, decision: input.decision, reason: cleanReason(input.reason) };
    })
    .filter((entry): entry is BrandAssetDecision => Boolean(entry));
}

function decisionPatch(decision: Decision, reviewer: string, reason: string | null, now: Date) {
  return {
    disposition: decision,
    dispositionBy: reviewer,
    dispositionAt: now,
    dispositionReason: reason,
  };
}

function mergeReviewDecision(
  payload: Record<string, unknown>,
  group: "brandFields" | "brandAssets",
  key: string,
  decision: Decision,
  reviewer: string,
  reason: string | null,
  now: Date,
) {
  const reviewDecisions = asObject(payload.reviewDecisions);
  const currentGroup = asObject(reviewDecisions[group]);
  payload.reviewDecisions = {
    ...reviewDecisions,
    [group]: {
      ...currentGroup,
      [key]: {
        decision,
        reason,
        dispositionBy: reviewer,
        dispositionAt: now.toISOString(),
      },
    },
  };
}

function pendingPayloadKeys(payload: Record<string, unknown>, group: "brandFields" | "brandAssets") {
  const source = group === "brandFields" ? asObject(payload.brandFields) : asObject(payload.brandAssets);
  const decisions = asObject(asObject(payload.reviewDecisions)[group]);
  return Object.keys(source).filter((key) => {
    if (group === "brandAssets" && !source[key]) return false;
    return asObject(decisions[key]).decision === undefined;
  });
}

function assetUrl(asset: unknown): string | null {
  const input = asObject(asset);
  const displayUrl = typeof input.displayUrl === "string" ? input.displayUrl : null;
  const url = typeof input.url === "string" ? input.url : null;
  return displayUrl ?? url;
}

async function applyFieldDecision(tx: any, submissionId: string, decision: FieldDecision, reviewer: string, now: Date) {
  const change = await tx.catalogFieldChange.findFirst({
    where: { id: decision.id, brandSubmissionId: submissionId },
    select: {
      id: true,
      catalogItemId: true,
      fieldName: true,
      submittedValue: true,
      actorType: true,
      source: true,
      disposition: true,
    },
  });
  if (!change) throw new Error(`Field change ${decision.id} is not part of this submission`);
  if (change.disposition !== "pending") throw new Error(`Field change ${decision.id} is already reviewed`);

  await tx.catalogFieldChange.update({
    where: { id: change.id },
    data: decisionPatch(decision.decision, reviewer, decision.reason ?? null, now),
  });

  if (decision.decision !== "accepted") return { fieldName: change.fieldName, wroteColumn: false };

  const column = PRODUCT_FIELD_TO_COLUMN[change.fieldName];
  if (column) {
    await tx.storeProductCatalog.update({
      where: { id: change.catalogItemId },
      data: { [column]: change.submittedValue } as never,
    });
  }

  const currentState = await tx.catalogFieldVerificationState.findUnique({
    where: { catalogItemId_fieldName: { catalogItemId: change.catalogItemId, fieldName: change.fieldName } },
    select: { id: true, state: true, requiredConfirmations: true },
  });

  if (currentState?.state === "confirmed") {
    await tx.catalogFieldVerificationState.update({
      where: { id: currentState.id },
      data: {
        state: "needs_re_review",
        confirmationsCount: 0,
        confirmedValue: toJsonInput(change.submittedValue),
        lastAcceptedChangeId: change.id,
        reviewedAt: now,
      },
    });
  }

  return { fieldName: change.fieldName, wroteColumn: Boolean(column) };
}

async function applyPhotoDecision(tx: any, submissionId: string, decision: PhotoDecision, reviewer: string, now: Date) {
  const photo = await tx.productPhoto.findFirst({
    where: { id: decision.id, brandSubmissionId: submissionId },
    select: { id: true, status: true },
  });
  if (!photo) throw new Error(`Photo ${decision.id} is not part of this submission`);
  if (photo.status !== "pending") throw new Error(`Photo ${decision.id} is already reviewed`);

  await tx.productPhoto.update({
    where: { id: photo.id },
    data:
      decision.decision === "accepted"
        ? { status: "approved", approvedBy: reviewer, approvedAt: now }
        : {
            status: "rejected",
            rejectedBy: reviewer,
            rejectedAt: now,
            rejectionReason: decision.reason ?? "rejected by brand submission review",
          },
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const fieldDecisions = parseFieldDecisions(body.fieldDecisions);
    const photoDecisions = parsePhotoDecisions(body.photoDecisions);
    const brandFieldDecisions = parseBrandFieldDecisions(body.brandFieldDecisions);
    const brandAssetDecisions = parseBrandAssetDecisions(body.brandAssetDecisions);

    if (!fieldDecisions.length && !photoDecisions.length && !brandFieldDecisions.length && !brandAssetDecisions.length) {
      return NextResponse.json({ success: false, error: { message: "No review decisions supplied" } }, { status: 400 });
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const submission = await tx.brandSubmission.findUnique({
        where: { id },
        include: {
          brand: { select: { id: true, socialHandles: true } },
          fieldChanges: { select: { id: true, disposition: true } },
          photos: { select: { id: true, status: true } },
        },
      });
      if (!submission) throw new Error("Brand submission not found");

      const payload = asObject(submission.payload);
      const brandFields = asObject(payload.brandFields);
      const brandAssets = asObject(payload.brandAssets);
      const acceptedFields: Awaited<ReturnType<typeof applyFieldDecision>>[] = [];

      for (const decision of fieldDecisions) {
        acceptedFields.push(await applyFieldDecision(tx, id, decision, auth, now));
      }

      for (const decision of photoDecisions) {
        await applyPhotoDecision(tx, id, decision, auth, now);
      }

      const brandUpdate: Record<string, unknown> = {};
      for (const decision of brandFieldDecisions) {
        if (!Object.prototype.hasOwnProperty.call(brandFields, decision.fieldName)) {
          throw new Error(`Brand field ${decision.fieldName} is not part of this submission`);
        }
        mergeReviewDecision(payload, "brandFields", decision.fieldName, decision.decision, auth, decision.reason ?? null, now);
        if (decision.decision === "accepted") {
          if (decision.fieldName === "socialHandles") {
            brandUpdate.socialHandles = {
              ...asObject(submission.brand.socialHandles),
              ...asObject(brandFields.socialHandles),
            };
          } else {
            const column = BRAND_FIELD_TO_COLUMN[decision.fieldName];
            if (column) brandUpdate[column] = brandFields[decision.fieldName] ?? null;
          }
        }
      }

      for (const decision of brandAssetDecisions) {
        if (!Object.prototype.hasOwnProperty.call(brandAssets, decision.kind)) {
          throw new Error(`Brand asset ${decision.kind} is not part of this submission`);
        }
        mergeReviewDecision(payload, "brandAssets", decision.kind, decision.decision, auth, decision.reason ?? null, now);
        if (decision.decision === "accepted") {
          const url = assetUrl(brandAssets[decision.kind]);
          if (url) brandUpdate[decision.kind === "logo" ? "logoUrl" : "artworkUrl"] = url;
        }
      }

      if (Object.keys(brandUpdate).length > 0) {
        await tx.brand.update({
          where: { id: submission.brandId },
          data: brandUpdate,
        });
      }

      const pendingFieldIds = new Set(fieldDecisions.map((decision) => decision.id));
      const pendingPhotoIds = new Set(photoDecisions.map((decision) => decision.id));
      const fieldStillPending = submission.fieldChanges.some(
        (change) => change.disposition === "pending" && !pendingFieldIds.has(change.id),
      );
      const photoStillPending = submission.photos.some(
        (photo) => photo.status === "pending" && !pendingPhotoIds.has(photo.id),
      );
      const payloadStillPending =
        pendingPayloadKeys(payload, "brandFields").length > 0 ||
        pendingPayloadKeys(payload, "brandAssets").length > 0;
      const hasAccepted =
        fieldDecisions.some((decision) => decision.decision === "accepted") ||
        photoDecisions.some((decision) => decision.decision === "accepted") ||
        brandFieldDecisions.some((decision) => decision.decision === "accepted") ||
        brandAssetDecisions.some((decision) => decision.decision === "accepted");

      const status = fieldStillPending || photoStillPending || payloadStillPending
        ? "pending"
        : hasAccepted
          ? "reviewed"
          : "rejected";

      await tx.brandSubmission.update({
        where: { id },
        data: {
          status,
          reviewedAt: status === "pending" ? submission.reviewedAt : now,
          reviewedBy: status === "pending" ? submission.reviewedBy : auth,
          payload: payload as Prisma.InputJsonValue,
        },
      });

      return {
        status,
        acceptedFields: acceptedFields.filter((entry) => entry.wroteColumn).map((entry) => entry.fieldName),
        fieldDecisions: fieldDecisions.length,
        photoDecisions: photoDecisions.length,
        brandFieldDecisions: brandFieldDecisions.length,
        brandAssetDecisions: brandAssetDecisions.length,
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save review decisions";
    const status = message === "Brand submission not found" ? 404 : 400;
    return NextResponse.json({ success: false, error: { message } }, { status });
  }
}
