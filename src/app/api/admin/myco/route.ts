/**
 * Store-facing Myco admin API.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/domain/auth/role";

const VALID_FORMATS = ["capsule", "edible", "dried", "tincture", "other"] as const;
const VALID_OFFSETS = ["standard", "stronger", "lighter"] as const;

type ProductFormat = (typeof VALID_FORMATS)[number];
type StrengthOffset = (typeof VALID_OFFSETS)[number];

async function requireAuth() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json(
      { success: false, error: { message: "Unauthorized" } },
      { status: 401 }
    );
  }

  return session;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseFormat(value: unknown): ProductFormat | null {
  return typeof value === "string" && VALID_FORMATS.includes(value as ProductFormat)
    ? (value as ProductFormat)
    : null;
}

function parseOffset(value: unknown): StrengthOffset {
  return typeof value === "string" && VALID_OFFSETS.includes(value as StrengthOffset)
    ? (value as StrengthOffset)
    : "standard";
}

function parsePositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

function parsePositiveIntOrNull(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
}

async function resolvePartnerForUser(email: string, requestedPartnerId: string | null) {
  if (requestedPartnerId) {
    return prisma.partner.findUnique({ where: { id: requestedPartnerId } });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (user?.partnerId) {
    return prisma.partner.findUnique({ where: { id: user.partnerId } });
  }

  const defaultPartner = await prisma.partner.findFirst({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });

  if (defaultPartner && user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { partnerId: defaultPartner.id },
    });
  }

  return defaultPartner;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const email = auth.user!.email!;
    const userRole = await getUserRole(email);
    const partnerId = request.nextUrl.searchParams.get("partnerId");
    const selectedPartner = await resolvePartnerForUser(email, partnerId);
    const [partners, brands] = await Promise.all([
      prisma.partner.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          subdomain: true,
          contactInfo: true,
          mycoWelcomeMessage: true,
          active: true,
        },
      }),
      prisma.brand.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true },
      }),
    ]);

    if (!selectedPartner) {
      return NextResponse.json({
        success: true,
        data: { partners, partner: null, products: [], brands, userRole },
      });
    }

    const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "1";

    const [partner, products] = await Promise.all([
      prisma.partner.findUnique({
        where: { id: selectedPartner.id },
        select: {
          id: true,
          name: true,
          subdomain: true,
          contactInfo: true,
          mycoWelcomeMessage: true,
          active: true,
        },
      }),
      prisma.storeProductCatalog.findMany({
        where: {
          partnerId: selectedPartner.id,
          ...(includeArchived ? {} : { archivedAt: null }),
        },
        include: {
          strengthOffset: true,
          vibeProfile: true,
          photos: { orderBy: { sortOrder: "asc" } },
          brandRef: true,
          _count: { select: { testerVotes: true } },
        },
        orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: { partners, partner, products, brands, userRole },
    });
  } catch (error) {
    console.error("Error loading Myco admin data:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to load Myco admin data" } },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const role = await getUserRole(auth.user!.email!);
    if (role === "partner_admin") {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Read-only — contact Tripdar to update store settings" },
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const partnerId = cleanText(body.partnerId);

    if (!partnerId) {
      return NextResponse.json(
        { success: false, error: { message: "partnerId is required" } },
        { status: 400 }
      );
    }

    const partner = await prisma.partner.update({
      where: { id: partnerId },
      data: {
        name: cleanText(body.name),
        subdomain: cleanText(body.subdomain) ?? null,
        contactInfo:
          body.contactInfo && typeof body.contactInfo === "object" ? body.contactInfo : null,
        mycoWelcomeMessage: cleanText(body.mycoWelcomeMessage) ?? null,
      },
      select: {
        id: true,
        name: true,
        subdomain: true,
        contactInfo: true,
        mycoWelcomeMessage: true,
        active: true,
      },
    });

    return NextResponse.json({ success: true, data: { partner } });
  } catch (error) {
    console.error("Error saving Myco store settings:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to save store settings" } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const partnerId = cleanText(body.partnerId);
    const productName = cleanText(body.productName);
    const format = parseFormat(body.format);
    const productUnitMg = parsePositiveInt(body.productUnitMg);
    const offset = parseOffset(body.strengthOffset);
    const rationale = cleanText(body.strengthRationale);
    const brandId = cleanText(body.brandId) ?? null;
    const unitsPerPack = parsePositiveIntOrNull(body.unitsPerPack);
    let totalDoseMg = parsePositiveIntOrNull(body.totalDoseMg);
    const onsetMinutes = parsePositiveIntOrNull(body.onsetMinutes);
    const durationMinutes = parsePositiveIntOrNull(body.durationMinutes);
    const brandMicroUnits = parsePositiveIntOrNull(body.brandMicroUnits);
    const brandMiniUnits = parsePositiveIntOrNull(body.brandMiniUnits);
    const brandMacroUnits = parsePositiveIntOrNull(body.brandMacroUnits);
    const ingredients = Array.isArray(body.ingredients)
      ? body.ingredients
          .filter((i: unknown): i is string => typeof i === "string")
          .map((i: string) => i.trim())
          .filter((i: string) => i.length > 0)
          .slice(0, 25)
      : [];
    const flavors = Array.isArray(body.flavors)
      ? body.flavors
          .filter((i: unknown): i is string => typeof i === "string")
          .map((i: string) => i.trim())
          .filter((i: string) => i.length > 0)
          .slice(0, 25)
      : [];

    if (!partnerId || !productName || !format || !productUnitMg) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "partnerId, productName, format, and productUnitMg are required",
          },
        },
        { status: 400 }
      );
    }

    if (offset !== "standard" && !rationale) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Strength rationale is required when offset is not Standard" },
        },
        { status: 400 }
      );
    }

    // Auto-compute totalDoseMg if not given
    if ((totalDoseMg === undefined || totalDoseMg === null) && unitsPerPack && productUnitMg) {
      totalDoseMg = productUnitMg * unitsPerPack;
    }

    const product = await prisma.storeProductCatalog.create({
      data: {
        partnerId,
        productName,
        format,
        brand: cleanText(body.brand) ?? null,
        brandId,
        strainSlug: cleanText(body.strainSlug) ?? null,
        productUnitMg,
        unitsPerPack: unitsPerPack ?? null,
        totalDoseMg: totalDoseMg ?? null,
        ingredients,
        flavors,
        onsetMinutes: onsetMinutes ?? null,
        durationMinutes: durationMinutes ?? null,
        brandMicroUnits: brandMicroUnits ?? null,
        brandMiniUnits: brandMiniUnits ?? null,
        brandMacroUnits: brandMacroUnits ?? null,
        photoUrl: cleanText(body.photoUrl) ?? null,
        active: typeof body.active === "boolean" ? body.active : true,
        strengthOffset: {
          create: {
            offset,
            rationale: offset === "standard" ? null : rationale,
          },
        },
      },
      include: {
        strengthOffset: true,
        vibeProfile: true,
        photos: { orderBy: { sortOrder: "asc" } },
        brandRef: true,
      },
    });

    return NextResponse.json({ success: true, data: { product } }, { status: 201 });
  } catch (error) {
    console.error("Error creating Myco product:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to create product" } },
      { status: 500 }
    );
  }
}
