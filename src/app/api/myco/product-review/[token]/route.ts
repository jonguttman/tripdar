import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  effectiveAssignmentStatus,
  hashReviewToken,
  hashUserAgent,
  isTerminalReviewStatus,
  pointsForReview,
} from "@/domain/myco/employeeReviews";
import { evaluateCatalogAccessToken, hashCatalogAccessToken } from "@/domain/myco/catalogTokens";

const REQUIRED_EFFECT_FIELDS = [
  "clarityCognition",
  "moodSocial",
  "visualPattern",
  "somatic",
  "energyDirection",
  "depthDirection",
] as const;

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseIntRange(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

function parseFloatPositive(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}

async function loadAssignment(token: string) {
  const tokenHash = hashCatalogAccessToken(token);
  return prisma.mycoEmployeeReviewAssignment.findFirst({
    where: {
      OR: [
        { tokenHash: hashReviewToken(token) },
        { accessToken: { tokenHash } },
      ],
    },
    include: {
      accessToken: true,
      employee: { select: { id: true, name: true, email: true, optedOut: true } },
      response: true,
      catalogItem: {
        include: {
          partner: { select: { name: true } },
          brandRef: { select: { name: true } },
          photos: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
        },
      },
    },
  });
}

function invalidTokenResponse(reason: string) {
  const status = reason === "expired" || reason === "revoked" ? 410 : 404;
  return NextResponse.json(
    { success: false, error: { message: "Review link not found" } },
    { status }
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const assignment = await loadAssignment(token);
    if (!assignment || assignment.employee.optedOut) {
      return NextResponse.json(
        { success: false, error: { message: "Review link not found" } },
        { status: 404 }
      );
    }
    if (assignment.accessToken) {
      const tokenState = evaluateCatalogAccessToken(assignment.accessToken, "staff_review");
      if (!tokenState.ok) return invalidTokenResponse(tokenState.reason);
    }

    const status = effectiveAssignmentStatus(assignment.status, assignment.expiresAt);
    if (status === "assigned") {
      const openedAt = assignment.openedAt ?? new Date();
      await prisma.$transaction([
        prisma.mycoEmployeeReviewAssignment.update({
          where: { id: assignment.id },
          data: { status: "opened", openedAt },
        }),
        ...(assignment.accessToken && !assignment.accessToken.openedAt
          ? [
              prisma.catalogAccessToken.update({
                where: { id: assignment.accessToken.id },
                data: { openedAt },
              }),
            ]
          : []),
      ]);
    }

    return NextResponse.json({
      success: true,
      data: {
        assignment: {
          id: assignment.id,
          status: status === "assigned" ? "opened" : status,
          expiresAt: assignment.expiresAt,
          employeeName: assignment.employee.name,
        },
        product: {
          id: assignment.catalogItem.id,
          partnerName: assignment.catalogItem.partner.name,
          productName: assignment.catalogItem.productName,
          brand: assignment.catalogItem.brandRef?.name ?? assignment.catalogItem.brand,
          format: assignment.catalogItem.format,
          sku: assignment.catalogItem.sku,
          doseUnitMg: assignment.catalogItem.productUnitMg,
          unitsPerPack: assignment.catalogItem.unitsPerPack,
          flavors: assignment.catalogItem.flavors,
          ingredients: assignment.catalogItem.ingredients,
          notes: assignment.catalogItem.notes,
          photos: assignment.catalogItem.photos.map((photo) => ({
            id: photo.id,
            url: photo.url,
            tag: photo.tag,
            kind: photo.kind,
            isPrimary: photo.isPrimary,
          })),
        },
        response: assignment.response,
      },
    });
  } catch (error) {
    console.error("Error loading employee product review:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to load review" } },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const assignment = await loadAssignment(token);
    if (!assignment || assignment.employee.optedOut) {
      return NextResponse.json(
        { success: false, error: { message: "Review link not found" } },
        { status: 404 }
      );
    }
    if (assignment.accessToken) {
      const tokenState = evaluateCatalogAccessToken(assignment.accessToken, "staff_review");
      if (!tokenState.ok) return invalidTokenResponse(tokenState.reason);
    }

    const status = effectiveAssignmentStatus(assignment.status, assignment.expiresAt);
    if (isTerminalReviewStatus(status)) {
      return NextResponse.json(
        { success: false, error: { message: "This review has already been completed or expired" } },
        { status: 409 }
      );
    }

    const body = await request.json();
    const knowsProduct = body.knowsProduct === true;
    const effectAxes = {
      clarityCognition: parseIntRange(body.clarityCognition, 0, 100),
      moodSocial: parseIntRange(body.moodSocial, 0, 100),
      visualPattern: parseIntRange(body.visualPattern, 0, 100),
      somatic: parseIntRange(body.somatic, 0, 100),
      energyDirection: parseIntRange(body.energyDirection, 0, 100),
      depthDirection: parseIntRange(body.depthDirection, 0, 100),
    };
    const complete = REQUIRED_EFFECT_FIELDS.every((field) => effectAxes[field] !== null);
    if (knowsProduct && !complete) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Known-product reviews require all six effect axes from 0 to 100" },
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const timely = !assignment.expiresAt || assignment.expiresAt.getTime() >= now.getTime();
    const finalStatus = knowsProduct ? "submitted" : "not_familiar";
    const pointsAwarded = pointsForReview({
      status: finalStatus,
      opened: Boolean(assignment.openedAt),
      timely,
      complete,
    });

    const response = await prisma.$transaction(async (tx) => {
      const created = await tx.mycoEmployeeProductReview.create({
        data: {
          assignmentId: assignment.id,
          catalogItemId: assignment.catalogItemId,
          employeeId: assignment.employeeId,
          knowsProduct,
          clarityCognition: knowsProduct ? effectAxes.clarityCognition : null,
          moodSocial: knowsProduct ? effectAxes.moodSocial : null,
          visualPattern: knowsProduct ? effectAxes.visualPattern : null,
          somatic: knowsProduct ? effectAxes.somatic : null,
          energyDirection: knowsProduct ? effectAxes.energyDirection : null,
          depthDirection: knowsProduct ? effectAxes.depthDirection : null,
          doseUnitsTried: knowsProduct ? parseFloatPositive(body.doseUnitsTried) : null,
          doseUnitLabel: knowsProduct ? cleanText(body.doseUnitLabel) : null,
          onsetMinutes: knowsProduct ? parseIntRange(body.onsetMinutes, 1, 24 * 60) : null,
          durationMinutes: knowsProduct ? parseIntRange(body.durationMinutes, 1, 48 * 60) : null,
          flavor: knowsProduct ? cleanText(body.flavor) : null,
          confidence: knowsProduct ? parseIntRange(body.confidence, 1, 5) : null,
          familiarity: knowsProduct ? cleanText(body.familiarity) : null,
          notes: cleanText(body.notes),
          pointsAwarded,
          userAgentHash: hashUserAgent(request.headers.get("user-agent")),
        },
      });
      await tx.mycoEmployeeReviewAssignment.update({
        where: { id: assignment.id },
        data: { status: finalStatus, submittedAt: now, openedAt: assignment.openedAt ?? now },
      });
      await tx.mycoEmployee.update({
        where: { id: assignment.employeeId },
        data: {
          points: { increment: pointsAwarded },
          streak: { increment: 1 },
          lastRespondedAt: now,
        },
      });
      return created;
    });

    return NextResponse.json({ success: true, data: { response, pointsAwarded } }, { status: 201 });
  } catch (error: unknown) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      return NextResponse.json(
        { success: false, error: { message: "This review has already been submitted" } },
        { status: 409 }
      );
    }
    console.error("Error submitting employee product review:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to submit review" } },
      { status: 500 }
    );
  }
}
