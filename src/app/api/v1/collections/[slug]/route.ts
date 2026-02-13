/**
 * Collections API - Single Collection
 *
 * GET /api/v1/collections/[slug]
 *
 * Returns a single collection with its strain slugs.
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
import { getCollectionById, CollectionDetail } from "@/domain/collection";
import { loadStrainData } from "@/domain/strain/blob-store";

export interface CollectionDetailResponse {
  collection: CollectionDetail;
  meta: ReturnType<typeof createMeta>;
}

/**
 * Generate URL-safe slug from strain name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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

  const { partner, context } = auth;
  const { slug } = await params;

  return withLogging(context, `/api/v1/collections/${slug}`, async () => {
    const collection = await getCollectionById(slug);

    if (!collection) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "COLLECTION_NOT_FOUND",
            message: `Collection "${slug}" not found`,
          },
        },
        { status: 404 }
      );
    }

    // Get strain data to convert IDs to slugs
    const strains = await loadStrainData();
    const strainSlugs = collection.strains
      .map(strainId => {
        const strain = strains.find(s => s.id === strainId);
        return strain ? generateSlug(strain.name) : null;
      })
      .filter((slug): slug is string => slug !== null);

    // Build response
    const collectionDetail: CollectionDetail = {
      slug: collection.slug,
      name: collection.name,
      description: collection.description,
      strainCount: strainSlugs.length,
      coverImage: collection.coverImage,
      featured: collection.featured,
      tags: collection.tags,
      strains: strainSlugs,
    };

    const response = NextResponse.json<ApiSuccessResponse<CollectionDetailResponse>>({
      success: true,
      data: {
        collection: collectionDetail,
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
