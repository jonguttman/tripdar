/**
 * Store-facing Myco admin API.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/domain/auth/config";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/domain/auth/role";

const VALID_FORMATS = ["capsule", "edible", "dried", "tincture", "other"] as const;
const VALID_OFFSETS = ["standard", "stronger", "lighter"] as const;

type ProductFormat = (typeof VALID_FORMATS)[number];
type StrengthOffset = (typeof VALID_OFFSETS)[number];
type BrandDoseCategory = "micro" | "mini" | "macro" | "custom";
type BrandDoseTier = {
  id: string;
  category: BrandDoseCategory;
  label: string;
  quantityText: string;
  quantityMin: number;
  quantityMax: number | null;
  unit: string;
};

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

function parseQuarterQuantity(value: string): number | null {
  const trimmed = value.trim();
  const fraction = trimmed.match(/^(\d+)\s*\/\s*([24])$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (!Number.isFinite(numerator) || numerator <= 0) return null;
    return numerator / denominator;
  }

  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.abs(parsed * 4 - Math.round(parsed * 4)) < 0.00001 ? parsed : null;
}

function parseQuantitySide(value: string): { amount: number; unit?: string } | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?|\d+\s*\/\s*[24])(?:\s+(.+))?$/);
  if (!match) return null;
  const amount = parseQuarterQuantity(match[1]);
  if (amount === null) return null;
  const unit = cleanText(match[2]);
  return { amount, unit };
}

function parseBrandDoseQuantity(
  quantityText: string,
  unitText: string | undefined
): { quantityMin: number; quantityMax: number | null; unit: string } | null {
  const parts = quantityText
    .trim()
    .split(/\s+(?:to)\s+|\s*[-–—]\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 1 || parts.length > 2) return null;

  const low = parseQuantitySide(parts[0]);
  const high = parts[1] ? parseQuantitySide(parts[1]) : null;
  if (!low || (parts[1] && !high)) return null;
  if (high && high.amount < low.amount) return null;

  return {
    quantityMin: low.amount,
    quantityMax: high ? high.amount : null,
    unit: cleanText(unitText) ?? high?.unit ?? low.unit ?? "",
  };
}

function sanitizeBrandDoseTiers(value: unknown): BrandDoseTier[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index): BrandDoseTier | null => {
      if (!item || typeof item !== "object") return null;
      const input = item as Record<string, unknown>;
      const label = cleanText(input.label);
      const quantityText = cleanText(input.quantityText);
      if (!label || !quantityText) return null;

      const category =
        input.category === "micro" ||
        input.category === "mini" ||
        input.category === "macro" ||
        input.category === "custom"
          ? input.category
          : "custom";
      const parsed = parseBrandDoseQuantity(quantityText, cleanText(input.unit));
      if (!parsed) return null;

      return {
        id: cleanText(input.id) ?? `tier-${index + 1}`,
        category,
        label,
        quantityText,
        quantityMin: parsed.quantityMin,
        quantityMax: parsed.quantityMax,
        unit: parsed.unit,
      };
    })
    .filter((tier): tier is BrandDoseTier => Boolean(tier))
    .slice(0, 12);
}

function countSubmittedBrandDoseTiers(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const input = item as Record<string, unknown>;
    return Boolean(cleanText(input.label) || cleanText(input.quantityText) || cleanText(input.unit));
  }).length;
}

function deriveLegacyBrandUnits(tiers: BrandDoseTier[]): {
  brandMicroUnits: number | null;
  brandMiniUnits: number | null;
  brandMacroUnits: number | null;
} {
  const read = (category: BrandDoseCategory) => {
    const tier = tiers.find((item) => item.category === category && item.quantityMax === null);
    if (!tier || !Number.isInteger(tier.quantityMin)) return null;
    return tier.quantityMin;
  };

  return {
    brandMicroUnits: read("micro"),
    brandMiniUnits: read("mini"),
    brandMacroUnits: read("macro"),
  };
}

async function resolvePartnerForUser(
  email: string,
  userRole: Awaited<ReturnType<typeof getUserRole>>,
  requestedPartnerId: string | null
) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Partner admins are pinned to their assigned partner. Do not let a stale or forged
  // partnerId query param select a missing/different partner and strand the UI on the
  // "create an active partner" empty state.
  if (userRole === "partner_admin" && user?.partnerId) {
    const assignedPartner = await prisma.partner.findUnique({ where: { id: user.partnerId } });
    if (assignedPartner) return assignedPartner;
  }

  if (userRole === "super_admin" && requestedPartnerId) {
    const requestedPartner = await prisma.partner.findUnique({ where: { id: requestedPartnerId } });
    if (requestedPartner) return requestedPartner;
  }

  const defaultPartner = await prisma.partner.findFirst({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });

  if (defaultPartner && user && !user.partnerId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { partnerId: defaultPartner.id },
    });
  }

  return defaultPartner;
}

async function partnerIdForMutation(email: string, requestedPartnerId: string) {
  const role = await getUserRole(email);
  if (role === "super_admin") return requestedPartnerId;

  const user = await prisma.user.findUnique({ where: { email }, select: { partnerId: true } });
  if (!user?.partnerId) return undefined;
  return user.partnerId === requestedPartnerId ? requestedPartnerId : undefined;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const email = auth.user!.email!;
    const userRole = await getUserRole(email);
    const partnerId = request.nextUrl.searchParams.get("partnerId");
    const selectedPartner = await resolvePartnerForUser(email, userRole, partnerId);
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
    let partnerId = cleanText(body.partnerId);
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
    const brandDoseTiers = sanitizeBrandDoseTiers(body.brandDoseTiers);
    const legacyUnits = deriveLegacyBrandUnits(brandDoseTiers);
    if (countSubmittedBrandDoseTiers(body.brandDoseTiers) > brandDoseTiers.length) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message:
              "Brand dose tiers must use whole, half, quarter, or range quantities such as 1/2, 0.5, or 1-3.",
          },
        },
        { status: 400 }
      );
    }
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

    partnerId = await partnerIdForMutation(auth.user!.email!, partnerId);
    if (!partnerId) {
      return NextResponse.json(
        { success: false, error: { message: "You do not have access to this partner" } },
        { status: 403 }
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
        brandMicroUnits: brandMicroUnits ?? legacyUnits.brandMicroUnits,
        brandMiniUnits: brandMiniUnits ?? legacyUnits.brandMiniUnits,
        brandMacroUnits: brandMacroUnits ?? legacyUnits.brandMacroUnits,
        brandDoseTiers: brandDoseTiers.length > 0 ? brandDoseTiers : Prisma.JsonNull,
        brandDoseInstructions: cleanText(body.brandDoseInstructions) ?? null,
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
