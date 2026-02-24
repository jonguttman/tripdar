/**
 * Admin: Strain Recommendation Config
 *
 * PUT /api/v1/admin/recommend/strains/:slug/config
 *
 * Upserts per-strain recommendation config (product mapping, overrides, cautions).
 * Requires partner authentication with admin access.
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
import { upsertStrainConfig } from "@/domain/recommendation-engine";

const VALID_AVAILABILITY = ["in_stock", "out_of_stock", "seasonal"];
const VALID_FORMATS = ["capsule", "chocolate", "gummy", "dried"];
const VALID_SENSITIVITY = ["gentle", "medium", "steep", "very_steep"];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context } = auth;
  const { slug } = await params;

  return withLogging(context, `/api/v1/admin/recommend/strains/${slug}/config`, async () => {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } },
        { status: 400 }
      );
    }

    // Validate optional fields
    if (body.availability && !VALID_AVAILABILITY.includes(body.availability as string)) {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "INVALID_AVAILABILITY", message: `availability must be one of: ${VALID_AVAILABILITY.join(", ")}` } },
        { status: 400 }
      );
    }

    if (body.productFormat && !VALID_FORMATS.includes(body.productFormat as string)) {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "INVALID_FORMAT", message: `productFormat must be one of: ${VALID_FORMATS.join(", ")}` } },
        { status: 400 }
      );
    }

    if (body.doseSensitivityOverride && !VALID_SENSITIVITY.includes(body.doseSensitivityOverride as string)) {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: { code: "INVALID_SENSITIVITY", message: `doseSensitivityOverride must be one of: ${VALID_SENSITIVITY.join(", ")}` } },
        { status: 400 }
      );
    }

    const config = await upsertStrainConfig(slug, {
      productName: body.productName as string | null | undefined,
      productUrl: body.productUrl as string | null | undefined,
      productUnitMg: body.productUnitMg != null ? Number(body.productUnitMg) : undefined,
      productFormat: body.productFormat as string | null | undefined,
      availability: body.availability as string | undefined,
      doseSensitivityOverride: body.doseSensitivityOverride as string | null | undefined,
      intentOverrides: body.intentOverrides as Record<string, string> | null | undefined,
      cautionFlags: body.cautionFlags as Record<string, unknown> | null | undefined,
    });

    const response = NextResponse.json<ApiSuccessResponse<{
      config: typeof config;
      meta: ReturnType<typeof createMeta>;
    }>>({
      success: true,
      data: { config, meta: createMeta() },
    });

    return addPartnerHeaders(response, partner, context);
  });
}

// Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", origin || "*");
  response.headers.set("Access-Control-Allow-Methods", "PUT, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Authorization, X-API-Key, Content-Type");
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}
