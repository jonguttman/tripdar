/**
 * Strain Reviews API
 *
 * GET /api/v1/strains/[slug]/reviews - Get approved reviews for a strain
 * POST /api/v1/strains/[slug]/reviews - Submit a review (goes to moderation queue)
 *
 * Requires partner authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
  createMeta,
  ApiSuccessResponse,
  ApiErrorResponse,
} from "@/domain/partner";
import { getStrainBySlug } from "@/domain/strain/data";
import {
  createReview,
  getApprovedReviews,
  hasSessionReviewedStrain,
  PublicReview,
} from "@/domain/rating";

interface ReviewsResponse {
  reviews: PublicReview[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  meta: ReturnType<typeof createMeta>;
}

interface CreateReviewResponse {
  message: string;
  meta: ReturnType<typeof createMeta>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context } = auth;
  const { slug } = await params;

  // Get pagination params
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") || "10", 10)));

  return withLogging(context, `/api/v1/strains/${slug}/reviews`, async () => {
    // Verify strain exists
    const strain = getStrainBySlug(slug);
    if (!strain) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "STRAIN_NOT_FOUND",
            message: `No strain found with slug "${slug}"`,
          },
        },
        { status: 404 }
      );
    }

    const offset = (page - 1) * pageSize;
    const { reviews, total } = await getApprovedReviews(slug, pageSize, offset);

    const response = NextResponse.json<ApiSuccessResponse<ReviewsResponse>>({
      success: true,
      data: {
        reviews,
        total,
        page,
        pageSize,
        hasMore: offset + reviews.length < total,
        meta: createMeta(),
      },
    });

    return addPartnerHeaders(response, partner, context);
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context, sessionHash } = auth;
  const { slug } = await params;

  return withLogging(context, `/api/v1/strains/${slug}/reviews`, async () => {
    // Verify strain exists
    const strain = getStrainBySlug(slug);
    if (!strain) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "STRAIN_NOT_FOUND",
            message: `No strain found with slug "${slug}"`,
          },
        },
        { status: 404 }
      );
    }

    // Parse request body
    let body: { rating?: number; title?: string; body?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid JSON body",
          },
        },
        { status: 400 }
      );
    }

    // Validate rating
    const rating = body.rating;
    if (typeof rating !== "number" || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "INVALID_RATING",
            message: "Rating must be an integer between 1 and 5",
          },
        },
        { status: 400 }
      );
    }

    // Validate body
    const reviewBody = body.body;
    if (typeof reviewBody !== "string" || reviewBody.length < 10) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "INVALID_BODY",
            message: "Review body must be at least 10 characters",
          },
        },
        { status: 400 }
      );
    }

    if (reviewBody.length > 2000) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "BODY_TOO_LONG",
            message: "Review body must be less than 2000 characters",
          },
        },
        { status: 400 }
      );
    }

    // Check if session has already reviewed this strain
    const alreadyReviewed = await hasSessionReviewedStrain(sessionHash, slug);
    if (alreadyReviewed) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "ALREADY_REVIEWED",
            message: "You have already reviewed this strain",
          },
        },
        { status: 409 }
      );
    }

    // Create review (goes to moderation queue)
    await createReview({
      strainSlug: slug,
      rating,
      title: body.title,
      body: reviewBody,
      sessionHash,
      partnerId: partner.id,
    });

    const response = NextResponse.json<ApiSuccessResponse<CreateReviewResponse>>({
      success: true,
      data: {
        message: "Review submitted and pending moderation",
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
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Authorization, X-API-Key, Content-Type");
  response.headers.set("Access-Control-Max-Age", "86400");

  return response;
}
