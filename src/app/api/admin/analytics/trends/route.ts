/**
 * Admin Analytics Trends API
 *
 * GET /api/admin/analytics/trends - Get trend data for charts
 *
 * Requires GitHub OAuth authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { getTrendData } from "@/domain/analytics";

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
 * GET /api/admin/analytics/trends
 * Get trend data points for charting
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(request.url);
    const periodParam = url.searchParams.get("period") || "7d";

    // Parse period (e.g., "7d", "30d", "90d")
    const days = parseInt(periodParam.replace("d", ""), 10) || 7;
    const validDays = Math.min(90, Math.max(1, days));

    const dataPoints = await getTrendData(validDays);

    return NextResponse.json({
      success: true,
      data: {
        period: `${validDays}d`,
        dataPoints,
      },
    });
  } catch (error) {
    console.error("Error loading trend data:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to load trend data" } },
      { status: 500 }
    );
  }
}
