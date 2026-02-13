/**
 * Quiz Recommendation API
 *
 * POST /api/v1/quiz
 *
 * Accepts quiz answers and returns a strain recommendation
 * filtered to the partner's available inventory.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
  createMeta,
  generateRecommendation,
  validateQuizSubmission,
  recordSignal,
  ApiSuccessResponse,
  ApiErrorResponse,
  DEFAULT_QUIZ_QUESTIONS,
} from "@/domain/partner";
import type { QuizRecommendation } from "@/domain/partner";

interface QuizRequestBody {
  answers: Record<string, string>;
  availableStrains?: string[];
}

interface QuizResponse {
  recommendation: {
    strain: QuizRecommendation["strain"];
    reasoning: string;
    alternatives?: QuizRecommendation["alternatives"];
  };
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

  return withLogging(context, "/api/v1/quiz", async () => {
    // Parse request body
    let body: QuizRequestBody;
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

    // Validate submission
    const submission = {
      partnerId: partner.id,
      answers: body.answers || {},
      availableStrains: body.availableStrains || [],
      sessionHash,
    };

    const validationErrors = validateQuizSubmission(submission);
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

    // Generate recommendation
    const recommendation = generateRecommendation(submission);

    if (!recommendation) {
      const response = NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "NO_STRAINS_AVAILABLE",
            message: "No strains available matching the provided inventory filter",
          },
        },
        { status: 404 }
      );
      return addPartnerHeaders(response, partner, context);
    }

    // Record quiz signal (anonymous)
    recordSignal(
      partner.id,
      "search", // Using search as the event type for quiz
      sessionHash,
      [recommendation.strain.slug],
      { quiz_completed: "true" }
    );

    // Build response (exclude internal score)
    const responseData: QuizResponse = {
      recommendation: {
        strain: recommendation.strain,
        reasoning: recommendation.reasoning,
        alternatives: recommendation.alternatives,
      },
      meta: createMeta(),
    };

    const response = NextResponse.json<ApiSuccessResponse<QuizResponse>>({
      success: true,
      data: responseData,
    });

    return addPartnerHeaders(response, partner, context);
  });
}

// GET endpoint to retrieve quiz questions
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context } = auth;

  return withLogging(context, "/api/v1/quiz", async () => {
    const response = NextResponse.json<ApiSuccessResponse<{ questions: typeof DEFAULT_QUIZ_QUESTIONS }>>({
      success: true,
      data: {
        questions: DEFAULT_QUIZ_QUESTIONS,
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
