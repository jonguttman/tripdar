/**
 * Recommendations API
 *
 * GET /api/v1/recommendations
 *
 * Returns personalized strain recommendations based on user history.
 * Uses collaborative filtering and attribute matching.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
} from "@/domain/partner";
import { getRecommendations, RecommendationsResponse } from "@/domain/recommendations";
import type { ApiSuccessResponse } from "@/domain/partner";

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context, sessionHash } = auth;

  return withLogging(context, "/api/v1/recommendations", async () => {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 20) : 5;

    const data = await getRecommendations(sessionHash, limit);

    const response = NextResponse.json<ApiSuccessResponse<RecommendationsResponse>>({
      success: true,
      data,
    });

    return addPartnerHeaders(response, partner, context);
  });
}
