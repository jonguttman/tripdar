/**
 * Trip Reports API - Submit
 *
 * POST /api/v1/reports - Submit a new trip report
 *
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
import { getStrainBySlug } from "@/domain/strain/data";
import {
  createReport,
  hasSessionReportedStrain,
  DOSE_CATEGORIES,
  DoseCategory,
} from "@/domain/report";

interface CreateReportResponse {
  message: string;
  meta: ReturnType<typeof createMeta>;
}

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context, sessionHash } = auth;

  return withLogging(context, "/api/v1/reports", async () => {
    // Parse request body
    let body: {
      strainSlug?: string;
      doseAmount?: string;
      doseCategory?: string;
      setting?: string;
      intention?: string;
      title?: string;
      body?: string;
      duration?: string;
      peakIntensity?: number;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid JSON body",
          },
        },
        { status: 400 }
      );
    }

    // Validate strain exists
    if (!body.strainSlug) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "MISSING_STRAIN",
            message: "strainSlug is required",
          },
        },
        { status: 400 }
      );
    }

    const strain = getStrainBySlug(body.strainSlug);
    if (!strain) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "STRAIN_NOT_FOUND",
            message: `No strain found with slug "${body.strainSlug}"`,
          },
        },
        { status: 404 }
      );
    }

    // Validate required fields
    const required = ["doseAmount", "doseCategory", "setting", "title", "body"];
    for (const field of required) {
      if (!body[field as keyof typeof body]) {
        return NextResponse.json<ApiErrorResponse>(
          {
            success: false,
            error: {
              code: "MISSING_FIELD",
              message: `${field} is required`,
            },
          },
          { status: 400 }
        );
      }
    }

    // Validate dose category
    if (!DOSE_CATEGORIES.includes(body.doseCategory as DoseCategory)) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "INVALID_DOSE_CATEGORY",
            message: `doseCategory must be one of: ${DOSE_CATEGORIES.join(", ")}`,
          },
        },
        { status: 400 }
      );
    }

    // Validate title length
    if (body.title!.length < 5) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "TITLE_TOO_SHORT",
            message: "Title must be at least 5 characters",
          },
        },
        { status: 400 }
      );
    }

    // Validate body length
    if (body.body!.length < 50) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "BODY_TOO_SHORT",
            message: "Report body must be at least 50 characters",
          },
        },
        { status: 400 }
      );
    }

    if (body.body!.length > 10000) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "BODY_TOO_LONG",
            message: "Report body must be less than 10000 characters",
          },
        },
        { status: 400 }
      );
    }

    // Validate peak intensity if provided
    if (
      body.peakIntensity !== undefined &&
      (body.peakIntensity < 1 || body.peakIntensity > 10)
    ) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "INVALID_PEAK_INTENSITY",
            message: "peakIntensity must be between 1 and 10",
          },
        },
        { status: 400 }
      );
    }

    // Check if session has already submitted a report for this strain
    const alreadyReported = await hasSessionReportedStrain(
      sessionHash,
      body.strainSlug
    );
    if (alreadyReported) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "ALREADY_REPORTED",
            message: "You have already submitted a trip report for this strain",
          },
        },
        { status: 409 }
      );
    }

    // Create report (goes to moderation queue)
    try {
      await createReport({
        strainSlug: body.strainSlug,
        sessionHash,
        partnerId: partner.id,
        doseAmount: body.doseAmount!,
        doseCategory: body.doseCategory as DoseCategory,
        setting: body.setting!,
        intention: body.intention,
        title: body.title!,
        body: body.body!,
        duration: body.duration,
        peakIntensity: body.peakIntensity,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create report";
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "CREATE_FAILED",
            message,
          },
        },
        { status: 400 }
      );
    }

    const response = NextResponse.json<ApiSuccessResponse<CreateReportResponse>>({
      success: true,
      data: {
        message: "Trip report submitted and pending moderation",
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
