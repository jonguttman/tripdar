/**
 * Admin Ratings API
 *
 * GET /api/admin/ratings - Get strain rating statistics
 *
 * Requires GitHub OAuth authentication.
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/domain/auth/adminSession";
import { prisma } from "@/lib/prisma";

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
 * GET /api/admin/ratings
 * Get rating statistics grouped by strain
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    // Get all ratings grouped by strain with stats
    const ratingsGrouped = await prisma.strainRating.groupBy({
      by: ["strainSlug"],
      _count: { id: true },
      _avg: { rating: true },
      _max: { createdAt: true },
      orderBy: {
        _max: { createdAt: "desc" }, // Most recently rated first
      },
    });

    const ratings = ratingsGrouped.map((group) => ({
      strainSlug: group.strainSlug,
      ratingCount: group._count.id,
      avgRating: group._avg.rating || 0,
      latestRatingAt: group._max.createdAt?.toISOString() || new Date().toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: {
        ratings,
        totalStrains: ratings.length,
      },
    });
  } catch (error) {
    console.error("Error loading ratings:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to load ratings";
    return NextResponse.json(
      { success: false, error: { message: `Ratings error: ${errorMessage}` } },
      { status: 500 }
    );
  }
}
