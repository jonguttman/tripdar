/**
 * Compare Strains API
 *
 * GET /api/v1/compare?strains=golden-teacher,penis-envy,b-plus
 *
 * Returns side-by-side comparison of multiple strains.
 * Accepts 2-5 strain slugs.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
  recordSignal,
} from "@/domain/partner";
import { compareStrains, ComparisonResult } from "@/domain/compare";
import type { ApiSuccessResponse, ApiErrorResponse } from "@/domain/partner";

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context, sessionHash } = auth;

  return withLogging(context, "/api/v1/compare", async () => {
    const { searchParams } = new URL(request.url);
    const strainsParam = searchParams.get("strains");

    if (!strainsParam) {
      return addPartnerHeaders(
        NextResponse.json<ApiErrorResponse>(
          { success: false, error: { code: "BAD_REQUEST", message: "Missing 'strains' query parameter" } },
          { status: 400 }
        ),
        partner,
        context
      );
    }

    const slugs = strainsParam.split(",").map(s => s.trim()).filter(Boolean);

    if (slugs.length < 2) {
      return addPartnerHeaders(
        NextResponse.json<ApiErrorResponse>(
          { success: false, error: { code: "BAD_REQUEST", message: "At least 2 strains required for comparison" } },
          { status: 400 }
        ),
        partner,
        context
      );
    }

    if (slugs.length > 5) {
      return addPartnerHeaders(
        NextResponse.json<ApiErrorResponse>(
          { success: false, error: { code: "BAD_REQUEST", message: "Maximum 5 strains can be compared at once" } },
          { status: 400 }
        ),
        partner,
        context
      );
    }

    const comparison = await compareStrains(slugs);

    if (!comparison) {
      return addPartnerHeaders(
        NextResponse.json<ApiErrorResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "One or more strains not found" } },
          { status: 404 }
        ),
        partner,
        context
      );
    }

    // Record comparison signal
    recordSignal(partner.id, "compare_strains", sessionHash, slugs);

    const response = NextResponse.json<ApiSuccessResponse<ComparisonResult>>({
      success: true,
      data: comparison,
    });

    return addPartnerHeaders(response, partner, context);
  });
}
