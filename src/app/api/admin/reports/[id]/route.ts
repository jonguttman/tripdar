/**
 * Admin Report Moderation API - Single Report
 *
 * GET /api/admin/reports/[id] - Get a single report
 * PUT /api/admin/reports/[id] - Moderate (approve/reject) a report
 *
 * Requires GitHub OAuth authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/domain/auth/adminSession";
import { getReportById, moderateReport } from "@/domain/report";

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
 * GET /api/admin/reports/[id]
 * Get a single report
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const report = await getReportById(id);

    if (!report) {
      return NextResponse.json(
        { success: false, error: { message: "Report not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { report },
    });
  } catch (error) {
    console.error("Error loading report:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to load report" } },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/reports/[id]
 * Moderate (approve/reject) a report
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = await request.json();

    // Validate status
    if (!body.status || !["approved", "rejected"].includes(body.status)) {
      return NextResponse.json(
        { success: false, error: { message: "Status must be 'approved' or 'rejected'" } },
        { status: 400 }
      );
    }

    // Check if report exists
    const existing = await getReportById(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { message: "Report not found" } },
        { status: 404 }
      );
    }

    const report = await moderateReport({
      reportId: id,
      status: body.status,
      moderatorId: auth.user?.email || "unknown",
    });

    return NextResponse.json({
      success: true,
      data: { report },
    });
  } catch (error) {
    console.error("Error moderating report:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to moderate report" } },
      { status: 500 }
    );
  }
}
