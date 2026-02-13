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
} from "@/domain/partner";
import { loadStrainData } from "@/domain/strain/blob-store";
import { InternalStrain, StrainLineageNode } from "@/domain/strain/types";

export interface LineageResponse {
  lineage: StrainLineageNode;
  meta: ReturnType<typeof createMeta>;
}

/**
 * Build a lineage tree node from a strain
 */
function buildLineageNode(
  strain: InternalStrain,
  allStrains: InternalStrain[],
  depth: number = 0,
  maxDepth: number = 5,
  visited: Set<string> = new Set()
): StrainLineageNode {
  // Prevent infinite loops
  if (visited.has(strain.id)) {
    return {
      id: strain.id,
      name: strain.name,
      potency: strain.potency,
      beginner: strain.beginner,
      parents: [],
      children: [],
      lineageNotes: strain.lineageNotes,
      generation: strain.generation,
    };
  }

  visited.add(strain.id);

  // Get parent nodes recursively (up to maxDepth)
  const parents: StrainLineageNode[] = [];
  if (depth < maxDepth && strain.parentStrains && strain.parentStrains.length > 0) {
    for (const parentId of strain.parentStrains) {
      const parentStrain = allStrains.find(s => s.id === parentId);
      if (parentStrain) {
        parents.push(buildLineageNode(parentStrain, allStrains, depth + 1, maxDepth, visited));
      }
    }
  }

  // Find children (strains that list this strain as a parent)
  const children = allStrains
    .filter(s => s.parentStrains?.includes(strain.id))
    .map(s => s.id);

  return {
    id: strain.id,
    name: strain.name,
    potency: strain.potency,
    beginner: strain.beginner,
    parents,
    children,
    lineageNotes: strain.lineageNotes,
    generation: strain.generation,
  };
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

  const { partner, context, sessionHash } = auth;
  const { slug } = await params;

  return withLogging(context, `/api/v1/strains/${slug}/lineage`, async () => {
    const strains = await loadStrainData();

    // Find the strain
    const strain = strains.find(s => {
      const strainSlug = generateSlug(s.name);
      return strainSlug === slug || s.id === slug;
    });

    if (!strain) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "STRAIN_NOT_FOUND",
            message: `Strain "${slug}" not found`,
          },
        },
        { status: 404 }
      );
    }

    // Build lineage tree
    const lineage = buildLineageNode(strain, strains);

    // Record signal
    recordSignal(partner.id, "lineage_view", sessionHash, [slug]);

    const response = NextResponse.json<ApiSuccessResponse<LineageResponse>>({
      success: true,
      data: {
        lineage,
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
