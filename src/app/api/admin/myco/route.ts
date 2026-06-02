/**
 * Store-facing Myco admin API.
 *
 * Uses the existing authenticated Tripdar admin shell until dedicated
 * PARTNER_ADMIN/PARTNER_OPERATOR sessions exist in the app.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { prisma } from "@/lib/prisma";

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
    ? value as ProductFormat
    : null;
}

function parseOffset(value: unknown): StrengthOffset {
  return typeof value === "string" && VALID_OFFSETS.includes(value as StrengthOffset)
    ? value as StrengthOffset
    : "standard";
}

function parsePositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
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

  // Auto-assign to first active partner on first access
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
    const partnerId = request.nextUrl.searchParams.get("partnerId");
    const selectedPartner = await resolvePartnerForUser(auth.user!.email!, partnerId);
    const partners = await prisma.partner.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        subdomain: true,
        contactInfo: true,
        mycoWelcomeMessage: true,
        active: true,
      },
    });

    if (!selectedPartner) {
      return NextResponse.json({
        success: true,
        data: { partners, partner: null, products: [] },
      });
    }

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
        where: { partnerId: selectedPartner.id },
        include: { strengthOffset: true },
        orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: { partners, partner, products },
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
        contactInfo: body.contactInfo && typeof body.contactInfo === "object" ? body.contactInfo : null,
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

    if (!partnerId || !productName || !format || !productUnitMg) {
      return NextResponse.json(
        { success: false, error: { message: "partnerId, productName, format, and productUnitMg are required" } },
        { status: 400 }
      );
    }

    if (offset !== "standard" && !rationale) {
      return NextResponse.json(
        { success: false, error: { message: "Strength rationale is required when offset is not Standard" } },
        { status: 400 }
      );
    }

    const product = await prisma.storeProductCatalog.create({
      data: {
        partnerId,
        productName,
        format,
        brand: cleanText(body.brand) ?? null,
        strainSlug: cleanText(body.strainSlug) ?? null,
        productUnitMg,
        photoUrl: cleanText(body.photoUrl) ?? null,
        active: typeof body.active === "boolean" ? body.active : true,
        strengthOffset: {
          create: {
            offset,
            rationale: offset === "standard" ? null : rationale,
          },
        },
      },
      include: { strengthOffset: true },
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
