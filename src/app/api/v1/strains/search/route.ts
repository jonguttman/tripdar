/**
 * Strain Search API
 *
 * GET /api/v1/strains/search
 *
 * Returns strains matching a search query with fuzzy matching.
 * Requires partner authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
  recordSearch,
  createMeta,
  ApiSuccessResponse,
} from "@/domain/partner";
import { loadStrainData } from "@/domain/strain/blob-store";

const MAX_RESULTS = 20;
const DEFAULT_RESULTS = 10;

export interface SearchResult {
  slug: string;
  name: string;
  matchType: "exact" | "prefix" | "contains" | "fuzzy";
  potencyTier: string;
  beginnerSuitable: string;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  meta: ReturnType<typeof createMeta>;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
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

/**
 * Map internal potency to public tier
 */
function mapPotencyTier(potency: string): string {
  const p = potency.toLowerCase();
  if (p.includes("very high")) return "very-high";
  if (p.includes("high")) return "high";
  if (p.includes("low")) return "low";
  if (p.includes("variable")) return "variable";
  return "moderate";
}

export async function GET(request: NextRequest) {
  // Authenticate the request
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context, sessionHash } = auth;

  return withLogging(context, "/api/v1/strains/search", async () => {
    const searchParams = request.nextUrl.searchParams;
    const query = (searchParams.get("q") || "").trim();
    const limit = Math.min(
      MAX_RESULTS,
      Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_RESULTS), 10))
    );

    if (!query) {
      return NextResponse.json<ApiSuccessResponse<SearchResponse>>({
        success: true,
        data: {
          results: [],
          query: "",
          meta: createMeta(),
        },
      });
    }

    const strains = await loadStrainData();
    const q = query.toLowerCase();

    // Score and match strains
    const matches = strains
      .map((strain) => {
        const name = strain.name.toLowerCase();
        let matchType: "exact" | "prefix" | "contains" | "fuzzy" | null = null;
        let score = 0;

        if (name === q) {
          matchType = "exact";
          score = 100;
        } else if (name.startsWith(q)) {
          matchType = "prefix";
          score = 80 - (name.length - q.length); // Prefer shorter matches
        } else if (name.includes(q)) {
          matchType = "contains";
          score = 60 - name.indexOf(q); // Prefer earlier matches
        } else {
          // Fuzzy match with Levenshtein
          const distance = levenshteinDistance(name, q);
          const maxDistance = Math.max(2, Math.floor(q.length / 3));
          if (distance <= maxDistance) {
            matchType = "fuzzy";
            score = 40 - distance * 10;
          }
        }

        // Also check vibes for keyword matches
        if (!matchType && strain.vibe.some((v) => v.toLowerCase().includes(q))) {
          matchType = "contains";
          score = 30;
        }

        return { strain, matchType, score };
      })
      .filter((r) => r.matchType !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Transform to search results
    const results: SearchResult[] = matches.map((m) => ({
      slug: generateSlug(m.strain.name),
      name: m.strain.name,
      matchType: m.matchType!,
      potencyTier: mapPotencyTier(m.strain.potency),
      beginnerSuitable: m.strain.beginner.toLowerCase(),
    }));

    // Record search signal
    recordSearch(partner.id, sessionHash, query);

    const response = NextResponse.json<ApiSuccessResponse<SearchResponse>>({
      success: true,
      data: {
        results,
        query,
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
