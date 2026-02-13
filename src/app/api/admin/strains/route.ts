/**
 * Admin Strain API - List & Create
 *
 * GET /api/admin/strains - List all strains
 * POST /api/admin/strains - Create a new strain
 *
 * Requires GitHub OAuth authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import {
  loadStrainData,
  createStrain,
  initializeBlobStorage,
} from "@/domain/strain/blob-store";

/**
 * Check if user is authenticated
 */
async function requireAuth(_request: NextRequest) {
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
 * GET /api/admin/strains
 * List all strains
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const strains = await loadStrainData();

    return NextResponse.json({
      success: true,
      data: {
        strains,
        count: strains.length,
      },
    });
  } catch (error) {
    console.error("Error loading strains:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to load strains" } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/strains
 * Create a new strain
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();

    // Validate required fields
    const required = ["name", "potency", "stability", "beginner", "visual", "vibe", "description"];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json(
          { success: false, error: { message: `Missing required field: ${field}` } },
          { status: 400 }
        );
      }
    }

    // Ensure vibe is an array
    if (!Array.isArray(body.vibe)) {
      body.vibe = body.vibe.split(",").map((v: string) => v.trim()).filter(Boolean);
    }

    // Default confidence if not provided
    if (typeof body.confidence !== "number") {
      body.confidence = 50;
    }

    const strain = await createStrain(
      {
        name: body.name,
        potency: body.potency,
        stability: body.stability,
        beginner: body.beginner,
        visual: body.visual,
        vibe: body.vibe,
        confidence: body.confidence,
        description: body.description,
      },
      auth.user?.email || "unknown"
    );

    return NextResponse.json({
      success: true,
      data: { strain },
    });
  } catch (error) {
    console.error("Error creating strain:", error);
    const message = error instanceof Error ? error.message : "Failed to create strain";
    return NextResponse.json(
      { success: false, error: { message } },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/strains (special: initialize blob storage)
 * Initialize blob storage with hardcoded data
 */
export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    await initializeBlobStorage(auth.user?.email || "unknown");

    return NextResponse.json({
      success: true,
      data: { message: "Blob storage initialized" },
    });
  } catch (error) {
    console.error("Error initializing blob storage:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to initialize blob storage" } },
      { status: 500 }
    );
  }
}
