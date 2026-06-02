import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { prisma } from "@/lib/prisma";

const VALID_FORMATS = ["capsule", "edible", "dried", "tincture", "other"] as const;
const VALID_OFFSETS = ["standard", "stronger", "lighter"] as const;

type ProductFormat = (typeof VALID_FORMATS)[number];
type StrengthOffset = (typeof VALID_OFFSETS)[number];

const VIBE_KEYS = [
  "clarity_cognition",
  "mood_social",
  "visual_pattern",
  "somatic",
  "energy_direction",
  "depth_direction",
] as const;

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
    ? (value as ProductFormat)
    : undefined;
}

function parseOffset(value: unknown): StrengthOffset | undefined {
  return typeof value === "string" && VALID_OFFSETS.includes(value as StrengthOffset)
    ? (value as StrengthOffset)
    : undefined;
}

function parsePositiveInt(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function sanitizeVibeScores(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const key of VIBE_KEYS) {
    const raw = input[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      out[key] = clamp(raw, -1, 1);
    }
  }
  return out;
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
        {
          success: false,
          error: { message: "Strength rationale is required when offset is not Standard" },
        },
        { status: 400 }
      );
    }

    const existing = await prisma.storeProductCatalog.findUnique({
      where: { id: params.id },
      select: { productUnitMg: true, unitsPerPack: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { message: "Product not found" } },
        { status: 404 }
      );
    }

    const data: Record<string, unknown> = {};
    const productName = cleanText(body.productName);
    const format = parseFormat(body.format);
    const productUnitMg = parsePositiveInt(body.productUnitMg);
    const unitsPerPack = parsePositiveInt(body.unitsPerPack);
    const totalDoseMg = parsePositiveInt(body.totalDoseMg);

    if (productName) data.productName = productName;
    if (format) data.format = format;
    if (productUnitMg !== undefined) data.productUnitMg = productUnitMg;
    if (unitsPerPack !== undefined) data.unitsPerPack = unitsPerPack;
    if ("active" in body && typeof body.active === "boolean") data.active = body.active;
    if ("archived" in body && typeof body.archived === "boolean") {
      if (body.archived) {
        data.archivedAt = new Date();
        data.active = false;
      } else {
        data.archivedAt = null;
      }
    }
    if ("brand" in body) data.brand = cleanText(body.brand) ?? null;
    if ("brandId" in body) data.brandId = cleanText(body.brandId) ?? null;
    if ("strainSlug" in body) data.strainSlug = cleanText(body.strainSlug) ?? null;
    if ("photoUrl" in body) data.photoUrl = cleanText(body.photoUrl) ?? null;
    if ("notes" in body) data.notes = cleanText(body.notes) ?? null;

    // Auto-recompute totalDoseMg when not explicitly provided but both
    // productUnitMg and unitsPerPack are present (incoming or existing).
    if (totalDoseMg !== undefined) {
      data.totalDoseMg = totalDoseMg;
    } else if (!("totalDoseMg" in body)) {
      const effectiveUnit =
        productUnitMg !== undefined && productUnitMg !== null
          ? productUnitMg
          : existing.productUnitMg;
      const effectivePack =
        unitsPerPack !== undefined && unitsPerPack !== null
          ? unitsPerPack
          : existing.unitsPerPack;
      if (effectiveUnit && effectivePack) {
        data.totalDoseMg = effectiveUnit * effectivePack;
      }
    }

    const product = await prisma.storeProductCatalog.update({
      where: { id: params.id },
      data,
      include: { strengthOffset: true, vibeProfile: true, photos: { orderBy: { sortOrder: "asc" } }, brandRef: true },
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

    const vibeScores = sanitizeVibeScores(body.vibeScores);
    if (vibeScores) {
      await prisma.productVibeProfile.upsert({
        where: { catalogItemId: params.id },
        update: { scores: vibeScores, source: "admin" },
        create: { catalogItemId: params.id, scores: vibeScores, source: "admin" },
      });
    }

    const updatedProduct = await prisma.storeProductCatalog.findUnique({
      where: { id: product.id },
      include: {
        strengthOffset: true,
        vibeProfile: true,
        photos: { orderBy: { sortOrder: "asc" } },
        brandRef: true,
      },
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
