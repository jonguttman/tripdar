/**
 * Public Strain List API
 *
 * GET /api/v1/strains
 *
 * Returns a paginated list of strains in public view format.
 * Requires partner authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { list } from "@vercel/blob";
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
import { loadStrainData } from "@/domain/strain/blob-store";
import { findStrainImageUrl, filterImageBlobs } from "@/domain/strain/images";

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
    const vibeFilter = searchParams.get("vibe");

    if (potencyFilter) filters.potency = potencyFilter;
    if (beginnerFilter) filters.beginner = beginnerFilter;
    if (vibeFilter) filters.vibe = vibeFilter;

    // Get all strains and apply filters
    let strains = await loadStrainData();

    // Vibe filter - check if any vibe matches
    if (vibeFilter) {
      const vibeSearch = vibeFilter.toLowerCase();
      strains = strains.filter(s =>
        s.vibe.some(v => v.toLowerCase().includes(vibeSearch))
      );
    }

    // Potency/intensity filter
    // Map UI values: "gentle" → low, "moderate" → moderate, "intense" → high
    if (potencyFilter) {
      const potencySearch = potencyFilter.toLowerCase();
      strains = strains.filter(s => {
        const p = s.potency.toLowerCase();
        if (potencySearch === "gentle") {
          return p.includes("low");
        } else if (potencySearch === "intense") {
          return p.includes("high") || p.includes("very high");
        } else if (potencySearch === "moderate") {
          return p.includes("moderate") || p.includes("medium");
        }
        // Direct match fallback
        return p.includes(potencySearch);
      });
    }

    // Beginner/experience filter
    // Map UI values: "beginner" → yes, "experienced" → no or maybe
    if (beginnerFilter) {
      const beginnerSearch = beginnerFilter.toLowerCase();
      strains = strains.filter(s => {
        const b = s.beginner.toLowerCase();
        if (beginnerSearch === "beginner") {
          return b === "yes";
        } else if (beginnerSearch === "experienced") {
          return b === "no" || b === "maybe";
        }
        // Direct match fallback (yes/no/maybe)
        return b === beginnerSearch;
      });
    }

    // Calculate pagination
    const totalCount = strains.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    // Slice for current page
    const pageStrains = strains.slice(startIndex, endIndex);

    // Fetch blob list once for visualization URLs and image URLs
    let imageBlobs: { pathname: string; url: string }[] = [];
    const visualizationMap: Map<string, string> = new Map();
    try {
      const { blobs } = await list({ prefix: "Strain_Graphics/" });
      imageBlobs = filterImageBlobs(blobs);

      // Build lookup by normalized strain name
      for (const blob of imageBlobs) {
        const filename = blob.pathname.replace("Strain_Graphics/", "").replace(/\.(png|jpg|jpeg|webp|gif)$/i, "");
        const normalizedName = filename.toLowerCase().replace(/[^a-z0-9]/g, "");
        visualizationMap.set(normalizedName, blob.url);
      }
    } catch (error) {
      console.error("Error fetching visualizations:", error);
    }

    // Helper to find visualization URL for a strain
    const getVisualizationUrl = (strainId: string) => {
      const strain = pageStrains.find(s => s.id === strainId);
      if (!strain) return undefined;
      const normalizedName = strain.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      return visualizationMap.get(normalizedName);
    };

    // Attach imageUrl to each strain before mapping to public view
    for (const strain of pageStrains) {
      strain.imageUrl = findStrainImageUrl(strain.name, imageBlobs) ?? undefined;
    }

    // Transform to public views with visualization URLs
    const publicStrains = toPublicViewList(pageStrains, getVisualizationUrl);

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
