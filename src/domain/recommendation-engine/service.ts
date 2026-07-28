/**
 * Recommendation Engine Service (Orchestrator)
 *
 * Ties together strain profiles, scoring, admin config, and database persistence.
 * Layer 2 (feedback) is stubbed for now — activates in Phase 7.
 */

import { prisma } from "@/lib/prisma";
import { loadStrainData } from "@/domain/strain/blob-store";
import type { RecommendationRequest, RecommendationResponse } from "./types";
import { generateAllProfiles } from "./strain-profiles";
import { scoreStrains } from "./scoring";
import {
  computeFieldStates,
  ensureFieldRules,
  evaluateGateForItem,
} from "@/domain/myco/staffReviewService";

// =============================================================================
// Main Recommendation Function
// =============================================================================

export async function generateRecommendations(
  request: RecommendationRequest,
  partnerId: string,
): Promise<RecommendationResponse> {
  // 1. Load all strains
  const allStrains = await loadStrainData();

  // 2. Load admin configs for all strains
  const strainConfigs = await prisma.strainRecommendationConfig.findMany();
  type ConfigEntry = {
    intentOverrides?: Record<string, string>;
    cautionFlags?: { show_sensitivity?: boolean; custom?: string };
    productName?: string;
    productUrl?: string;
    productUnitMg?: number;
    productFormat?: string;
    productPhotoUrl?: string;
    availability: string;
    doseSensitivityOverride?: string;
    strengthOffset?: "standard" | "stronger" | "lighter";
    strengthRationale?: string;
  };
  const configMap = new Map<string, ConfigEntry>(
    strainConfigs.map((c): [string, ConfigEntry] => [c.strainSlug, {
      intentOverrides: c.intentOverrides ? JSON.parse(c.intentOverrides) as Record<string, string> : undefined,
      cautionFlags: c.cautionFlags ? JSON.parse(c.cautionFlags) as { show_sensitivity?: boolean; custom?: string } : undefined,
      productName: c.productName ?? undefined,
      productUrl: c.productUrl ?? undefined,
      productUnitMg: c.productUnitMg ?? undefined,
      productFormat: c.productFormat ?? undefined,
      availability: c.availability,
      doseSensitivityOverride: c.doseSensitivityOverride ?? undefined,
    }])
  );

  const [activeCatalogItems, fieldRules] = await Promise.all([
    prisma.storeProductCatalog.findMany({
      where: {
        partnerId,
        active: true,
        strainSlug: { not: null },
      },
      include: {
        strengthOffset: true,
        vibeProfile: true,
        _count: { select: { photos: true } },
        catalogFieldChanges: {
          select: {
            fieldName: true,
            submittedValue: true,
            actorType: true,
            actorIdentity: true,
            source: true,
            disposition: true,
            createdAt: true,
          },
        },
      },
    }),
    ensureFieldRules(null),
  ]);
  const catalogItems = activeCatalogItems.filter((item) =>
    evaluateGateForItem({
      item,
      extras: {
        photoCount: item._count.photos,
        vibeScores: item.vibeProfile?.scores ?? null,
        strengthOffset: item.strengthOffset
          ? { offset: item.strengthOffset.offset, confirmed: item.strengthOffset.confirmed }
          : null,
      },
      rules: fieldRules,
      fieldStates: computeFieldStates(fieldRules, item.catalogFieldChanges),
    }).listable
  );
  for (const item of catalogItems) {
    if (!item.strainSlug) continue;
    configMap.set(item.strainSlug, {
      ...(configMap.get(item.strainSlug) ?? { availability: "in_stock" }),
      productName: item.productName,
      productUrl: "",
      productUnitMg: item.productUnitMg ?? undefined,
      productFormat: item.format,
      productPhotoUrl: item.photoUrl ?? undefined,
      availability: "in_stock",
      strengthOffset: (item.strengthOffset?.offset as "standard" | "stronger" | "lighter" | undefined) ?? "standard",
      strengthRationale: item.strengthOffset?.rationale ?? undefined,
    });
  }

  // 3. Filter to available strains only
  const availableStrains = allStrains.filter(strain => {
    const slug = strain.id || strain.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const config = configMap.get(slug);
    if (catalogItems.length > 0) {
      return Boolean(config && config.availability === "in_stock");
    }
    return !config || config.availability === "in_stock";
  });

  // 4. Generate strain profile vectors
  const profiles = generateAllProfiles(availableStrains);

  // Apply dose sensitivity overrides from admin config
  for (const profile of profiles) {
    const config = configMap.get(profile.strainSlug);
    if (config?.doseSensitivityOverride) {
      profile.doseSensitivity = config.doseSensitivityOverride as typeof profile.doseSensitivity;
    }
  }

  // 5. Layer 2: Feedback modifiers (stub — returns empty map)
  const feedbackMods = await loadFeedbackModifiers(profiles.map(p => p.strainSlug));

  // 6. Score all strains
  const allScored = scoreStrains({
    intentVector: request.intentVector,
    experienceLevel: request.experienceLevel,
    profiles,
    feedbackMods,
    adminConfigs: configMap,
  });

  // 7. Take top 3
  const topResults = allScored.slice(0, 3);

  // 8. Generate session token and persist
  const sessionToken = generateSessionToken();

  const session = await prisma.recommendationSession.create({
    data: {
      sessionToken,
      experienceLevel: request.experienceLevel,
      inputPath: request.inputPath,
      intentVector: JSON.stringify(request.intentVector),
      rawInput: JSON.stringify(request.rawInput),
      partnerId,
      results: {
        create: topResults.map((result, index) => ({
          strainSlug: result.strainSlug,
          rank: index + 1,
          matchScore: result.matchScore,
          baseScore: result.baseScore,
          feedbackMod: result.feedbackMod,
          adminMod: result.adminMod,
          doseLevel: result.doseLevel,
          doseLowMg: result.doseLowMg,
          doseHighMg: result.doseHighMg,
          productUnits: result.product ? parseInt(result.product.suggestedUnits.split("-")[1] || "0") : null,
          cautionFlags: result.cautions.length > 0 ? JSON.stringify(result.cautions) : null,
        })),
      },
    },
    include: { results: true },
  });

  // 9. Build response
  const steppedPath = topResults[0]?.steppedPathNotice
    ? {
        message: topResults[0].steppedPathNotice,
        suggestedLevel: request.experienceLevel === "new" ? 2 : 3,
        aspirationalLevel: topResults[0].doseLevel,
      }
    : undefined;

  return {
    sessionToken: session.sessionToken,
    results: topResults,
    steppedPath,
  };
}

