import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/domain/auth/adminSession";
import {
  prepareCanonicalStaffReviewInvitationBatch,
  StaffReviewInvitationPartnerScopeError,
} from "@/domain/myco/staffReviewInvitations";
import {
  approveStaffReviewInviteBatch,
  prepareStaffReviewInviteBatch,
  type StaffInviteBatchMessageInput,
} from "@/domain/myco/staffReviewInviteBatches";
import { isQaStaffReviewPartner } from "@/domain/myco/staffReviewRoster";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }
  return session.user.email;
}

function isOptionalCc(value: unknown): value is string[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every((email) => typeof email === "string"));
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as {
    partnerId?: unknown;
    send?: unknown;
    expiresInDays?: unknown;
    qaOnly?: unknown;
    action?: unknown;
    batchId?: unknown;
    approvedInteractionId?: unknown;
    sourceIssueId?: unknown;
    sourceCommentId?: unknown;
    sourceCardId?: unknown;
    messages?: unknown;
  };
  if (body.send === true) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: "Staff invitations are preview-only in KEWL-2912. send=false is required.",
          code: "send_not_authorized",
        },
      },
      { status: 403 }
    );
  }

  const partnerId = typeof body.partnerId === "string" ? body.partnerId : "";
  if (!partnerId) {
    return NextResponse.json(
      { success: false, error: { message: "partnerId is required" } },
      { status: 400 }
    );
  }
  const action = typeof body.action === "string" ? body.action : "preview";
  try {
    if (action === "record_approval") {
      const batchId = typeof body.batchId === "string" ? body.batchId : "";
      const approvedInteractionId =
        typeof body.approvedInteractionId === "string" ? body.approvedInteractionId : "";
      if (!batchId || !approvedInteractionId) {
        return NextResponse.json(
          { success: false, error: { message: "batchId and approvedInteractionId are required" } },
          { status: 400 }
        );
      }
      const approved = await approveStaffReviewInviteBatch({
        batchId,
        approvedInteractionId,
        approvedBy: auth,
        sourceIssueId: typeof body.sourceIssueId === "string" ? body.sourceIssueId : undefined,
        sourceCommentId: typeof body.sourceCommentId === "string" ? body.sourceCommentId : undefined,
        sourceCardId: typeof body.sourceCardId === "string" ? body.sourceCardId : undefined,
      });
      return NextResponse.json({ success: true, data: approved });
    }
    if (action === "prepare_batch") {
      if (!Array.isArray(body.messages)) {
        return NextResponse.json(
          { success: false, error: { message: "messages are required for prepare_batch" } },
          { status: 400 }
        );
      }
      const messages = body.messages.filter(
        (message): message is StaffInviteBatchMessageInput =>
          typeof message === "object" &&
          message !== null &&
          typeof (message as { email?: unknown }).email === "string" &&
          typeof (message as { subject?: unknown }).subject === "string" &&
          typeof (message as { html?: unknown }).html === "string" &&
          typeof (message as { text?: unknown }).text === "string" &&
          isOptionalCc((message as { cc?: unknown }).cc)
      );
      if (messages.length !== body.messages.length) {
        return NextResponse.json(
          { success: false, error: { message: "Each message requires email, subject, html, text, and optional cc string array" } },
          { status: 400 }
        );
      }
      const batch = await prepareStaffReviewInviteBatch({
        partnerId,
        renderedBy: auth,
        requestOrigin: request.nextUrl.origin,
        expiresInDays: Number(body.expiresInDays),
        sourceIssueId: typeof body.sourceIssueId === "string" ? body.sourceIssueId : undefined,
        sourceCommentId: typeof body.sourceCommentId === "string" ? body.sourceCommentId : undefined,
        sourceCardId: typeof body.sourceCardId === "string" ? body.sourceCardId : undefined,
        messages,
      });
      return NextResponse.json({ success: true, data: batch }, { status: 201 });
    }

    if (body.qaOnly === true && !isQaStaffReviewPartner(partnerId)) {
      const error = new StaffReviewInvitationPartnerScopeError();
      return NextResponse.json(
        {
          success: false,
          error: {
            message: error.message,
            code: error.code,
          },
        },
        { status: error.statusCode }
      );
    }

    const batch = await prepareCanonicalStaffReviewInvitationBatch({
      partnerId,
      issuedBy: auth,
      requestOrigin: request.nextUrl.origin,
      expiresInDays: Number(body.expiresInDays),
      qaOnly: body.qaOnly === true,
    });
    return NextResponse.json({ success: true, data: batch }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare staff invitations";
    const statusCode = typeof (error as { statusCode?: unknown }).statusCode === "number"
      ? (error as { statusCode: number }).statusCode
      : 400;
    const code = typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : undefined;
    return NextResponse.json(
      { success: false, error: { message, ...(code ? { code } : {}) } },
      { status: statusCode }
    );
  }
}
