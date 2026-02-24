/**
 * Recommendation Config API
 *
 * GET /api/v1/recommend/config
 *
 * Returns UI configuration: mood tiles, slider axes, quiz steps,
 * experience levels, and canonical dose levels.
 * Requires partner authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
  createMeta,
  ApiSuccessResponse,
} from "@/domain/partner";
import { getRecommendationConfig } from "@/domain/recommendation-engine";
import type { RecommendationConfig } from "@/domain/recommendation-engine";

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context } = auth;

  return withLogging(context, "/api/v1/recommend/config", async () => {
    const config = getRecommendationConfig();

    const response = NextResponse.json<ApiSuccessResponse<RecommendationConfig & { meta: ReturnType<typeof createMeta> }>>({
      success: true,
      data: { ...config, meta: createMeta() },
    });

    // Cache for 1 hour — config changes rarely
    response.headers.set("Cache-Control", "public, max-age=3600, s-maxage=3600");

    return addPartnerHeaders(response, partner, context);
  });
}

// Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", origin || "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Authorization, X-API-Key, Content-Type");
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}
