import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prepareMock = vi.hoisted(() => vi.fn());
const prepareBatchMock = vi.hoisted(() => vi.fn());
const approveBatchMock = vi.hoisted(() => vi.fn());
const isQaStaffReviewPartnerMock = vi.hoisted(() => vi.fn());

vi.mock("@/domain/auth/adminSession", () => ({
  getAdminSession: vi.fn(async () => ({ user: { email: "admin@example.com" } })),
}));

vi.mock("@/domain/myco/staffReviewInvitations", () => ({
  prepareCanonicalStaffReviewInvitationBatch: prepareMock,
  StaffReviewInvitationPartnerScopeError: class StaffReviewInvitationPartnerScopeError extends Error {
    readonly code = "qa_partner_scope_refused";
    readonly statusCode = 403;

    constructor() {
      super("qaOnly is only allowed for the QA staff review partner.");
    }
  },
}));

vi.mock("@/domain/myco/staffReviewRoster", () => ({
  isQaStaffReviewPartner: isQaStaffReviewPartnerMock,
}));

vi.mock("@/domain/myco/staffReviewInviteBatches", () => ({
  prepareStaffReviewInviteBatch: prepareBatchMock,
  approveStaffReviewInviteBatch: approveBatchMock,
}));

async function post(body: Record<string, unknown>) {
  const { POST } = await import("./route");
  const request = new NextRequest("https://tripdar.test/api/admin/myco/staff-invitations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(request);
}

describe("admin staff invitation preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isQaStaffReviewPartnerMock.mockReturnValue(false);
    prepareMock.mockResolvedValue({ status: "UNSENT DRAFT", send: false, recipients: [] });
    prepareBatchMock.mockResolvedValue({ id: "batch-1", status: "draft" });
    approveBatchMock.mockResolvedValue({
      id: "batch-1",
      status: "approved",
      approvedInteractionId: "interaction-1",
    });
  });

  it("refuses send=true before preparing anything", async () => {
    const response = await post({ partnerId: "partner-tmt", send: true });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error.code).toBe("send_not_authorized");
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it("prepares only an unsent draft batch", async () => {
    const response = await post({ partnerId: "partner-tmt", send: false });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data).toMatchObject({ status: "UNSENT DRAFT", send: false });
    expect(prepareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerId: "partner-tmt",
        issuedBy: "admin@example.com",
        qaOnly: false,
      })
    );
  });

  it("refuses qaOnly for non-QA partners before preparing anything", async () => {
    const response = await post({ partnerId: "partner-tmt", send: false, qaOnly: true });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toMatchObject({
      code: "qa_partner_scope_refused",
      message: "qaOnly is only allowed for the QA staff review partner.",
    });
    expect(isQaStaffReviewPartnerMock).toHaveBeenCalledWith("partner-tmt");
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it("passes qaOnly through only for sink-address QA invitation generation", async () => {
    isQaStaffReviewPartnerMock.mockReturnValue(true);

    const response = await post({ partnerId: "partner-qa", send: false, qaOnly: true });

    expect(response.status).toBe(201);
    expect(isQaStaffReviewPartnerMock).toHaveBeenCalledWith("partner-qa");
    expect(prepareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerId: "partner-qa",
        issuedBy: "admin@example.com",
        qaOnly: true,
      })
    );
  });

  it("prepares a frozen batch only through explicit prepare_batch action", async () => {
    const response = await post({
      action: "prepare_batch",
      partnerId: "partner-tmt",
      sourceIssueId: "KEWL-2950",
      messages: [
        {
          email: "sage@thegreenroomonventura.com",
          cc: ["adrienne@theotherpathcbd.com"],
          subject: "Subject",
          html: "<p>{{INVITE_URL}}</p>",
          text: "{{INVITE_URL}}",
        },
      ],
    });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data).toMatchObject({ id: "batch-1", status: "draft" });
    expect(prepareBatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerId: "partner-tmt",
        renderedBy: "admin@example.com",
        sourceIssueId: "KEWL-2950",
        messages: [
          expect.objectContaining({
            email: "sage@thegreenroomonventura.com",
            cc: ["adrienne@theotherpathcbd.com"],
          }),
        ],
      })
    );
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it("refuses malformed cc on frozen batch messages", async () => {
    const response = await post({
      action: "prepare_batch",
      partnerId: "partner-tmt",
      messages: [
        {
          email: "sage@thegreenroomonventura.com",
          cc: "adrienne@theotherpathcbd.com",
          subject: "Subject",
          html: "<p>{{INVITE_URL}}</p>",
          text: "{{INVITE_URL}}",
        },
      ],
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.message).toContain("optional cc string array");
    expect(prepareBatchMock).not.toHaveBeenCalled();
  });

  it("records approval evidence only through explicit record_approval action", async () => {
    const response = await post({
      action: "record_approval",
      partnerId: "partner-tmt",
      batchId: "batch-1",
      approvedInteractionId: "interaction-1",
      sourceCommentId: "comment-1",
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({
      id: "batch-1",
      status: "approved",
      approvedInteractionId: "interaction-1",
    });
    expect(approveBatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: "batch-1",
        approvedInteractionId: "interaction-1",
        approvedBy: "admin@example.com",
        sourceCommentId: "comment-1",
      })
    );
    expect(prepareMock).not.toHaveBeenCalled();
  });
});
