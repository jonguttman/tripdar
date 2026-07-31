/**
 * Admin Review Moderation API - Single Review
 *
 * GET /api/admin/reviews/[id] - Get a single review
 * PUT /api/admin/reviews/[id] - Moderate (approve/reject) a review
 *
 * Requires GitHub OAuth authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/domain/auth/adminSession";
import { getReviewById, moderateReview } from "@/domain/rating";

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
 * GET /api/admin/reviews/[id]
 * Get a single review
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const review = await getReviewById(id);

    if (!review) {
      return NextResponse.json(
        { success: false, error: { message: "Review not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { review },
    });
  } catch (error) {
    console.error("Error loading review:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to load review" } },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/reviews/[id]
 * Moderate (approve/reject) a review
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = await request.json();

    // Validate status
    if (!body.status || !["approved", "rejected"].includes(body.status)) {
      return NextResponse.json(
        { success: false, error: { message: "Status must be 'approved' or 'rejected'" } },
        { status: 400 }
      );
    }

    // Check if review exists
    const existing = await getReviewById(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { message: "Review not found" } },
        { status: 404 }
      );
    }

    const review = await moderateReview({
      reviewId: id,
      status: body.status,
      moderatorId: auth.user?.email || "unknown",
    });

    return NextResponse.json({
      success: true,
      data: { review },
    });
  } catch (error) {
    console.error("Error moderating review:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to moderate review" } },
      { status: 500 }
    );
  }
}
