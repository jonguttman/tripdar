import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { prisma } from "@/lib/prisma";

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
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
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
      where: { id },
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
    if ("onsetMinutes" in body) {
      const v = parsePositiveInt(body.onsetMinutes);
      data.onsetMinutes = v === undefined ? null : v;
    }
    if ("durationMinutes" in body) {
      const v = parsePositiveInt(body.durationMinutes);
      data.durationMinutes = v === undefined ? null : v;
    }
    if ("brandMicroUnits" in body) {
      const v = parsePositiveInt(body.brandMicroUnits);
      data.brandMicroUnits = v === undefined ? null : v;
    }
    if ("brandMiniUnits" in body) {
      const v = parsePositiveInt(body.brandMiniUnits);
      data.brandMiniUnits = v === undefined ? null : v;
    }
    if ("brandMacroUnits" in body) {
      const v = parsePositiveInt(body.brandMacroUnits);
      data.brandMacroUnits = v === undefined ? null : v;
    }
    if ("brandDoseTiers" in body) {
      const brandDoseTiers = sanitizeBrandDoseTiers(body.brandDoseTiers);
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
      const legacyUnits = deriveLegacyBrandUnits(brandDoseTiers);
      data.brandDoseTiers = brandDoseTiers.length > 0 ? brandDoseTiers : null;
      data.brandMicroUnits = legacyUnits.brandMicroUnits;
      data.brandMiniUnits = legacyUnits.brandMiniUnits;
      data.brandMacroUnits = legacyUnits.brandMacroUnits;
    }
    if ("brandDoseInstructions" in body) {
      data.brandDoseInstructions = cleanText(body.brandDoseInstructions) ?? null;
    }
    if ("ingredients" in body) {
      data.ingredients = Array.isArray(body.ingredients)
        ? body.ingredients
            .filter((i: unknown): i is string => typeof i === "string")
            .map((i: string) => i.trim())
            .filter((i: string) => i.length > 0)
            .slice(0, 25)
        : [];
    }
    if ("flavors" in body) {
      data.flavors = Array.isArray(body.flavors)
        ? body.flavors
            .filter((i: unknown): i is string => typeof i === "string")
            .map((i: string) => i.trim())
            .filter((i: string) => i.length > 0)
            .slice(0, 25)
        : [];
    }

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
      where: { id },
      data,
      include: { strengthOffset: true, vibeProfile: true, photos: { orderBy: { sortOrder: "asc" } }, brandRef: true },
    });

    if (offset) {
      await prisma.productStrengthOffset.upsert({
        where: { catalogItemId: id },
        update: {
          offset,
          rationale: offset === "standard" ? null : rationale,
        },
        create: {
          catalogItemId: id,
          offset,
          rationale: offset === "standard" ? null : rationale,
        },
      });
    }

    const vibeScores = sanitizeVibeScores(body.vibeScores);
    if (vibeScores) {
      await prisma.productVibeProfile.upsert({
        where: { catalogItemId: id },
        update: { scores: vibeScores, source: "admin" },
        create: { catalogItemId: id, scores: vibeScores, source: "admin" },
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
