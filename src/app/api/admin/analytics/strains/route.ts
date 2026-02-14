/**
 * Admin Analytics Strains API
 *
 * GET /api/admin/analytics/strains - Get per-strain analytics
 *
 * Requires GitHub OAuth authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { getTopStrains } from "@/domain/analytics";

/**
 * Check if user is authenticated
 */
async function requireAuth() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json(
      { success: false, error: { message: "Unauthorized" } },
      { status: 401 }
    );
  }

  return session;
}

/**
 * GET /api/admin/analytics/strains
 * Get per-strain analytics data
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(request.url);
    const periodParam = url.searchParams.get("period") || "7d";
    const limitParam = url.searchParams.get("limit") || "20";

    // Parse period (e.g., "7d", "30d", "90d")
    const days = parseInt(periodParam.replace("d", ""), 10) || 7;
    const validDays = Math.min(90, Math.max(1, days));

    // Parse limit
    const limit = Math.min(100, Math.max(1, parseInt(limitParam, 10) || 20));

    const strains = await getTopStrains(validDays, limit);

    return NextResponse.json({
      success: true,
      data: {
        period: `${validDays}d`,
        strains,
      },
    });
  } catch (error) {
    console.error("Error loading strain analytics:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to load strain analytics" } },
      { status: 500 }
    );
  }
}
