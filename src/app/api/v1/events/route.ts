/**
 * Analytics Events API
 *
 * POST /api/v1/events
 *
 * Records analytics events (strain views, "I've tried this", etc.)
 * from partner sites for data collection.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
} from "@/domain/partner";
import { recordEvent } from "@/domain/analytics/service";
import type { ApiSuccessResponse, ApiErrorResponse } from "@/domain/partner";

const ALLOWED_EVENT_TYPES = [
  "page_view",
  "strain_view",
  "strain_tried",
  "search",
  "quiz_complete",
  "rating",
  "review",
  "report",
] as const;
type AllowedEventType = (typeof ALLOWED_EVENT_TYPES)[number];

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context, sessionHash } = auth;

  return withLogging(context, "/api/v1/events", async () => {
    let body: { eventType?: string; entitySlug?: string; metadata?: Record<string, unknown> };
    try {
      body = await request.json();
    } catch {
      return addPartnerHeaders(
        NextResponse.json<ApiErrorResponse>(
          { success: false, error: { code: "INVALID_BODY", message: "Invalid JSON body" } },
          { status: 400 }
        ),
        partner,
        context
      );
    }

    const { eventType, entitySlug, metadata } = body;

    if (!eventType || !ALLOWED_EVENT_TYPES.includes(eventType as AllowedEventType)) {
      return addPartnerHeaders(
        NextResponse.json<ApiErrorResponse>(
          {
            success: false,
            error: {
              code: "INVALID_EVENT_TYPE",
              message: `eventType must be one of: ${ALLOWED_EVENT_TYPES.join(", ")}`,
            },
          },
          { status: 400 }
        ),
        partner,
        context
      );
    }

    if (!entitySlug) {
      return addPartnerHeaders(
        NextResponse.json<ApiErrorResponse>(
          { success: false, error: { code: "MISSING_SLUG", message: "entitySlug is required" } },
          { status: 400 }
        ),
        partner,
        context
      );
    }

    try {
      await recordEvent({
        eventType: eventType as AllowedEventType,
        entitySlug,
        partnerId: partner.id,
        sessionHash,
        metadata,
      });

      const response = NextResponse.json<ApiSuccessResponse<{ recorded: true }>>({
        success: true,
        data: { recorded: true },
      });

      response.headers.set("Cache-Control", "no-store");
      return addPartnerHeaders(response, partner, context);
    } catch (error) {
      console.error("Error recording event:", error);
      return addPartnerHeaders(
        NextResponse.json<ApiErrorResponse>(
          { success: false, error: { code: "EVENT_ERROR", message: "Failed to record event" } },
          { status: 500 }
        ),
        partner,
        context
      );
    }
  });
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", origin || "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Authorization, X-API-Key, Content-Type");
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}
