/**
 * Collections API - List
 *
 * GET /api/v1/collections
 *
 * Returns all public collections.
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
import { loadCollections, CollectionPublicView } from "@/domain/collection";

export interface CollectionsResponse {
  collections: CollectionPublicView[];
  meta: ReturnType<typeof createMeta>;
}

export async function GET(request: NextRequest) {
  // Authenticate the request
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context } = auth;

  return withLogging(context, "/api/v1/collections", async () => {
    const collections = await loadCollections();

    // Transform to public view
    const publicCollections: CollectionPublicView[] = collections.map(c => ({
      slug: c.slug,
      name: c.name,
      description: c.description,
      strainCount: c.strains.length,
      coverImage: c.coverImage,
      featured: c.featured,
      tags: c.tags,
    }));

    const response = NextResponse.json<ApiSuccessResponse<CollectionsResponse>>({
      success: true,
      data: {
        collections: publicCollections,
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
