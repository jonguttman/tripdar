/**
 * Admin Reviews API - List Reviews
 *
 * GET /api/admin/reviews - List reviews for moderation
 *
 * Requires GitHub OAuth authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { getReviewsForModeration, ReviewStatus } from "@/domain/rating";

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
 * GET /api/admin/reviews
 * List reviews for moderation
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") as ReviewStatus | null;
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "50", 10)));
    const offset = (page - 1) * pageSize;

    // Validate status if provided
    if (status && !["pending", "approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { success: false, error: { message: "Invalid status filter" } },
        { status: 400 }
      );
    }

    const { reviews, total } = await getReviewsForModeration(
      status || undefined,
      pageSize,
      offset
    );

    return NextResponse.json({
      success: true,
      data: {
        reviews,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
          hasMore: offset + reviews.length < total,
        },
      },
    });
  } catch (error) {
    console.error("Error loading reviews:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to load reviews" } },
      { status: 500 }
    );
  }
}
