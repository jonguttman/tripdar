/**
 * Admin Collections API - List & Create
 *
 * GET /api/admin/collections - List all collections
 * POST /api/admin/collections - Create a new collection
 *
 * Requires GitHub OAuth authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { loadCollections, createCollection } from "@/domain/collection";

/**
 * Check if user is authenticated
 */
async function requireAuth() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json(
      { success: false, error: { message: "Unauthorized" } },
      { status: 401 }
    );
  }

  return session;
}

/**
 * GET /api/admin/collections
 * List all collections
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const collections = await loadCollections();

    return NextResponse.json({
      success: true,
      data: {
        collections,
        count: collections.length,
      },
    });
  } catch (error) {
    console.error("Error loading collections:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to load collections" } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/collections
 * Create a new collection
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();

    // Validate required fields
    const required = ["name", "description"];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json(
          { success: false, error: { message: `Missing required field: ${field}` } },
          { status: 400 }
        );
      }
    }

    // Set defaults
    if (!Array.isArray(body.strains)) {
      body.strains = [];
    }
    if (typeof body.featured !== "boolean") {
      body.featured = false;
    }
    if (typeof body.sortOrder !== "number") {
      body.sortOrder = 0;
    }

    const collection = await createCollection(
      {
        name: body.name,
        description: body.description,
        strains: body.strains,
        coverImage: body.coverImage,
        featured: body.featured,
        sortOrder: body.sortOrder,
        tags: body.tags,
      },
      auth.user?.email || "unknown"
    );

    return NextResponse.json({
      success: true,
      data: { collection },
    });
  } catch (error) {
    console.error("Error creating collection:", error);
    const message = error instanceof Error ? error.message : "Failed to create collection";
    return NextResponse.json(
      { success: false, error: { message } },
      { status: 500 }
    );
  }
}
