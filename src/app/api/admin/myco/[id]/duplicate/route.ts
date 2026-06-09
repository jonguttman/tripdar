import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }

  try {
    const { id } = await params;
    const source = await prisma.storeProductCatalog.findUnique({
      where: { id },
      include: {
        strengthOffset: true,
        vibeProfile: true,
        photos: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!source) {
      return NextResponse.json({ success: false, error: { message: "Source product not found" } }, { status: 404 });
    }

    const duplicated = await prisma.storeProductCatalog.create({
      data: {
        partnerId: source.partnerId,
        productName: `${source.productName} (copy)`,
        format: source.format,
        brand: source.brand,
        brandId: source.brandId,
        strainSlug: source.strainSlug,
        productUnitMg: source.productUnitMg,
        unitsPerPack: source.unitsPerPack,
        totalDoseMg: source.totalDoseMg,
        ingredients: source.ingredients,
        flavors: source.flavors,
        onsetMinutes: source.onsetMinutes,
        durationMinutes: source.durationMinutes,
        brandMicroUnits: source.brandMicroUnits,
        brandMiniUnits: source.brandMiniUnits,
        brandMacroUnits: source.brandMacroUnits,
        brandDoseTiers: source.brandDoseTiers === null ? undefined : source.brandDoseTiers,
        brandDoseInstructions: source.brandDoseInstructions,
        photoUrl: source.photoUrl,
        active: true,
        notes: source.notes,
        strengthOffset: source.strengthOffset
          ? { create: { offset: source.strengthOffset.offset, rationale: source.strengthOffset.rationale } }
          : { create: { offset: "standard", rationale: null } },
        vibeProfile: source.vibeProfile
          ? { create: { scores: source.vibeProfile.scores as object, source: source.vibeProfile.source } }
          : undefined,
        photos: source.photos.length > 0
          ? {
              create: source.photos.map((p) => ({
                url: p.url, tag: p.tag, sortOrder: p.sortOrder,
              })),
            }
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
