/**
 * Admin Collections API - Single Collection Operations
 *
 * GET /api/admin/collections/[id] - Get a single collection
 * PUT /api/admin/collections/[id] - Update a collection
 * DELETE /api/admin/collections/[id] - Delete a collection
 *
 * Requires GitHub OAuth authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/domain/auth/adminSession";
import {
  getCollectionById,
  updateCollection,
  deleteCollection,
} from "@/domain/collection";

/**
 * Check if user is authenticated
 */
async function requireAuth() {
  const session = await getAdminSession();

  if (!session?.user?.email) {
    return NextResponse.json(
      { success: false, error: { message: "Unauthorized" } },
      { status: 401 }
    );
  }

  return session;
}

/**
 * GET /api/admin/collections/[id]
 * Get a single collection by ID
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const collection = await getCollectionById(id);

    if (!collection) {
      return NextResponse.json(
        { success: false, error: { message: "Collection not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { collection },
    });
  } catch (error) {
    console.error("Error loading collection:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to load collection" } },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/collections/[id]
 * Update a collection
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const body = await request.json();

    const collection = await updateCollection(
      id,
      body,
      auth.user?.email || "unknown"
    );

    return NextResponse.json({
      success: true,
      data: { collection },
    });
  } catch (error) {
    console.error("Error updating collection:", error);
    const message = error instanceof Error ? error.message : "Failed to update collection";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json(
      { success: false, error: { message } },
      { status }
    );
  }
}

/**
 * DELETE /api/admin/collections/[id]
 * Delete a collection
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    await deleteCollection(id, auth.user?.email || "unknown");

    return NextResponse.json({
      success: true,
      data: { message: "Collection deleted" },
    });
  } catch (error) {
    console.error("Error deleting collection:", error);
    const message = error instanceof Error ? error.message : "Failed to delete collection";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json(
      { success: false, error: { message } },
      { status }
    );
  }
}
