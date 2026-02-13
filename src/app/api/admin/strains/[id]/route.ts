/**
 * Admin Strain API - Single Strain Operations
 *
 * GET /api/admin/strains/[id] - Get a single strain
 * PUT /api/admin/strains/[id] - Update a strain
 * DELETE /api/admin/strains/[id] - Delete a strain
 *
 * Requires GitHub OAuth authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import {
  getStrainById,
  updateStrain,
  deleteStrain,
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
 * GET /api/admin/strains/[id]
 * Get a single strain by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const strain = await getStrainById(id);

    if (!strain) {
      return NextResponse.json(
        { success: false, error: { message: "Strain not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { strain },
    });
  } catch (error) {
    console.error("Error loading strain:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to load strain" } },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/strains/[id]
 * Update a strain
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const body = await request.json();

    // Ensure vibe is an array if provided
    if (body.vibe && !Array.isArray(body.vibe)) {
      body.vibe = body.vibe.split(",").map((v: string) => v.trim()).filter(Boolean);
    }

    const strain = await updateStrain(
      id,
      body,
      auth.user?.email || "unknown"
    );

    return NextResponse.json({
      success: true,
      data: { strain },
    });
  } catch (error) {
    console.error("Error updating strain:", error);
    const message = error instanceof Error ? error.message : "Failed to update strain";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json(
      { success: false, error: { message } },
      { status }
    );
  }
}

/**
 * DELETE /api/admin/strains/[id]
 * Delete a strain
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    await deleteStrain(id, auth.user?.email || "unknown");

    return NextResponse.json({
      success: true,
      data: { message: "Strain deleted" },
    });
  } catch (error) {
    console.error("Error deleting strain:", error);
    const message = error instanceof Error ? error.message : "Failed to delete strain";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json(
      { success: false, error: { message } },
      { status }
    );
  }
}
