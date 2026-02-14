/**
 * Strain Confidence API
 *
 * GET /api/v1/strains/[slug]/confidence
 *
 * Returns community-validated confidence metrics for a strain.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
} from "@/domain/partner";
import { getStrainConfidence } from "@/domain/confidence";
import { getStrainBySlug } from "@/domain/strain/data";
import type { ApiSuccessResponse, ApiErrorResponse } from "@/domain/partner";

interface ConfidenceData {
  strainSlug: string;
  baseConfidence: number;
  communityConfidence: number;
  verifiedBy: number;
  ratingCount: number;
  reportCount: number;
  tier: "emerging" | "developing" | "established" | "verified";
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

  return withLogging(context, `/api/v1/strains/${slug}/confidence`, async () => {
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

    // Get confidence data
    const confidence = await getStrainConfidence(slug);

    // If no confidence data yet, return base confidence from strain data
    const data: ConfidenceData = confidence || {
      strainSlug: slug,
      baseConfidence: strain.confidence,
      communityConfidence: strain.confidence,
      verifiedBy: 0,
      ratingCount: 0,
      reportCount: 0,
      tier: "emerging",
    };

    const response = NextResponse.json<ApiSuccessResponse<ConfidenceData>>({
      success: true,
      data,
    });

    return addPartnerHeaders(response, partner, context);
  });
}
