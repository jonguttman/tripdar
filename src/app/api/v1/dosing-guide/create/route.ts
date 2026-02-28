/**
 * POST /api/v1/dosing-guide/create
 *
 * Creates a dosing guide token for a specific strain from a recommendation session.
 * Returns a public URL that serves the branded dose card image.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
  createMeta,
  type ApiSuccessResponse,
  type ApiErrorResponse,
} from "@/domain/partner";
import { generateDosingGuideToken } from "@/domain/dosing-guide/utils";

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context, sessionHash } = auth;

  return withLogging(context, "/api/v1/dosing-guide/create", async () => {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
        { status: 400 }
      );
    }

    const { sessionToken, strainSlug, retailerBranding } = body as {
      sessionToken?: string;
      strainSlug?: string;
      retailerBranding?: { logoUrl?: string; storeName?: string; address?: string; phone?: string };
    };

    if (!strainSlug || typeof strainSlug !== "string") {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "MISSING_STRAIN_SLUG", message: "strainSlug is required." } },
        { status: 400 }
      );
    }

    // If sessionToken provided, verify it belongs to this partner
    let sessionId: string | null = null;
    if (sessionToken && typeof sessionToken === "string") {
      const session = await prisma.recommendationSession.findUnique({
        where: { sessionToken },
      });

      if (!session || session.partnerId !== partner.id) {
        return NextResponse.json<ApiErrorResponse>(
          { success: false, error: { code: "SESSION_NOT_FOUND", message: "Recommendation session not found." } },
          { status: 404 }
        );
      }
      sessionId = session.id;
    }

    const token = generateDosingGuideToken();

    await prisma.dosingGuideToken.create({
      data: {
        token,
        sessionId,
        strainSlug,
        partnerId: partner.id,
        retailerData: retailerBranding || {},
      },
    });

    // Record analytics event
    await prisma.analyticsEvent.create({
      data: {
        eventType: "dosing_guide_created",
        entitySlug: strainSlug,
        partnerId: partner.id,
        sessionHash,
        metadata: JSON.stringify({ guideToken: token }),
      },
    });

    const url = `https://www.tripd.ar/api/v1/dosing-guide/${token}`;

    const response = NextResponse.json<ApiSuccessResponse<{ token: string; url: string; meta: ReturnType<typeof createMeta> }>>({
      success: true,
      data: { token, url, meta: createMeta() },
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
