/**
 * Admin: Strain Feedback Data
 *
 * GET /api/v1/admin/recommend/strains/:slug/feedback
 *
 * Returns feedback aggregates and recent individual feedback for a strain.
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
} from "@/domain/partner";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context } = auth;
  const { slug } = await params;

  return withLogging(context, `/api/v1/admin/recommend/strains/${slug}/feedback`, async () => {
    // Get feedback aggregates for this strain
    const aggregates = await prisma.feedbackAggregate.findMany({
      where: { strainSlug: slug },
    });

    // Get recent individual feedback records
    const recentFeedback = await prisma.recommendationFeedback.findMany({
      where: {
        result: { strainSlug: slug },
      },
      include: {
        result: {
          select: {
            matchScore: true,
            doseLevel: true,
            doseLowMg: true,
            doseHighMg: true,
            rank: true,
          },
        },
        signals: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const response = NextResponse.json<ApiSuccessResponse<{
      strainSlug: string;
      aggregates: typeof aggregates;
      recentFeedback: typeof recentFeedback;
      meta: ReturnType<typeof createMeta>;
    }>>({
      success: true,
      data: {
        strainSlug: slug,
        aggregates,
        recentFeedback,
        meta: createMeta(),
      },
    });

    return addPartnerHeaders(response, partner, context);
  });
}
