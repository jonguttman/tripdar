import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/domain/auth/adminSession";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveProductForAdmin } from "@/domain/myco/adminAccess";
import {
  aggregateEmployeeGuidance,
  effectiveAssignmentStatus,
  summarizeAssignments,
} from "@/domain/myco/employeeReviews";
import {
  approveStaffReviewInviteBatch,
  sendApprovedStaffReviewInviteBatch,
} from "@/domain/myco/staffReviewInviteBatch";

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const access = await resolveProductForAdmin(auth.user!.email!, id);
    if (!access.ok) {
      return NextResponse.json(
        { success: false, error: { message: access.message } },
        { status: access.status }
      );
    }

    const assignments = await prisma.mycoEmployeeReviewAssignment.findMany({
      where: { catalogItemId: id },
      include: {
        employee: { select: { id: true, name: true, email: true, points: true, streak: true, optedOut: true } },
        response: true,
      },
      orderBy: [{ assignedAt: "desc" }],
    });

    const now = new Date();
    const normalized = assignments.map((assignment) => ({
      id: assignment.id,
      employee: assignment.employee,
      status: effectiveAssignmentStatus(assignment.status, assignment.expiresAt, now),
      assignedAt: assignment.assignedAt,
      openedAt: assignment.openedAt,
      submittedAt: assignment.submittedAt,
      expiresAt: assignment.expiresAt,
      reminderCount: assignment.reminderCount,
      response: assignment.response,
    }));
    const guidance = aggregateEmployeeGuidance(
      assignments.flatMap((assignment) => (assignment.response ? [assignment.response] : []))
    );

    return NextResponse.json({
      success: true,
      data: {
        assignments: normalized,
        participation: summarizeAssignments(assignments, now),
        guidance,
      },
    });
  } catch (error) {
    console.error("Error loading employee reviews:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to load employee reviews" } },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const access = await resolveProductForAdmin(auth.user!.email!, id);
    if (!access.ok) {
      return NextResponse.json(
        { success: false, error: { message: access.message } },
        { status: access.status }
      );
    }

    const body = await request.json();
    const sendNow = body.send === true;
    const expiresInDays = Number.isFinite(Number(body.expiresInDays))
      ? Math.max(1, Math.min(90, Math.round(Number(body.expiresInDays))))
      : 21;
    const employees = Array.isArray(body.employees) ? body.employees : [];
    if (employees.length === 0) {
      return NextResponse.json(
        { success: false, error: { message: "At least one employee is required" } },
        { status: 400 }
      );
    }

    const approved = await approveStaffReviewInviteBatch({
      partnerId: access.partnerId,
      catalogItemId: id,
      approvedBy: auth.user!.email!,
      employees,
      requestOrigin: request.nextUrl.origin,
      expiresInDays,
    });
    let results = approved.assignments;
    if (sendNow) {
      const sendResult = await sendApprovedStaffReviewInviteBatch({ batchId: approved.batchId });
      const sendByRecipient = new Map(sendResult.results.map((result) => [result.recipientId, result]));
      results = results.map((result) => {
        if (!result.recipientId) return result;
        const sent = sendByRecipient.get(result.recipientId);
        return sent ? { ...result, sent: sent.sent, providerMessageId: sent.providerMessageId, error: sent.error } : result;
      });
    }

    const status = results.some((result) => result.error) ? 207 : 201;
    return NextResponse.json({ success: true, data: { batchId: approved.batchId, assignments: results } }, { status });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { success: false, error: { message: "Assignment token collision; retry the request" } },
        { status: 409 }
      );
    }
    console.error("Error assigning employee reviews:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to assign employee reviews" } },
      { status: 500 }
    );
  }
}
