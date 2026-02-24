/**
 * Admin: Global Recommendation Settings
 *
 * GET /api/v1/admin/recommend/settings - Read global settings
 * PUT /api/v1/admin/recommend/settings - Update global settings
 *
 * Settings stored as a StrainRecommendationConfig with a special
 * strainSlug of "__global__".
 * Requires partner authentication with admin access.
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

const GLOBAL_KEY = "__global__";

interface GlobalSettings {
  feedbackThreshold: number;
  maxResults: number;
  showMatchPercentage: boolean;
  showSteppedPath: boolean;
  consentGateText: string;
  feedbackPromptDelayHours: number;
  enableDeepDive: boolean;
  theme: "parchment" | "dark" | "minimal";
}

const DEFAULT_SETTINGS: GlobalSettings = {
  feedbackThreshold: 10,
  maxResults: 3,
  showMatchPercentage: true,
  showSteppedPath: true,
  consentGateText: "Welcome to the Tripdar Recommendation Engine.\n\nEverything here is based on community-reported experiences - patterns shared by real people about what they noticed, not clinical research or medical advice. Individual experiences vary based on many factors including set, setting, and personal sensitivity.\n\nPlease carefully consider all harm reduction practices before choosing to alter your consciousness.",
  feedbackPromptDelayHours: 48,
  enableDeepDive: true,
  theme: "parchment",
};

async function loadSettings(): Promise<GlobalSettings> {
  const record = await prisma.strainRecommendationConfig.findUnique({
    where: { strainSlug: GLOBAL_KEY },
  });

  if (!record || !record.intentOverrides) {
    return DEFAULT_SETTINGS;
  }

  const stored = JSON.parse(record.intentOverrides) as Partial<GlobalSettings>;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context } = auth;

  return withLogging(context, "/api/v1/admin/recommend/settings", async () => {
    const settings = await loadSettings();

    const response = NextResponse.json<ApiSuccessResponse<{
      settings: GlobalSettings;
      meta: ReturnType<typeof createMeta>;
    }>>({
      success: true,
      data: { settings, meta: createMeta() },
    });

    return addPartnerHeaders(response, partner, context);
  });
}

export async function PUT(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context } = auth;

  return withLogging(context, "/api/v1/admin/recommend/settings", async () => {
    let body: Partial<GlobalSettings>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } },
        { status: 400 }
      );
    }

    // Merge with existing settings
    const current = await loadSettings();
    const updated: GlobalSettings = { ...current, ...body };

    // Validate
    if (updated.feedbackThreshold < 1 || updated.feedbackThreshold > 1000) {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "INVALID_THRESHOLD", message: "feedbackThreshold must be between 1 and 1000" } },
        { status: 400 }
      );
    }

    if (updated.maxResults < 1 || updated.maxResults > 10) {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "INVALID_MAX_RESULTS", message: "maxResults must be between 1 and 10" } },
        { status: 400 }
      );
    }

    // Store as JSON in the intentOverrides field of a special global config record
    await prisma.strainRecommendationConfig.upsert({
      where: { strainSlug: GLOBAL_KEY },
      update: { intentOverrides: JSON.stringify(updated) },
      create: {
        strainSlug: GLOBAL_KEY,
        intentOverrides: JSON.stringify(updated),
      },
    });

    const response = NextResponse.json<ApiSuccessResponse<{
      settings: GlobalSettings;
      meta: ReturnType<typeof createMeta>;
    }>>({
      success: true,
      data: { settings: updated, meta: createMeta() },
    });

    return addPartnerHeaders(response, partner, context);
  });
}

// Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", origin || "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Authorization, X-API-Key, Content-Type");
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}
