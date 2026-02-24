/**
 * Recommendation Signal API (Tier 2 Deep Dive)
 *
 * POST /api/v1/recommend/feedback/signals
 *
 * Accepts experiential dimension feedback for deeper signal collection.
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

const VALID_DIRECTIONS = ["more", "less", "same"] as const;

interface SignalInput {
  dimensionId: string;
  direction: typeof VALID_DIRECTIONS[number];
}

interface SignalBody {
  feedbackId: string;
  signals: SignalInput[];
}

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context } = auth;

  return withLogging(context, "/api/v1/recommend/feedback/signals", async () => {
    let body: SignalBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } },
        { status: 400 }
      );
    }

    if (!body.feedbackId || typeof body.feedbackId !== "string") {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "MISSING_FEEDBACK_ID", message: "feedbackId is required" } },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.signals) || body.signals.length === 0) {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "MISSING_SIGNALS", message: "signals array is required and must not be empty" } },
        { status: 400 }
      );
    }

    // Validate each signal
    for (const signal of body.signals) {
      if (!signal.dimensionId || typeof signal.dimensionId !== "string") {
        return NextResponse.json<ApiErrorResponse>(
          { success: false, error: { code: "INVALID_SIGNAL", message: "Each signal must have a dimensionId string" } },
          { status: 400 }
        );
      }
      if (!VALID_DIRECTIONS.includes(signal.direction)) {
        return NextResponse.json<ApiErrorResponse>(
          { success: false, error: { code: "INVALID_DIRECTION", message: `direction must be one of: ${VALID_DIRECTIONS.join(", ")}` } },
          { status: 400 }
        );
      }
    }

    // Verify the feedback exists
    const feedback = await prisma.recommendationFeedback.findUnique({
      where: { id: body.feedbackId },
    });

    if (!feedback) {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "FEEDBACK_NOT_FOUND", message: "Feedback record not found" } },
        { status: 404 }
      );
    }

    // Create signal records
    const created = await prisma.recommendationSignal.createMany({
      data: body.signals.map(signal => ({
        feedbackId: body.feedbackId,
        dimensionId: signal.dimensionId,
        direction: signal.direction,
      })),
    });

    const response = NextResponse.json<ApiSuccessResponse<{
      recorded: true;
      signalCount: number;
      meta: ReturnType<typeof createMeta>;
    }>>({
      success: true,
      data: {
        recorded: true,
        signalCount: created.count,
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
