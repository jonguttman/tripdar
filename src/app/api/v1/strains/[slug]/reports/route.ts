/**
 * Strain Trip Reports API
 *
 * GET /api/v1/strains/[slug]/reports - Get approved trip reports for a strain
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
import { getApprovedReports, PublicReport } from "@/domain/report";

interface ReportsResponse {
  reports: PublicReport[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  meta: ReturnType<typeof createMeta>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context } = auth;
  const { slug } = await params;

  // Get pagination params
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") || "10", 10)));

  return withLogging(context, `/api/v1/strains/${slug}/reports`, async () => {
    // Verify strain exists
    const strain = getStrainBySlug(slug);
    if (!strain) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: {
            code: "STRAIN_NOT_FOUND",
            message: `No strain found with slug "${slug}"`,
          },
        },
        { status: 404 }
      );
    }

    const offset = (page - 1) * pageSize;
    const { reports, total } = await getApprovedReports(slug, pageSize, offset);

    const response = NextResponse.json<ApiSuccessResponse<ReportsResponse>>({
      success: true,
      data: {
        reports,
        total,
        page,
        pageSize,
        hasMore: offset + reports.length < total,
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
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Authorization, X-API-Key, Content-Type");
  response.headers.set("Access-Control-Max-Age", "86400");

  return response;
}
