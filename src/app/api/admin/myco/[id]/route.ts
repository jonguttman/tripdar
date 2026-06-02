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

function parseFormat(value: unknown): ProductFormat | undefined {
  return typeof value === "string" && VALID_FORMATS.includes(value as ProductFormat)
    ? value as ProductFormat
    : undefined;
}

function parseOffset(value: unknown): StrengthOffset | undefined {
  return typeof value === "string" && VALID_OFFSETS.includes(value as StrengthOffset)
    ? value as StrengthOffset
    : undefined;
}

function parsePositiveInt(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const offset = parseOffset(body.strengthOffset);
    const rationale = cleanText(body.strengthRationale);

    if (offset && offset !== "standard" && !rationale) {
      return NextResponse.json(
        { success: false, error: { message: "Strength rationale is required when offset is not Standard" } },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    const productName = cleanText(body.productName);
    const format = parseFormat(body.format);
    const productUnitMg = parsePositiveInt(body.productUnitMg);

    if (productName) data.productName = productName;
    if (format) data.format = format;
    if (productUnitMg !== undefined) data.productUnitMg = productUnitMg;
    if ("active" in body && typeof body.active === "boolean") data.active = body.active;
    if ("brand" in body) data.brand = cleanText(body.brand) ?? null;
    if ("strainSlug" in body) data.strainSlug = cleanText(body.strainSlug) ?? null;
    if ("photoUrl" in body) data.photoUrl = cleanText(body.photoUrl) ?? null;
    if ("notes" in body) data.notes = cleanText(body.notes) ?? null;

    const product = await prisma.storeProductCatalog.update({
      where: { id: params.id },
      data,
      include: { strengthOffset: true },
    });

    if (offset) {
      await prisma.productStrengthOffset.upsert({
        where: { catalogItemId: params.id },
        update: {
          offset,
          rationale: offset === "standard" ? null : rationale,
        },
        create: {
          catalogItemId: params.id,
          offset,
          rationale: offset === "standard" ? null : rationale,
        },
      });
    }

    const updatedProduct = await prisma.storeProductCatalog.findUnique({
      where: { id: product.id },
      include: { strengthOffset: true },
    });

    return NextResponse.json({ success: true, data: { product: updatedProduct } });
  } catch (error) {
    console.error("Error updating Myco product:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to update product" } },
      { status: 500 }
    );
  }
}
