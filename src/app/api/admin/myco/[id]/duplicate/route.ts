/**
 * Duplicate a product as a NEW RECIPE.
 *
 * Same recipe + multiple flavors = ONE product with flavors[]; duplication
 * exists for recipe variants (different dose, ingredients, format, strain).
 * Therefore the copy deliberately does NOT carry over:
 *  - flavors      — the new recipe declares its own variants
 *  - photos       — wrong-package photos reaching customers is the worst miss
 *  - offset confirmation — must be re-confirmed against the new recipe
 *  - vibe source "flywheel" — community validation isn't inheritable
 *  - tester votes / outcome reports / recommendation results — observations
 *    of the source recipe (never copied; enforced by relations)
 * The duplicate lands in "Needs attention" until photos + confirmation are
 * redone — that friction is intentional.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { prisma } from "@/lib/prisma";
import { resolveProductForAdmin } from "@/domain/myco/adminAccess";
import { normalizeStrainSlug } from "@/domain/strain/data";
import { sanitizeDoseProvenanceInput } from "../../doseProvenance";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const doseProvenance = sanitizeDoseProvenanceInput(body);
    if (!doseProvenance.ok) {
      return NextResponse.json(
        { success: false, error: { message: doseProvenance.message } },
        { status: 400 }
      );
    }

    const access = await resolveProductForAdmin(session.user.email, id);
    if (!access.ok) {
      return NextResponse.json(
        { success: false, error: { message: access.message } },
        { status: access.status }
      );
    }

    const source = await prisma.storeProductCatalog.findUnique({
      where: { id },
      include: {
        strengthOffset: true,
        vibeProfile: true,
      },
    });

    if (!source) {
      return NextResponse.json({ success: false, error: { message: "Source product not found" } }, { status: 404 });
    }

    const strainSlug = source.strainSlug ? normalizeStrainSlug(source.strainSlug) : null;
    if (source.strainSlug && !strainSlug) {
      return NextResponse.json(
        { success: false, error: { message: `Unknown strainSlug "${source.strainSlug}"` } },
        { status: 400 }
      );
    }

    const duplicated = await prisma.storeProductCatalog.create({
      data: {
        partnerId: source.partnerId,
        productName: `${source.productName} (copy)`,
        format: source.format,
        brand: source.brand,
        brandId: source.brandId,
        strainSlug,
        productUnitMg: source.productUnitMg,
        unitsPerPack: source.unitsPerPack,
        totalDoseMg: source.totalDoseMg,
        ingredients: source.ingredients,
        flavors: [],
        onsetMinutes: source.onsetMinutes,
        durationMinutes: source.durationMinutes,
        brandMicroUnits: source.brandMicroUnits,
        brandMiniUnits: source.brandMiniUnits,
        brandMacroUnits: source.brandMacroUnits,
        brandDoseTiers: source.brandDoseTiers === null ? undefined : source.brandDoseTiers,
        brandDoseInstructions: source.brandDoseInstructions,
        photoUrl: null,
        packageMaterialMassMg:
          "packageMaterialMassMg" in doseProvenance.data
            ? (doseProvenance.data.packageMaterialMassMg as number | null)
            : source.packageMaterialMassMg,
        unitMaterialMassMg:
          "unitMaterialMassMg" in doseProvenance.data
            ? (doseProvenance.data.unitMaterialMassMg as number | null)
            : source.unitMaterialMassMg,
        materialMassBasis:
          "materialMassBasis" in doseProvenance.data
            ? (doseProvenance.data.materialMassBasis as string | null)
            : source.materialMassBasis,
        materialMassSource:
          "materialMassSource" in doseProvenance.data
            ? (doseProvenance.data.materialMassSource as string | null)
            : source.materialMassSource,
        activeCompound:
          "activeCompound" in doseProvenance.data
            ? (doseProvenance.data.activeCompound as string)
            : source.activeCompound,
        activeCompoundSource:
          "activeCompoundSource" in doseProvenance.data
            ? (doseProvenance.data.activeCompoundSource as string | null)
            : source.activeCompoundSource,
        active: true,
        notes: source.notes,
        strengthOffset: {
          create: {
            offset: source.strengthOffset?.offset ?? "standard",
            rationale: source.strengthOffset?.rationale ?? null,
            confirmed: false,
          },
        },
        vibeProfile: source.vibeProfile
          ? { create: { scores: source.vibeProfile.scores as object, source: "admin" } }
          : undefined,
      },
      include: {
        strengthOffset: true,
        vibeProfile: true,
        photos: { orderBy: { sortOrder: "asc" } },
        brandRef: true,
      },
    });

    return NextResponse.json({ success: true, data: { product: duplicated } }, { status: 201 });
  } catch (err) {
    console.error("[duplicate] error:", err);
    return NextResponse.json({ success: false, error: { message: "Failed to duplicate product" } }, { status: 500 });
  }
}
