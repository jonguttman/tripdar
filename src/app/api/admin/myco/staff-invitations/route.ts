import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/domain/auth/adminSession";
import {
  approveStaffReviewInviteBatch,
  prepareStaffReviewInviteBatch,
  revokeStaffReviewInvitation,
  StaffInviteError,
  type StaffInviteTemplateInput,
} from "@/domain/myco/staffReviewInviteBatches";
import { resolvePartnerMutationForAdmin } from "@/domain/myco/adminAccess";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number, code = "invalid_request") {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

function actorEmail(session: Awaited<ReturnType<typeof getAdminSession>>): string | null {
  return session?.actualUser.email ?? session?.user?.email ?? null;
}

async function requirePartnerScope(
  session: Awaited<ReturnType<typeof getAdminSession>>,
  partnerId: string
): Promise<string | NextResponse> {
  const email = actorEmail(session);
  if (!email) return jsonError("Unauthorized", 401, "unauthorized");
  if (session?.viewAs) return jsonError("View-as cannot mutate staff invitations", 403, "view_as_forbidden");
  if (!partnerId) return jsonError("partnerId is required", 400, "invalid_request");

  const access = await resolvePartnerMutationForAdmin(email, partnerId);
  return access.ok ? email : jsonError(access.message, access.status, "partner_not_found");
}

function stringField(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === "string" ? body[key].trim() : "";
}

function optionalStringField(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArrayField(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new StaffInviteError("invalid_request", "cc must be an array of email strings");
  }
  return value;
}

function templatesFrom(body: Record<string, unknown>): StaffInviteTemplateInput {
  const templates = body.templates;
  if (typeof templates !== "object" || templates === null || Array.isArray(templates)) {
    throw new StaffInviteError("invalid_request", "templates is required");
  }
  const object = templates as Record<string, unknown>;
  const subject = typeof object.subject === "string" ? object.subject : "";
  const html = typeof object.html === "string" ? object.html : "";
  const text = typeof object.text === "string" ? object.text : "";
  return {
    subject,
    html,
    text,
    cc: stringArrayField(object.cc),
  };
}

function mapStaffInviteError(error: unknown) {
  if (error instanceof StaffInviteError) {
    return jsonError(error.message, error.status, error.code);
  }
  console.error("[staff-invitations]", error);
  return jsonError("Staff invitation request failed", 500, "internal_error");
}

export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!actorEmail(session)) return jsonError("Unauthorized", 401, "unauthorized");

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.send === true) {
    return jsonError("Sending staff invitation batches is disabled on this endpoint", 403, "send_forbidden");
  }

  try {
    const action = stringField(body, "action");
    const partnerId = stringField(body, "partnerId");
    if (action === "prepare_batch") {
      const email = await requirePartnerScope(session, partnerId);
      if (email instanceof NextResponse) return email;
      const result = await prepareStaffReviewInviteBatch({
        partnerId,
        renderedBy: email,
        sourceIssueId: stringField(body, "sourceIssueId"),
        sourceCommentId: stringField(body, "sourceCommentId"),
        sourceCardId: optionalStringField(body, "sourceCardId"),
        templates: templatesFrom(body),
        provider: stringField(body, "provider"),
        providerCredentialFingerprint: stringField(body, "providerCredentialFingerprint"),
        fromAddress: stringField(body, "fromAddress"),
        replyToAddress: optionalStringField(body, "replyToAddress"),
        requestedExpirySeconds:
          typeof body.requestedExpirySeconds === "number" ? body.requestedExpirySeconds : undefined,
        sealKeyFingerprint: optionalStringField(body, "sealKeyFingerprint") ?? undefined,
      });
      return NextResponse.json({ success: true, data: result });
    }

    if (action === "record_approval") {
      const email = await requirePartnerScope(session, partnerId);
      if (email instanceof NextResponse) return email;
      const result = await approveStaffReviewInviteBatch({
        partnerId,
        batchId: stringField(body, "batchId"),
        approvedInteractionId: stringField(body, "approvedInteractionId"),
        approvedBy: email,
        sourceEvidence: {
          sourceIssueId: stringField(body, "sourceIssueId"),
          sourceCommentId: stringField(body, "sourceCommentId"),
          sourceCardId: optionalStringField(body, "sourceCardId"),
        },
        providerCredentialFingerprint: optionalStringField(body, "providerCredentialFingerprint") ?? undefined,
        sealKeyFingerprint: optionalStringField(body, "sealKeyFingerprint") ?? undefined,
      });
      return NextResponse.json({ success: true, data: result });
    }

    if (action === "revoke") {
      const result = await revokeStaffReviewInvitation({
        session,
        partnerId,
        invitationId: stringField(body, "invitationId"),
        reason: stringField(body, "reason"),
      });
      return NextResponse.json({ success: true, data: result });
    }

    return jsonError("Unsupported staff invitation action", 400, "unsupported_action");
  } catch (error) {
    return mapStaffInviteError(error);
  }
}
