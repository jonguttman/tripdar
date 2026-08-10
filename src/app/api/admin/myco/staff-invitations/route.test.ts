import { beforeEach, describe, expect, it, vi } from "vitest";

const getAdminSessionMock = vi.hoisted(() => vi.fn());
const prepareMock = vi.hoisted(() => vi.fn());
const approveMock = vi.hoisted(() => vi.fn());
const revokeMock = vi.hoisted(() => vi.fn());
const resolvePartnerMutationForAdminMock = vi.hoisted(() => vi.fn());

vi.mock("@/domain/auth/adminSession", () => ({ getAdminSession: getAdminSessionMock }));
vi.mock("@/domain/myco/adminAccess", () => ({
  resolvePartnerMutationForAdmin: resolvePartnerMutationForAdminMock,
}));
vi.mock("@/domain/myco/staffReviewInviteBatches", async () => {
  const actual = await vi.importActual<typeof import("@/domain/myco/staffReviewInviteBatches")>(
    "@/domain/myco/staffReviewInviteBatches"
  );
  return {
    ...actual,
    prepareStaffReviewInviteBatch: prepareMock,
    approveStaffReviewInviteBatch: approveMock,
    revokeStaffReviewInvitation: revokeMock,
  };
});

import { StaffInviteError } from "@/domain/myco/staffReviewInviteBatches";
import { POST } from "./route";

const ADMIN_EMAIL = "jon@example.com";

function request(body: Record<string, unknown>) {
  return new Request("https://tripdar.test/api/admin/myco/staff-invitations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolvePartnerMutationForAdminMock.mockResolvedValue({ ok: true, partnerId: "partner_tmt" });
  getAdminSessionMock.mockResolvedValue({
    user: { email: ADMIN_EMAIL },
    expires: "2099-01-01T00:00:00.000Z",
    actualUser: { email: ADMIN_EMAIL, role: "super_admin" },
    viewAs: null,
  });
});

