/**
 * Feedback Survey API
 *
 * GET /api/v1/feedback/survey - Get survey questions
 * POST /api/v1/feedback/survey - Submit detailed survey
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
  createMeta,
  recordSurvey,
  validateSurvey,
  getSurveyQuestions,
  recordSignal,
  ApiSuccessResponse,
  ApiErrorResponse,
} from "@/domain/partner";
import type { SurveyQuestion } from "@/domain/partner";

interface SurveySubmitBody {
  strainSlug: string;
  matchRating: number;
  responses: Record<string, string | string[]>;
  freeformText?: string;
}

interface SurveySubmitResponse {
  id: string;
  recorded: boolean;
  message: string;
  meta: {
    source: "tripdar";
    version: string;
    generatedAt: string;
  };
}

interface SurveyQuestionsResponse {
  questions: SurveyQuestion[];
  meta: {
    source: "tripdar";
    version: string;
    generatedAt: string;
  };
}

// GET - Retrieve survey questions
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context } = auth;

  return withLogging(context, "/api/v1/feedback/survey", async () => {
    const questions = getSurveyQuestions();

    const responseData: SurveyQuestionsResponse = {
      questions,
      meta: createMeta(),
    };

    const response = NextResponse.json<ApiSuccessResponse<SurveyQuestionsResponse>>({
      success: true,
      data: responseData,
    });

    // Cache survey questions for 1 hour
    response.headers.set("Cache-Control", "public, max-age=3600");

    return addPartnerHeaders(response, partner, context);
  });
}

// POST - Submit survey responses
export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context, sessionHash } = auth;

  return withLogging(context, "/api/v1/feedback/survey", async () => {
    // Parse request body
    let body: SurveySubmitBody;
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
    const validationErrors = validateSurvey(body);
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

    // Record the survey
    const result = recordSurvey(
      partner.id,
      sessionHash,
      body.strainSlug,
      body.matchRating,
      body.responses,
      body.freeformText
    );

    // Record signal
    recordSignal(
      partner.id,
      "strain_view",
      sessionHash,
      [body.strainSlug],
      { survey_completed: "true" }
    );

    const responseData: SurveySubmitResponse = {
      id: result.id,
      recorded: true,
      message: "Thank you, fellow traveler. Your wisdom strengthens the codex.",
      meta: createMeta(),
    };

    const response = NextResponse.json<ApiSuccessResponse<SurveySubmitResponse>>({
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
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Authorization, X-API-Key, Content-Type");
  response.headers.set("Access-Control-Max-Age", "86400");

  return response;
}
