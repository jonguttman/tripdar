/**
 * Strain Lineage API
 *
 * GET /api/v1/strains/[slug]/lineage
 *
 * Returns the family tree (ancestors and descendants) for a strain.
 * Requires partner authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
  recordSignal,
  createMeta,
  ApiSuccessResponse,
  ApiErrorResponse,
} from "@/domain/partner";
import { getStrainLineage, getDescendants, getAncestors, LineageNode } from "@/domain/lineage";
import { getStrainBySlug } from "@/domain/strain/data";

export interface LineageResponse {
  lineage: LineageNode;
  descendants: string[];
  ancestors: string[];
  meta: ReturnType<typeof createMeta>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  // Authenticate the request
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context, sessionHash } = auth;
  const { slug } = await params;

  return withLogging(context, `/api/v1/strains/${slug}/lineage`, async () => {
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

    // Get lineage data using the new service
    const lineageNode = getStrainLineage(slug);
    if (!lineageNode) {
      return addPartnerHeaders(
        NextResponse.json<ApiErrorResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Lineage data not available" } },
          { status: 404 }
        ),
        partner,
        context
      );
    }

    // Record signal
    recordSignal(partner.id, "lineage_view", sessionHash, [slug]);

    const response = NextResponse.json<ApiSuccessResponse<LineageResponse>>({
      success: true,
      data: {
        lineage: lineageNode,
        descendants: getDescendants(slug),
        ancestors: getAncestors(slug),
        meta: createMeta(),
      },
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
