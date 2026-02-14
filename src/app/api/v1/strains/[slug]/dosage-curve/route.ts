/**
 * Dosage Curve API
 *
 * GET /api/v1/strains/[slug]/dosage-curve
 *
 * Returns aggregated intensity data at different dose levels.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
} from "@/domain/partner";
import { getDosageCurve, DosageCurveResponse } from "@/domain/dosage";
import { getStrainBySlug } from "@/domain/strain/data";
import type { ApiSuccessResponse, ApiErrorResponse } from "@/domain/partner";

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

  return withLogging(context, `/api/v1/strains/${slug}/dosage-curve`, async () => {
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

    // Get dosage curve data
    const data = await getDosageCurve(slug);

    const response = NextResponse.json<ApiSuccessResponse<DosageCurveResponse>>({
      success: true,
      data,
    });

    return addPartnerHeaders(response, partner, context);
  });
}
