/**
 * Setting Insights API
 *
 * GET /api/v1/strains/[slug]/settings
 *
 * Returns setting-based insights from trip reports.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
} from "@/domain/partner";
import { getSettingInsights, SettingInsightsResponse } from "@/domain/settings";
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

  return withLogging(context, `/api/v1/strains/${slug}/settings`, async () => {
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

    // Get setting insights
    const data = await getSettingInsights(slug);

    const response = NextResponse.json<ApiSuccessResponse<SettingInsightsResponse>>({
      success: true,
      data,
    });

    return addPartnerHeaders(response, partner, context);
  });
}
