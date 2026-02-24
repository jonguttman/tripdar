/**
 * Admin: List All Strain Configs
 *
 * GET /api/v1/admin/recommend/strains
 *
 * Returns all strains with their recommendation configs, computed scores,
 * and feedback aggregates.
 * Requires partner authentication with admin access.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
  createMeta,
  ApiSuccessResponse,
} from "@/domain/partner";
import { loadStrainData } from "@/domain/strain/blob-store";
import { generateAllProfiles } from "@/domain/recommendation-engine/strain-profiles";

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context } = auth;

  return withLogging(context, "/api/v1/admin/recommend/strains", async () => {
    // Load all strains and their profiles
    const allStrains = await loadStrainData();
    const profiles = generateAllProfiles(allStrains);

    // Load all strain configs
    const configs = await prisma.strainRecommendationConfig.findMany();
    const configMap = new Map(configs.map(c => [c.strainSlug, c]));

    // Load all feedback aggregates
    const aggregates = await prisma.feedbackAggregate.findMany();
    type AggEntry = (typeof aggregates)[number];
    const aggMap = new Map<string, AggEntry[]>();
    for (const agg of aggregates) {
      const existing = aggMap.get(agg.strainSlug) || [];
      existing.push(agg);
      aggMap.set(agg.strainSlug, existing);
    }

    // Build response
    const strains = profiles.map(profile => {
      const config = configMap.get(profile.strainSlug);
      const feedbackAggs = aggMap.get(profile.strainSlug) || [];

      return {
        strainSlug: profile.strainSlug,
        strainName: profile.strainName,
        profile: {
          potencyTier: profile.potencyTier,
          doseSensitivity: profile.doseSensitivity,
          experienceStability: profile.experienceStability,
          beginnerFriendly: profile.beginnerFriendly,
        },
        config: config ? {
          productName: config.productName,
          productUrl: config.productUrl,
          productUnitMg: config.productUnitMg,
          productFormat: config.productFormat,
          availability: config.availability,
          doseSensitivityOverride: config.doseSensitivityOverride,
          intentOverrides: config.intentOverrides ? JSON.parse(config.intentOverrides) : null,
          cautionFlags: config.cautionFlags ? JSON.parse(config.cautionFlags) : null,
        } : null,
        feedback: {
          aggregates: feedbackAggs.map(agg => ({
            intentCategory: agg.intentCategory,
            totalRatings: agg.totalRatings,
            nailedIt: agg.nailedIt,
            prettyClose: agg.prettyClose,
            missed: agg.missed,
            feedbackMod: agg.feedbackMod,
          })),
        },
      };
    });

    const response = NextResponse.json<ApiSuccessResponse<{
      strains: typeof strains;
      meta: ReturnType<typeof createMeta>;
    }>>({
      success: true,
      data: { strains, meta: createMeta() },
    });

    return addPartnerHeaders(response, partner, context);
  });
}
