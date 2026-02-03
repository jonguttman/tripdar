/**
 * Public Strain List API
 *
 * GET /api/v1/strains
 *
 * Returns a paginated list of strains in public view format.
 * Requires partner authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
  recordStrainList,
  toPublicViewList,
  createMeta,
  StrainListResponse,
  ApiSuccessResponse,
} from "@/domain/partner";
import { getAllStrains } from "@/domain/strain/data";

// Maximum page size to prevent bulk extraction
const MAX_PAGE_SIZE = 20;
const DEFAULT_PAGE_SIZE = 10;

export async function GET(request: NextRequest) {
  // Authenticate the request
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth; // Return error response
  }

  const { partner, context, sessionHash } = auth;

  return withLogging(context, "/api/v1/strains", async () => {
    // Parse pagination parameters
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE), 10))
    );

    // Parse optional filters
    const filters: Record<string, string> = {};
    const potencyFilter = searchParams.get("potency");
    const beginnerFilter = searchParams.get("beginner");

    if (potencyFilter) filters.potency = potencyFilter;
    if (beginnerFilter) filters.beginner = beginnerFilter;

    // Get all strains and apply filters
    let strains = getAllStrains();

    if (potencyFilter) {
      strains = strains.filter(s =>
        s.potency.toLowerCase().includes(potencyFilter.toLowerCase())
      );
    }

    if (beginnerFilter) {
      strains = strains.filter(s =>
        s.beginner.toLowerCase() === beginnerFilter.toLowerCase()
      );
    }

    // Calculate pagination
    const totalCount = strains.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    // Slice for current page
    const pageStrains = strains.slice(startIndex, endIndex);

    // Transform to public views
    const publicStrains = toPublicViewList(pageStrains);

    // Record exploration signal (anonymous)
    recordStrainList(partner.id, sessionHash, filters);

    // Build response
    const responseData: StrainListResponse = {
      strains: publicStrains,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
        hasMore: page < totalPages,
      },
      meta: createMeta(),
    };

    const response = NextResponse.json<ApiSuccessResponse<StrainListResponse>>({
      success: true,
      data: responseData,
    });

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