// =============================================================================
// Feedback Modifiers (Layer 2 stub)
// =============================================================================

async function loadFeedbackModifiers(strainSlugs: string[]): Promise<Map<string, number>> {
  // Load feedback aggregates for these strains
  const aggregates = await prisma.feedbackAggregate.findMany({
    where: { strainSlug: { in: strainSlugs } },
  });

  const mods = new Map<string, number>();
  for (const agg of aggregates) {
    // Only apply if above threshold (default 10)
    if (agg.totalRatings >= 10) {
      mods.set(agg.strainSlug, agg.feedbackMod);
    }
  }
  return mods;
}

// =============================================================================
// Admin Config Functions
// =============================================================================

export async function getStrainConfig(strainSlug: string) {
  return prisma.strainRecommendationConfig.findUnique({
    where: { strainSlug },
  });
}

export async function upsertStrainConfig(
  strainSlug: string,
  data: {
    productName?: string | null;
    productUrl?: string | null;
    productUnitMg?: number | null;
    productFormat?: string | null;
    availability?: string;
    doseSensitivityOverride?: string | null;
    intentOverrides?: Record<string, string> | null;
    cautionFlags?: Record<string, unknown> | null;
  },
) {
  return prisma.strainRecommendationConfig.upsert({
    where: { strainSlug },
    update: {
      productName: data.productName,
      productUrl: data.productUrl,
      productUnitMg: data.productUnitMg,
      productFormat: data.productFormat,
      availability: data.availability,
      doseSensitivityOverride: data.doseSensitivityOverride,
      intentOverrides: data.intentOverrides ? JSON.stringify(data.intentOverrides) : null,
      cautionFlags: data.cautionFlags ? JSON.stringify(data.cautionFlags) : null,
    },
    create: {
      strainSlug,
      productName: data.productName,
      productUrl: data.productUrl,
      productUnitMg: data.productUnitMg,
      productFormat: data.productFormat,
      availability: data.availability ?? "in_stock",
      doseSensitivityOverride: data.doseSensitivityOverride,
      intentOverrides: data.intentOverrides ? JSON.stringify(data.intentOverrides) : null,
      cautionFlags: data.cautionFlags ? JSON.stringify(data.cautionFlags) : null,
    },
  });
}

// =============================================================================
// Helpers
// =============================================================================

function generateSessionToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "rec_";
  for (let i = 0; i < 24; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}
