/**
 * Strain Ratings API
 *
 * GET /api/v1/strains/[slug]/ratings - Get rating aggregation and approved reviews
 * POST /api/v1/strains/[slug]/ratings - Submit a rating
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
  createRating,
  getRatingAggregation,
  getApprovedReviews,
  hasSessionRatedStrain,
  RatingAggregation,
  PublicReview,
} from "@/domain/rating";

interface RatingsResponse {
  aggregation: RatingAggregation;
  recentReviews: PublicReview[];
  meta: ReturnType<typeof createMeta>;
}

interface CreateRatingResponse {
  success: boolean;
  aggregation: RatingAggregation;
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

  return withLogging(context, `/api/v1/strains/${slug}/ratings`, async () => {
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

    // Get aggregation and recent reviews
    const [aggregation, { reviews }] = await Promise.all([
      getRatingAggregation(slug),
      getApprovedReviews(slug, 5), // Get 5 most recent reviews
    ]);

    const response = NextResponse.json<ApiSuccessResponse<RatingsResponse>>({
      success: true,
      data: {
        aggregation,
        recentReviews: reviews,
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

  return withLogging(context, `/api/v1/strains/${slug}/ratings`, async () => {
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
    let body: { rating?: number };
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

    // Check if session has already rated this strain
    const alreadyRated = await hasSessionRatedStrain(sessionHash, slug);
    if (alreadyRated) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "ALREADY_RATED",
            message: "You have already rated this strain",
          },
        },
        { status: 409 }
      );
    }

    // Create rating
    await createRating({
      strainSlug: slug,
      rating,
      sessionHash,
      partnerId: partner.id,
    });

    // Get updated aggregation
    const aggregation = await getRatingAggregation(slug);

    const response = NextResponse.json<ApiSuccessResponse<CreateRatingResponse>>({
      success: true,
      data: {
        success: true,
        aggregation,
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
