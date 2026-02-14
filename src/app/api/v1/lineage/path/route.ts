/**
 * Lineage Path API
 *
 * GET /api/v1/lineage/path?from=golden-teacher&to=albino-penis-envy
 *
 * Finds the genetic relationship path between two strains.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
} from "@/domain/partner";
import { findLineagePath, LineagePathResponse } from "@/domain/lineage";
import { getStrainBySlug } from "@/domain/strain/data";
import type { ApiSuccessResponse, ApiErrorResponse } from "@/domain/partner";

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context } = auth;

  return withLogging(context, "/api/v1/lineage/path", async () => {
    const { searchParams } = new URL(request.url);
    const fromSlug = searchParams.get("from");
    const toSlug = searchParams.get("to");

    // Validate parameters
    if (!fromSlug || !toSlug) {
      return addPartnerHeaders(
        NextResponse.json<ApiErrorResponse>(
          { success: false, error: { code: "BAD_REQUEST", message: "Both 'from' and 'to' query parameters are required" } },
          { status: 400 }
        ),
        partner,
        context
      );
    }

    // Verify strains exist
    const fromStrain = getStrainBySlug(fromSlug);
    const toStrain = getStrainBySlug(toSlug);

    if (!fromStrain) {
      return addPartnerHeaders(
        NextResponse.json<ApiErrorResponse>(
          { success: false, error: { code: "NOT_FOUND", message: `Strain '${fromSlug}' not found` } },
          { status: 404 }
        ),
        partner,
        context
      );
    }

    if (!toStrain) {
      return addPartnerHeaders(
        NextResponse.json<ApiErrorResponse>(
          { success: false, error: { code: "NOT_FOUND", message: `Strain '${toSlug}' not found` } },
          { status: 404 }
        ),
        partner,
        context
      );
    }

    // Find path
    const pathResult = findLineagePath(fromSlug, toSlug);

    if (!pathResult) {
      return addPartnerHeaders(
        NextResponse.json<ApiErrorResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "No lineage path found between these strains" } },
          { status: 404 }
        ),
        partner,
        context
      );
    }

    const response = NextResponse.json<ApiSuccessResponse<LineagePathResponse>>({
      success: true,
      data: pathResult,
    });

    return addPartnerHeaders(response, partner, context);
  });
}
