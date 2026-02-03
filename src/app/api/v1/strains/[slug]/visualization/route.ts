/**
 * Strain Visualization API
 *
 * GET /api/v1/strains/:slug/visualization
 *
 * Returns a short-lived reference to the strain's visualization asset.
 * This prevents hotlinking and allows Tripdar to control asset access.
 */

import { NextRequest, NextResponse } from "next/server";
import { list } from "@vercel/blob";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
  createMeta,
  ApiSuccessResponse,
  ApiErrorResponse,
} from "@/domain/partner";
import { signVisualizationUrl } from "@/domain/partner/signedUrls";
import { getStrainBySlug } from "@/domain/strain/data";

interface VisualizationResponse {
  strainSlug: string;
  visualizationUrl: string;
  expiresAt: string;
  meta: {
    source: "tripdar";
    version: string;
    generatedAt: string;
  };
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

  return withLogging(context, `/api/v1/strains/${slug}/visualization`, async () => {
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

    // Try to find matching image in blob storage
    try {
      const { blobs } = await list({ prefix: "Strain_Graphics/" });

      // Find matching image
      const normalizedStrainName = strain.name.toLowerCase().replace(/[^a-z0-9]/g, "");

      const matchingBlob = blobs.find(blob => {
        const filename = blob.pathname.replace("Strain_Graphics/", "").replace(/\.(png|jpg|jpeg|webp|gif)$/i, "");
        const normalizedFilename = filename.toLowerCase().replace(/[^a-z0-9]/g, "");

        return (
          normalizedFilename === normalizedStrainName ||
          normalizedFilename.includes(normalizedStrainName) ||
          normalizedStrainName.includes(normalizedFilename)
        );
      });

      if (!matchingBlob) {
        const response = NextResponse.json<ApiErrorResponse>(
          {
            success: false,
            error: {
              code: "VISUALIZATION_NOT_AVAILABLE",
              message: `No visualization available for strain "${slug}"`,
            },
          },
          { status: 404 }
        );
        return addPartnerHeaders(response, partner, context);
      }

      // Generate signed URL with expiry
      // This prevents hotlinking and ensures URLs expire
      const signedResult = signVisualizationUrl(
        matchingBlob.url,
        partner.id,
        slug,
        60 // 60 minutes expiry
      );

      const responseData: VisualizationResponse = {
        strainSlug: slug,
        visualizationUrl: signedResult.signedUrl,
        expiresAt: signedResult.expiresAt,
        meta: createMeta(),
      };

      const response = NextResponse.json<ApiSuccessResponse<VisualizationResponse>>({
        success: true,
        data: responseData,
      });

      // Shorter cache for visualization URLs
      response.headers.set("Cache-Control", "private, max-age=300");

      return addPartnerHeaders(response, partner, context);
    } catch (error) {
      console.error("Error fetching visualization:", error);

      const response = NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "VISUALIZATION_ERROR",
            message: "Unable to retrieve visualization at this time",
          },
        },
        { status: 500 }
      );
      return addPartnerHeaders(response, partner, context);
    }
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
