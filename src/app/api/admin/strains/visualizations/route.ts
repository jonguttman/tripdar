/**
 * Admin Strain Visualizations API
 *
 * GET /api/admin/strains/visualizations - Get visualization URLs for all strains
 *
 * Requires GitHub OAuth authentication.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { list } from "@vercel/blob";
import { loadStrainData } from "@/domain/strain/blob-store";

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
 * GET /api/admin/strains/visualizations
 * Get visualization URLs for all strains
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    // Load all strains
    const strains = await loadStrainData();

    // Fetch blob list for Strain_Graphics
    const visualizations: Record<string, string> = {};

    try {
      const { blobs } = await list({ prefix: "Strain_Graphics/" });
      const imageBlobs = blobs.filter(
        (blob) =>
          blob.pathname &&
          !blob.pathname.endsWith("/") &&
          /\.(png|jpg|jpeg|webp|gif)$/i.test(blob.pathname)
      );

      // Build lookup by normalized strain name
      const visualizationMap = new Map<string, string>();
      for (const blob of imageBlobs) {
        const filename = blob.pathname
          .replace("Strain_Graphics/", "")
          .replace(/\.(png|jpg|jpeg|webp|gif)$/i, "");
        const normalizedName = filename.toLowerCase().replace(/[^a-z0-9]/g, "");
        visualizationMap.set(normalizedName, blob.url);
      }

      // Match strains to their visualization URLs
      for (const strain of strains) {
        const normalizedName = strain.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        const url = visualizationMap.get(normalizedName);
        if (url) {
          visualizations[strain.id] = url;
        }
      }
    } catch (error) {
      console.error("Error fetching visualizations from blob:", error);
    }

    return NextResponse.json({
      success: true,
      data: { visualizations },
    });
  } catch (error) {
    console.error("Error loading visualizations:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to load visualizations" } },
      { status: 500 }
    );
  }
}
