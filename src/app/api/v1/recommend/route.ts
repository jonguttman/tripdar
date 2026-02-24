/**
 * Recommendation API
 *
 * POST /api/v1/recommend
 *
 * Generates strain recommendations based on user intent.
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
import { generateRecommendations } from "@/domain/recommendation-engine";
import type { RecommendationResponse, ExperienceLevel, InputPath, IntentVector } from "@/domain/recommendation-engine";

const VALID_EXPERIENCE_LEVELS: ExperienceLevel[] = ["new", "few_times", "experienced", "very_experienced"];
const VALID_INPUT_PATHS: InputPath[] = ["mood_tiles", "sliders", "guided_quiz"];
const INTENT_VECTOR_KEYS: (keyof IntentVector)[] = [
  "clarity_cognition", "mood_social", "visual_pattern",
  "somatic", "energy_direction", "depth_direction",
];

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context } = auth;

  return withLogging(context, "/api/v1/recommend", async () => {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } },
        { status: 400 }
      );
    }

    // Validate experienceLevel
    const experienceLevel = body.experienceLevel as string;
    if (!experienceLevel || !VALID_EXPERIENCE_LEVELS.includes(experienceLevel as ExperienceLevel)) {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "INVALID_EXPERIENCE_LEVEL", message: `experienceLevel must be one of: ${VALID_EXPERIENCE_LEVELS.join(", ")}` } },
        { status: 400 }
      );
    }

    // Validate inputPath
    const inputPath = body.inputPath as string;
    if (!inputPath || !VALID_INPUT_PATHS.includes(inputPath as InputPath)) {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "INVALID_INPUT_PATH", message: `inputPath must be one of: ${VALID_INPUT_PATHS.join(", ")}` } },
        { status: 400 }
      );
    }

    // Validate intentVector
    const intentVector = body.intentVector as Record<string, unknown> | undefined;
    if (!intentVector || typeof intentVector !== "object") {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "MISSING_INTENT_VECTOR", message: "intentVector is required" } },
        { status: 400 }
      );
    }
    for (const key of INTENT_VECTOR_KEYS) {
      const val = intentVector[key];
      if (typeof val !== "number" || val < -1 || val > 1) {
        return NextResponse.json<ApiErrorResponse>(
          { success: false, error: { code: "INVALID_INTENT_VECTOR", message: `intentVector.${key} must be a number between -1 and 1` } },
          { status: 400 }
        );
      }
    }

    const result = await generateRecommendations(
      {
        experienceLevel: experienceLevel as ExperienceLevel,
        inputPath: inputPath as InputPath,
        intentVector: intentVector as unknown as IntentVector,
        rawInput: (body.rawInput as Record<string, unknown>) || {},
        siteId: partner.id,
      },
      partner.id,
    );

    const response = NextResponse.json<ApiSuccessResponse<RecommendationResponse & { meta: ReturnType<typeof createMeta> }>>({
      success: true,
      data: { ...result, meta: createMeta() },
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
