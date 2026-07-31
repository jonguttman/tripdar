/**
 * Admin Analytics Overview API
 *
 * GET /api/admin/analytics/overview - Get analytics overview stats
 *
 * Requires GitHub OAuth authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/domain/auth/adminSession";
import {
  getOverviewStats,
  getTopStrains,
  getRecentActivity,
} from "@/domain/analytics";

/**
 * Check if user is authenticated
 */
async function requireAuth() {
  const session = await getAdminSession();

  if (!session?.user?.email) {
    return NextResponse.json(
      { success: false, error: { message: "Unauthorized" } },
      { status: 401 }
    );
  }

  return session;
}

/**
 * GET /api/admin/analytics/overview
 * Get analytics overview with stats, top strains, and recent activity
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

    const [stats, topStrains, recentActivity] = await Promise.all([
      getOverviewStats(validDays),
      getTopStrains(validDays, 10),
      getRecentActivity(20),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        period: `${validDays}d`,
        stats,
        topStrains,
        recentActivity,
      },
    });
  } catch (error) {
    console.error("Error loading analytics overview:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to load analytics";
    return NextResponse.json(
      { success: false, error: { message: `Analytics error: ${errorMessage}` } },
      { status: 500 }
    );
  }
}