describe("POST /api/admin/myco/staff-invitations", () => {
  it("refuses unauthenticated callers before dispatching an action", async () => {
    getAdminSessionMock.mockResolvedValue(null);

    const response = await POST(request({ action: "revoke" }));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("unauthorized");
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it("keeps send disabled even when an action is otherwise valid", async () => {
    const response = await POST(request({ action: "record_approval", send: true }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("send_forbidden");
    expect(approveMock).not.toHaveBeenCalled();
  });

  it("returns inert prepare metadata without provider send or credential material", async () => {
    prepareMock.mockResolvedValue({
      batchId: "batch_redacted",
      status: "draft",
      approvalDigest: "approval_digest_redacted",
      approvalDigestVersion: "staff-invite-approval-v1",
      requestedExpirySeconds: 86_400,
      recipients: [{ ordinal: 0, employeeId: "emp_redacted", displayName: "Adrienne", emailMasked: "ad***@example.test" }],
      previews: {
        subject: "Your Tripdar review link: [invite link minted after approval]",
        html: "<p>[invite link minted after approval]</p>",
        text: "[invite link minted after approval]",
      },
    });

    const response = await POST(
      request({
        action: "prepare_batch",
        partnerId: "partner_tmt",
        sourceIssueId: "KEWL-3385",
        sourceCommentId: "comment_redacted",
        provider: "resend",
        providerCredentialFingerprint: "fingerprint_redacted",
        fromAddress: "Tripdar <staff@example.test>",
        requestedExpirySeconds: 86_400,
        templates: {
          subject: "Your Tripdar review link: {{INVITE_URL}}",
          html: "<p>{{INVITE_URL}}</p>",
          text: "{{INVITE_URL}}",
        },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.status).toBe("draft");
    expect(JSON.stringify(payload)).toContain("[invite link minted after approval]");
    expect(JSON.stringify(payload)).not.toContain("/review/myco/");
    expect(JSON.stringify(payload)).not.toContain("/staff/catalog/");
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
  });

  it("allows a partner admin to prepare only for their assigned partner", async () => {
    getAdminSessionMock.mockResolvedValue({
      user: { email: "audrey@example.com" },
      expires: "2099-01-01T00:00:00.000Z",
      actualUser: { email: "audrey@example.com", role: "partner_admin" },
      viewAs: null,
    });
    resolvePartnerMutationForAdminMock.mockResolvedValue({ ok: true, partnerId: "partner_tmt" });
    prepareMock.mockResolvedValue({
      batchId: "batch_redacted",
      status: "draft",
      approvalDigest: "approval_digest_redacted",
      approvalDigestVersion: "staff-invite-approval-v1",
      requestedExpirySeconds: 86_400,
      recipients: [],
      previews: { subject: "s", html: "h", text: "t" },
    });

    const response = await POST(
      request({
        action: "prepare_batch",
        partnerId: "partner_tmt",
        sourceIssueId: "KEWL-3385",
        sourceCommentId: "comment_redacted",
        provider: "resend",
        providerCredentialFingerprint: "fingerprint_redacted",
        fromAddress: "Tripdar <staff@example.test>",
        templates: { subject: "{{INVITE_URL}}", html: "{{INVITE_URL}}", text: "{{INVITE_URL}}" },
      })
    );

    expect(response.status).toBe(200);
    expect(resolvePartnerMutationForAdminMock).toHaveBeenCalledWith("audrey@example.com", "partner_tmt");
    expect(prepareMock).toHaveBeenCalledWith(expect.objectContaining({
      partnerId: "partner_tmt",
      renderedBy: "audrey@example.com",
    }));
  });

  it("refuses wrong-partner prepare for partner admins without dispatching", async () => {
    getAdminSessionMock.mockResolvedValue({
      user: { email: "audrey@example.com" },
      expires: "2099-01-01T00:00:00.000Z",
      actualUser: { email: "audrey@example.com", role: "partner_admin" },
      viewAs: null,
    });
    resolvePartnerMutationForAdminMock.mockResolvedValue({
      ok: false,
      status: 404,
      message: "Partner not found",
    });

    const response = await POST(
      request({
        action: "prepare_batch",
        partnerId: "partner_other",
        sourceIssueId: "KEWL-3385",
        sourceCommentId: "comment_redacted",
        provider: "resend",
        providerCredentialFingerprint: "fingerprint_redacted",
        fromAddress: "Tripdar <staff@example.test>",
        templates: { subject: "{{INVITE_URL}}", html: "{{INVITE_URL}}", text: "{{INVITE_URL}}" },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("partner_not_found");
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it("refuses wrong-partner approval for partner admins before releasing credentials", async () => {
    getAdminSessionMock.mockResolvedValue({
      user: { email: "audrey@example.com" },
      expires: "2099-01-01T00:00:00.000Z",
      actualUser: { email: "audrey@example.com", role: "partner_admin" },
      viewAs: null,
    });
    resolvePartnerMutationForAdminMock.mockResolvedValue({
      ok: false,
      status: 404,
      message: "Partner not found",
    });

    const response = await POST(
      request({
        action: "record_approval",
        partnerId: "partner_other",
        batchId: "batch_redacted",
        approvedInteractionId: "interaction_redacted",
        sourceIssueId: "KEWL-3385",
        sourceCommentId: "comment_redacted",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("partner_not_found");
    expect(approveMock).not.toHaveBeenCalled();
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it("refuses View-as approval before minting or revoking", async () => {
    getAdminSessionMock.mockResolvedValue({
      user: { email: "audrey@example.com" },
      expires: "2099-01-01T00:00:00.000Z",
      actualUser: { email: ADMIN_EMAIL, role: "super_admin" },
      viewAs: {
        id: "user_audrey",
        email: "audrey@example.com",
        name: "Audrey",
        role: "partner_admin",
        partnerName: "TMT",
      },
    });

    const response = await POST(
      request({
        action: "record_approval",
        partnerId: "partner_tmt",
        batchId: "batch_redacted",
        approvedInteractionId: "interaction_redacted",
        sourceIssueId: "KEWL-3385",
        sourceCommentId: "comment_redacted",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("view_as_forbidden");
    expect(approveMock).not.toHaveBeenCalled();
  });

  it("returns one-shared-link approval metadata with zero legacy invitation rows", async () => {
    approveMock.mockResolvedValue({
      batchId: "batch_redacted",
      status: "approved",
      approvalDigest: "approval_digest_redacted",
      batchDigest: "batch_digest_redacted",
      approvedInteractionId: "interaction_redacted",
      approvedBy: ADMIN_EMAIL,
      approvedAt: new Date("2026-08-09T17:45:00.000Z"),
      staffReviewInvitationCount: 0,
      sharedCatalogAccessTokenCount: 1,
      recipientEvidenceCount: 2,
      invitationCount: 0,
      recipientCount: 2,
      revokedPriorInvitationCount: 1,
    });

    const response = await POST(
      request({
        action: "record_approval",
        partnerId: "partner_tmt",
        batchId: "batch_redacted",
        approvedInteractionId: "interaction_redacted",
        sourceIssueId: "KEWL-3385",
        sourceCommentId: "comment_redacted",
        providerCredentialFingerprint: "fingerprint_redacted",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      staffReviewInvitationCount: 0,
      sharedCatalogAccessTokenCount: 1,
      recipientEvidenceCount: 2,
      invitationCount: 0,
      recipientCount: 2,
    });
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
    expect(JSON.stringify(payload)).not.toContain("/staff/catalog/");
  });

  it("passes the actual admin session to explicit revoke and returns metadata only", async () => {
    revokeMock.mockResolvedValue({
      invitationId: "invite_1",
      status: "revoked",
      alreadyRevoked: false,
      invalidatedRecipientCount: 1,
    });

    const response = await POST(
      request({
        action: "revoke",
        partnerId: "partner_tmt",
        invitationId: "invite_1",
        reason: "Jon asked to revoke this pending staff invite.",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({
      invitationId: "invite_1",
      status: "revoked",
      alreadyRevoked: false,
      invalidatedRecipientCount: 1,
    });
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
    expect(JSON.stringify(payload)).not.toContain("/review/myco/");
    expect(revokeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({
          actualUser: { email: ADMIN_EMAIL, role: "super_admin" },
        }),
        partnerId: "partner_tmt",
        invitationId: "invite_1",
      })
    );
  });

  it("maps service authorization and partner-scope failures to stable codes", async () => {
    revokeMock.mockRejectedValue(
      new StaffInviteError("view_as_forbidden", "View-as cannot mutate staff invitations", 403)
    );

    const response = await POST(
      request({
        action: "revoke",
        partnerId: "partner_tmt",
        invitationId: "invite_1",
        reason: "Jon asked to revoke this pending staff invite.",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("view_as_forbidden");
  });

  it("maps wrong-partner/not-found parity to 404 without leaking existence", async () => {
    revokeMock.mockRejectedValue(new StaffInviteError("invitation_not_found", "Invitation not found", 404));

    const response = await POST(
      request({
        action: "revoke",
        partnerId: "wrong_partner",
        invitationId: "invite_1",
        reason: "Jon asked to revoke this pending staff invite.",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("invitation_not_found");
  });
});
