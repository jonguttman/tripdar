/**
 * Public Strain Detail API
 *
 * GET /api/v1/strains/:slug
 *
 * Returns a single strain by slug in public view format.
 * Requires partner authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
  recordStrainView,
  toPublicView,
  createMeta,
  StrainDetailResponse,
  ApiSuccessResponse,
  ApiErrorResponse,
} from "@/domain/partner";
import { getStrainBySlug } from "@/domain/strain/data";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  // Authenticate the request
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth; // Return error response
  }

  const { partner, context, sessionHash } = auth;
  const { slug } = await params;

  return withLogging(context, `/api/v1/strains/${slug}`, async () => {
    // Find strain by slug
    const strain = getStrainBySlug(slug);

    if (!strain) {
      const response = NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "STRAIN_NOT_FOUND",
            message: `No strain found with slug "${slug}"`,
          },
        },
        { status: 404 }
      );
      return addPartnerHeaders(response, partner, context);
    }

    // Transform to public view
    const publicStrain = toPublicView(strain);

    // Record exploration signal (anonymous)
    recordStrainView(partner.id, sessionHash, slug);

    // Build response
    const responseData: StrainDetailResponse = {
      strain: publicStrain,
      meta: createMeta(),
    };

    const response = NextResponse.json<ApiSuccessResponse<StrainDetailResponse>>({
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
