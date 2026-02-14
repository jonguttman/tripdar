/**
 * Similar Strains API
 *
 * GET /api/v1/strains/[slug]/similar
 *
 * Returns strains similar to the specified strain based on
 * community patterns and attribute matching.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
} from "@/domain/partner";
import { getSimilarStrains, RecommendedStrain } from "@/domain/recommendations";
import { getStrainBySlug } from "@/domain/strain/data";
import type { ApiSuccessResponse, ApiErrorResponse } from "@/domain/partner";

interface SimilarStrainsResponse {
  strain: string;
  similar: RecommendedStrain[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context } = auth;
  const { slug } = await params;

  return withLogging(context, `/api/v1/strains/${slug}/similar`, async () => {
    // Check strain exists
    const strain = getStrainBySlug(slug);
    if (!strain) {
      return addPartnerHeaders(
        NextResponse.json<ApiErrorResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Strain not found" } },
          { status: 404 }
        ),
        partner,
        context
      );
    }

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 10) : 5;

    const similar = await getSimilarStrains(slug, limit);

    const data: SimilarStrainsResponse = {
      strain: slug,
      similar,
    };

    const response = NextResponse.json<ApiSuccessResponse<SimilarStrainsResponse>>({
      success: true,
      data,
    });

    return addPartnerHeaders(response, partner, context);
  });
}
