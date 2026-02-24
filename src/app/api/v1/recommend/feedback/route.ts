/**
 * Recommendation Feedback API
 *
 * POST /api/v1/recommend/feedback
 *
 * Accepts quick match ratings for recommendation results.
 * Updates FeedbackAggregate counters via the feedback module.
 * Requires partner authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
  createMeta,
  ApiSuccessResponse,
  ApiErrorResponse,
} from "@/domain/partner";
import { determinePrimaryIntent, aggregateFeedback } from "@/domain/recommendation-engine/feedback";

const VALID_RATINGS = ["nailed_it", "pretty_close", "missed"] as const;

interface FeedbackBody {
  sessionToken: string;
  resultId: string;
  quickRating: (typeof VALID_RATINGS)[number];
  actualDoseMg?: number;
  note?: string;
}

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context } = auth;

  return withLogging(context, "/api/v1/recommend/feedback", async () => {
    let body: FeedbackBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!body.resultId || typeof body.resultId !== "string") {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "MISSING_RESULT_ID", message: "resultId is required" } },
        { status: 400 }
      );
    }

    if (!body.quickRating || !VALID_RATINGS.includes(body.quickRating)) {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "INVALID_RATING", message: `quickRating must be one of: ${VALID_RATINGS.join(", ")}` } },
        { status: 400 }
      );
    }

    // Verify the result exists
    const result = await prisma.recommendationResult.findUnique({
      where: { id: body.resultId },
      include: { session: true },
    });

    if (!result) {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "RESULT_NOT_FOUND", message: "Recommendation result not found" } },
        { status: 404 }
      );
    }

    // Check for duplicate feedback
    const existing = await prisma.recommendationFeedback.findUnique({
      where: { resultId: body.resultId },
    });

    if (existing) {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "DUPLICATE_FEEDBACK", message: "Feedback already submitted for this result" } },
        { status: 409 }
      );
    }

    // Create feedback record
    const feedback = await prisma.recommendationFeedback.create({
      data: {
        resultId: body.resultId,
        quickRating: body.quickRating,
        actualDoseMg: body.actualDoseMg ?? null,
        note: body.note?.slice(0, 500) ?? null,
      },
    });

    // Update FeedbackAggregate using extracted module
    const intentVector = JSON.parse(result.session.intentVector);
    const intentCategory = determinePrimaryIntent(intentVector);
    await aggregateFeedback(result.strainSlug, intentCategory, body.quickRating);

    const response = NextResponse.json<ApiSuccessResponse<{
      feedbackId: string;
      recorded: true;
      showDeepDive: boolean;
      meta: ReturnType<typeof createMeta>;
    }>>({
      success: true,
      data: {
        feedbackId: feedback.id,
        recorded: true,
        showDeepDive: body.quickRating !== "missed",
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
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Authorization, X-API-Key, Content-Type");
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}
