/**
 * Feedback Rating API
 *
 * POST /api/v1/feedback
 *
 * Accepts match ratings for strain descriptions.
 * Returns whether a detailed survey is recommended.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
  createMeta,
  recordRating,
  validateRating,
  recordSignal,
  ApiSuccessResponse,
  ApiErrorResponse,
} from "@/domain/partner";

interface FeedbackRequestBody {
  strainSlug: string;
  /** 0.0 = "Not at all", 1.0 = "Spot on" */
  matchRating: number;
}

interface FeedbackResponse {
  id: string;
  recorded: boolean;
  /** True if rating is low and survey is recommended */
  surveyRecommended: boolean;
  message: string;
  meta: {
    source: "tripdar";
    version: string;
    generatedAt: string;
  };
}

export async function POST(request: NextRequest) {
  // Authenticate the request
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context, sessionHash } = auth;

  return withLogging(context, "/api/v1/feedback", async () => {
    // Parse request body
    let body: FeedbackRequestBody;
    try {
      body = await request.json();
    } catch {
      const response = NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "INVALID_JSON",
            message: "Request body must be valid JSON",
          },
        },
        { status: 400 }
      );
      return addPartnerHeaders(response, partner, context);
    }

    // Validate
    const validationErrors = validateRating(body);
    if (validationErrors.length > 0) {
      const response = NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: validationErrors.join("; "),
          },
        },
        { status: 400 }
      );
      return addPartnerHeaders(response, partner, context);
    }

    // Record the rating
    const result = await recordRating(
      partner.id,
      sessionHash,
      body.strainSlug,
      body.matchRating
    );

    // Record signal
    recordSignal(
      partner.id,
      "strain_view", // Feedback is associated with viewing
      sessionHash,
      [body.strainSlug],
      { feedback_rating: body.matchRating.toFixed(2) }
    );

    // Build response message
    let message: string;
    if (body.matchRating >= 0.7) {
      message = "Thank you for sharing your experience!";
    } else {
      message = "Your feedback helps us improve. Would you share a bit more?";
    }

    const responseData: FeedbackResponse = {
      id: result.id,
      recorded: true,
      surveyRecommended: result.needsSurvey,
      message,
      meta: createMeta(),
    };

    const response = NextResponse.json<ApiSuccessResponse<FeedbackResponse>>({
      success: true,
      data: responseData,
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
