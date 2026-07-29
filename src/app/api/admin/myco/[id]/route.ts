import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { prisma } from "@/lib/prisma";
import { aggregateTesterVotes, computeConfidence } from "@/domain/myco/community";
import { computeReadiness } from "@/domain/myco/readiness";
import { loadGateForProduct } from "@/domain/myco/staffReviewService";
import { normalizeFlavors } from "@/domain/myco/flavors";
import { resolveProductForAdmin } from "@/domain/myco/adminAccess";
import { aggregateEmployeeGuidance, summarizeAssignments } from "@/domain/myco/employeeReviews";
import { normalizeStrainSlug } from "@/domain/strain/data";

const VALID_FORMATS = ["capsule", "edible", "dried", "tincture", "other"] as const;
const VALID_OFFSETS = ["standard", "stronger", "lighter"] as const;
const VALID_INTAKE_STATUSES = ["draft", "in_review", "ready"] as const;

type ProductFormat = (typeof VALID_FORMATS)[number];
type StrengthOffset = (typeof VALID_OFFSETS)[number];
type IntakeStatus = (typeof VALID_INTAKE_STATUSES)[number];
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

function parseStrainSlug(value: unknown): { ok: true; value: string | null } | { ok: false; raw: string } {
  const raw = cleanText(value);
  if (!raw) return { ok: true, value: null };

  const normalized = normalizeStrainSlug(raw);
  if (!normalized) return { ok: false, raw };
  return { ok: true, value: normalized };
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

function parseIntakeStatus(value: unknown): IntakeStatus | undefined {
  return typeof value === "string" && VALID_INTAKE_STATUSES.includes(value as IntakeStatus)
    ? (value as IntakeStatus)
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

    const access = await resolveProductForAdmin(auth.user!.email!, id);
    if (!access.ok) {
      return NextResponse.json(
        { success: false, error: { message: access.message } },
        { status: access.status }
      );
    }

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
      select: {
        productUnitMg: true,
        unitsPerPack: true,
        strengthOffset: true,
        format: true,
        strainSlug: true,
        ingredients: true,
        brandDoseTiers: true,
      },
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
    const intakeStatus = parseIntakeStatus(body.intakeStatus);
    const productUnitMg = parsePositiveInt(body.productUnitMg);
    const unitsPerPack = parsePositiveInt(body.unitsPerPack);
    const totalDoseMg = parsePositiveInt(body.totalDoseMg);

    if (productName) data.productName = productName;
    if (format) data.format = format;
    if (intakeStatus) data.intakeStatus = intakeStatus;
    if ("sku" in body) data.sku = cleanText(body.sku) ?? null;
    if (productUnitMg !== undefined) data.productUnitMg = productUnitMg;
    if (unitsPerPack !== undefined) data.unitsPerPack = unitsPerPack;
    if ("active" in body && typeof body.active === "boolean") data.active = body.active;
    if ("researchOnly" in body && typeof body.researchOnly === "boolean") {
      data.researchOnly = body.researchOnly;
      data.researchOnlyReason = cleanText(body.researchOnlyReason) ?? null;
      // A research-only product can never be in the customer path.
      if (body.researchOnly) data.active = false;
    }

    // --- KEWL-2335 listing gate: a real binding constraint on activation. ---
    // Before this there was no gate at all, which is how two under-verified products
    // went live (KEWL-2327). Evaluated against the CURRENT stored state plus this
    // patch, so a request cannot both supply the missing data and flip active in one go.
    if (data.active === true) {
      const gate = await loadGateForProduct(id);
      if (!gate) {
        return NextResponse.json(
          { success: false, error: { message: "Product not found" } },
          { status: 404 }
        );
      }
      if (!gate.listable) {
        return NextResponse.json(
          {
            success: false,
            error: {
              message: "This product cannot be listed yet.",
              code: "listing_gate_blocked",
              blockers: gate.blockers,
            },
          },
          { status: 422 }
        );
      }
    }
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
    if ("strainSlug" in body) {
      const strainSlug = parseStrainSlug(body.strainSlug);
      if (!strainSlug.ok) {
        return NextResponse.json(
          {
            success: false,
            error: { message: `Unknown strainSlug "${strainSlug.raw}"` },
          },
          { status: 400 }
        );
      }
      data.strainSlug = strainSlug.value;
    }
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
      data.flavors = normalizeFlavors(body.flavors);
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

    // Recipe-defining fields: when one actually changes, prior tester feedback
    // and a confirmed strength offset describe a product that no longer exists.
    const recipeChanged =
      (data.productUnitMg !== undefined && data.productUnitMg !== existing.productUnitMg) ||
      (data.format !== undefined && data.format !== existing.format) ||
      ("strainSlug" in body && (data.strainSlug ?? null) !== existing.strainSlug) ||
      ("ingredients" in body &&
        JSON.stringify(data.ingredients) !== JSON.stringify(existing.ingredients)) ||
      ("brandDoseTiers" in body &&
        JSON.stringify(data.brandDoseTiers ?? null) !== JSON.stringify(existing.brandDoseTiers ?? null));

    const strengthConfirmed =
      typeof body.strengthConfirmed === "boolean" ? body.strengthConfirmed : undefined;
    if (offset || strengthConfirmed !== undefined || (recipeChanged && existing.strengthOffset?.confirmed)) {
      const effectiveOffset = offset ?? existing.strengthOffset?.offset ?? "standard";
      // Changing the offset value — or the recipe it was confirmed against —
      // invalidates a previous confirmation unless this request explicitly
      // confirms the new value.
      const offsetChanged = Boolean(offset && offset !== existing.strengthOffset?.offset);
      const confirmed =
        strengthConfirmed ??
        (offsetChanged || recipeChanged ? false : existing.strengthOffset?.confirmed ?? false);
      const confirmationFields = confirmed
        ? { confirmed: true, confirmedAt: new Date(), confirmedBy: auth.user!.email! }
        : { confirmed: false, confirmedAt: null, confirmedBy: null };

      await prisma.productStrengthOffset.upsert({
        where: { catalogItemId: id },
        update: {
          offset: effectiveOffset,
          rationale: effectiveOffset === "standard" ? null : rationale ?? existing.strengthOffset?.rationale,
          ...confirmationFields,
        },
        create: {
          catalogItemId: id,
          offset: effectiveOffset,
          rationale: effectiveOffset === "standard" ? null : rationale ?? null,
          ...confirmationFields,
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

    // One-click adoption of the community-reported vibe profile. Computed
    // server-side from ALL tester votes for this product.
    if (body.acceptCommunityVibe === true) {
      const votes = await prisma.testerVote.findMany({
        where: { catalogItemId: id },
        select: {
          clarityCognition: true,
          moodSocial: true,
          visualPattern: true,
          somatic: true,
          energyDirection: true,
          depthDirection: true,
        },
      });
      const community = aggregateTesterVotes(votes);
      if (!community.scores) {
        return NextResponse.json(
          { success: false, error: { message: "No tester feedback to accept yet" } },
          { status: 400 }
        );
      }
      await prisma.productVibeProfile.upsert({
        where: { catalogItemId: id },
        update: { scores: community.scores, source: "flywheel" },
        create: { catalogItemId: id, scores: community.scores, source: "flywheel" },
      });
    }

    const updatedProduct = await prisma.storeProductCatalog.findUnique({
      where: { id: product.id },
      include: {
        strengthOffset: true,
        vibeProfile: true,
        photos: { orderBy: { sortOrder: "asc" } },
        brandRef: true,
        _count: { select: { testerVotes: true } },
        testerVotes: {
          select: {
            clarityCognition: true,
            moodSocial: true,
            visualPattern: true,
            somatic: true,
            energyDirection: true,
            depthDirection: true,
          },
        },
        employeeReviewAssignments: {
          select: {
            status: true,
            expiresAt: true,
            response: {
              select: {
                knowsProduct: true,
                clarityCognition: true,
                moodSocial: true,
                visualPattern: true,
                somatic: true,
                energyDirection: true,
                depthDirection: true,
                confidence: true,
              },
            },
          },
        },
      },
    });

    if (!updatedProduct) {
      return NextResponse.json(
        { success: false, error: { message: "Product not found" } },
        { status: 404 }
      );
    }

    const { testerVotes, employeeReviewAssignments, ...productData } = updatedProduct;
    const readiness = computeReadiness({
      format: productData.format,
      brand: productData.brand,
      brandId: productData.brandId,
      productUnitMg: productData.productUnitMg,
      unitsPerPack: productData.unitsPerPack,
      totalDoseMg: productData.totalDoseMg,
      onsetMinutes: productData.onsetMinutes,
      durationMinutes: productData.durationMinutes,
      brandMicroUnits: productData.brandMicroUnits,
      brandMiniUnits: productData.brandMiniUnits,
      brandMacroUnits: productData.brandMacroUnits,
      brandDoseTiers: productData.brandDoseTiers,
      photoUrl: productData.photoUrl,
      photoCount: productData.photos.length,
      vibeScores: productData.vibeProfile?.scores ?? null,
      strengthOffset: productData.strengthOffset
        ? { offset: productData.strengthOffset.offset, confirmed: productData.strengthOffset.confirmed }
        : null,
    });
    const community = aggregateTesterVotes(testerVotes);
    const employeeGuidance = aggregateEmployeeGuidance(
      employeeReviewAssignments.flatMap((assignment) => (assignment.response ? [assignment.response] : []))
    );

    return NextResponse.json({
      success: true,
      data: {
        product: {
          ...productData,
          readiness,
          community,
          employeeReviews: {
            participation: summarizeAssignments(employeeReviewAssignments),
            guidance: employeeGuidance,
          },
          confidence: computeConfidence(community.voteCount, community.spread),
        },
      },
    });
  } catch (error) {
    console.error("Error updating Myco product:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to update product" } },
      { status: 500 }
    );
  }
}
