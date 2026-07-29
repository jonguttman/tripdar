/**
 * KEWL-2335 — Jon-only force-list override.
 *
 * Never a silent boolean. Requires a super-admin, requires a typed reason, and writes
 * an admin assertion into KEWL-2332's append-only change log alongside the columns.
 * DELETE lifts the override and is logged the same way.
 *
 * Research-only products cannot be force-listed — that blocker is hard by design.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/domain/auth/config";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/domain/auth/role";
import { loadGateForProduct } from "@/domain/myco/staffReviewService";
import { LISTING_OVERRIDE_FIELD } from "@/domain/myco/catalogFieldSpec";

export const dynamic = "force-dynamic";

const MIN_REASON_LENGTH = 12;

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }
  const role = await getUserRole(session.user.email);
  if (role !== "super_admin") {
    return NextResponse.json(
      {
        success: false,
        error: { message: "Only Jon can force-list a product that fails the gate." },
      },
      { status: 403 }
    );
  }
  return session.user.email;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { reason?: unknown; activate?: unknown };
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (reason.length < MIN_REASON_LENGTH) {
    return NextResponse.json(
      {
        success: false,
        error: { message: `Type a real reason (at least ${MIN_REASON_LENGTH} characters).` },
      },
      { status: 400 }
    );
  }

  const item = await prisma.storeProductCatalog.findUnique({
    where: { id },
    select: { id: true, researchOnly: true, active: true },
  });
  if (!item) {
    return NextResponse.json({ success: false, error: { message: "Product not found" } }, { status: 404 });
  }
  if (item.researchOnly) {
    return NextResponse.json(
      {
        success: false,
        error: { message: "Research-only products can never be listed. Clear the research-only flag first." },
      },
      { status: 422 }
    );
  }

  const now = new Date();
  const before = await loadGateForProduct(id);

  await prisma.$transaction([
    prisma.storeProductCatalog.update({
      where: { id },
      data: {
        listingOverrideAt: now,
        listingOverrideBy: auth,
        listingOverrideReason: reason,
        ...(body.activate === true ? { active: true } : {}),
      },
    }),
    prisma.catalogFieldChange.create({
      data: {
        catalogItemId: id,
        fieldName: LISTING_OVERRIDE_FIELD,
        previousValue: Prisma.DbNull,
        submittedValue: {
          action: "force_list",
          reason,
          activated: body.activate === true,
          blockersAtOverride: (before?.blockers ?? []).map((blocker) => blocker.label),
        },
        actorType: "admin",
        actorIdentity: auth,
        source: "personal-knowledge",
        disposition: "accepted",
        dispositionBy: auth,
        dispositionAt: now,
        dispositionReason: reason,
      },
    }),
  ]);

  const after = await loadGateForProduct(id);
  return NextResponse.json({
    success: true,
    data: {
      overriddenBy: auth,
      overriddenAt: now,
      reason,
      listable: after?.listable ?? false,
      viaOverride: after?.viaOverride ?? false,
      blockersAtOverride: (before?.blockers ?? []).map((blocker) => blocker.label),
    },
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const now = new Date();

  const existing = await prisma.storeProductCatalog.findUnique({
    where: { id },
    select: { listingOverrideReason: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: { message: "Product not found" } }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.storeProductCatalog.update({
      where: { id },
      data: {
        listingOverrideAt: null,
        listingOverrideBy: null,
        listingOverrideReason: null,
        // Lifting the override cannot leave a gate-failing product live.
        active: false,
      },
    }),
    prisma.catalogFieldChange.create({
      data: {
        catalogItemId: id,
        fieldName: LISTING_OVERRIDE_FIELD,
        previousValue: existing.listingOverrideReason ?? Prisma.DbNull,
        submittedValue: { action: "clear_override" },
        actorType: "admin",
        actorIdentity: auth,
        source: "personal-knowledge",
        disposition: "accepted",
        dispositionBy: auth,
        dispositionAt: now,
      },
    }),
  ]);

  return NextResponse.json({ success: true, data: { cleared: true } });
}
