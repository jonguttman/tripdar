import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  digestCanonical,
  digestStaffReviewInviteRoster,
  providerCredentialFingerprint,
} from "@/domain/myco/employeeReviews";

const sendEmailMock = vi.hoisted(() => vi.fn());
const getAdminSessionMock = vi.hoisted(() => vi.fn());
const resolveProductForAdminMock = vi.hoisted(() => vi.fn());

const prismaMock = vi.hoisted(() => ({
  storeProductCatalog: {
    findUnique: vi.fn(),
  },
  mycoEmployee: {
    upsert: vi.fn(),
  },
  catalogAccessToken: {
    create: vi.fn(),
    update: vi.fn(),
  },
  mycoEmployeeReviewAssignment: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  staffReviewInviteBatch: {
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  staffReviewInviteRecipient: {
    count: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
  },
  staffReviewInviteNoSendEvidence: {
    create: vi.fn(),
  },
  $transaction: vi.fn(async (operation: unknown) => {
    if (Array.isArray(operation)) return Promise.all(operation);
    if (typeof operation === "function") return operation(prismaMock);
    return operation;
  }),
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock(prismaMock) };
});

vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/domain/auth/adminSession", () => ({ getAdminSession: getAdminSessionMock }));
vi.mock("@/domain/myco/adminAccess", () => ({ resolveProductForAdmin: resolveProductForAdminMock }));

const EXPIRES_AT = new Date("2026-08-20T12:00:00Z");
const ROSTER_DIGEST = digestStaffReviewInviteRoster([
  {
    employeeId: "employee-a",
    email: "sage@example.com",
    assignmentId: "assignment-a",
    accessTokenId: "access-token-a",
  },
]);

function pendingRecipient(overrides: Record<string, unknown> = {}) {
  return {
    id: "recipient-a",
    batchId: "batch-a",
    assignmentId: "assignment-a",
    employeeId: "employee-a",
    accessTokenId: "access-token-a",
    catalogItemId: "catalog-a",
    partnerId: "partner-a",
    tokenHash: "assignment-token-hash-a",
    accessTokenHash: "access-token-hash-a",
    recipientEmailNormalized: "sage@example.com",
    recipientEmail: "sage@example.com",
    employeeName: "Sage",
    expiresAt: EXPIRES_AT,
    link: "https://tripdar.test/review/myco/raw-token-a",
    subject: "Subject A",
    html: "<p>Body A</p>",
    text: "Body A",
    linkDigest: digestCanonical("https://tripdar.test/review/myco/raw-token-a"),
    subjectDigest: digestCanonical("Subject A"),
    htmlDigest: digestCanonical("<p>Body A</p>"),
    textDigest: digestCanonical("Body A"),
    rosterDigest: ROSTER_DIGEST,
    sender: "Tripdar <noreply@tripd.ar>",
    providerCredentialFingerprint: providerCredentialFingerprint("resend-key-a"),
    status: "pending",
    providerMessageId: null,
    assignment: {
      id: "assignment-a",
      catalogItemId: "catalog-a",
      employeeId: "employee-a",
      accessTokenId: "access-token-a",
      tokenHash: "assignment-token-hash-a",
      status: "assigned",
      expiresAt: EXPIRES_AT,
      submittedAt: null,
      accessToken: {
        id: "access-token-a",
        tokenHash: "access-token-hash-a",
        purpose: "staff_review",
        status: "active",
        partnerId: "partner-a",
        brandId: "brand-a",
        catalogItemId: "catalog-a",
        issuedToId: "employee-a",
        issuedToEmail: "sage@example.com",
        expiresAt: EXPIRES_AT,
        revokedAt: null,
      },
      employee: {
        id: "employee-a",
        partnerId: "partner-a",
        email: "sage@example.com",
        active: true,
        optedOut: false,
      },
      catalogItem: {
        id: "catalog-a",
        partnerId: "partner-a",
        brandId: "brand-a",
      },
    },
    ...overrides,
  };
}

function batch(status: string, recipients = [pendingRecipient()]) {
  return {
    id: "batch-a",
    partnerId: "partner-a",
    catalogItemId: "catalog-a",
    status,
    rosterDigest: ROSTER_DIGEST,
    catalogItem: {
      id: "catalog-a",
      partnerId: "partner-a",
      brandId: "brand-a",
      productName: "Product A",
      partner: { name: "The Mushroom Top" },
    },
    recipients,
  };
}

describe("employee review invite-batch sender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "resend-key-a";
    getAdminSessionMock.mockResolvedValue({ user: { email: "admin@tripd.ar" } });
    resolveProductForAdminMock.mockResolvedValue({ ok: true, status: 200, partnerId: "partner-a" });
    prismaMock.storeProductCatalog.findUnique.mockResolvedValue({
      id: "catalog-a",
      partnerId: "partner-a",
      productName: "Product A",
      brandId: "brand-a",
      partner: { name: "The Mushroom Top" },
    });
    prismaMock.mycoEmployee.upsert.mockResolvedValue({
      id: "employee-a",
      partnerId: "partner-a",
      name: "Sage",
      email: "sage@example.com",
      optedOut: false,
    });
    prismaMock.mycoEmployeeReviewAssignment.findUnique.mockResolvedValue(null);
    prismaMock.catalogAccessToken.create.mockResolvedValue({
      id: "access-token-a",
      tokenHash: "access-token-hash-a",
    });
    prismaMock.mycoEmployeeReviewAssignment.create.mockResolvedValue({ id: "assignment-a" });
    prismaMock.staffReviewInviteBatch.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.staffReviewInviteBatch.create.mockResolvedValue({ id: "batch-a" });
    prismaMock.staffReviewInviteBatch.update.mockResolvedValue({});
    prismaMock.staffReviewInviteRecipient.update.mockResolvedValue({});
    prismaMock.staffReviewInviteRecipient.create.mockResolvedValue({});
    prismaMock.staffReviewInviteRecipient.findMany.mockResolvedValue([]);
    prismaMock.staffReviewInviteNoSendEvidence.create.mockResolvedValue({});
    prismaMock.mycoEmployeeReviewAssignment.update.mockResolvedValue({});
    sendEmailMock.mockResolvedValue({ id: "resend-message-a" });
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("persists immutable source approval evidence on the created batch without sending", async () => {
    const { POST } = await import("./route");
    const request = {
      nextUrl: { origin: "https://tripdar.test" },
      json: async () => ({
        send: false,
        expiresInDays: 21,
        sourceCommentId: "53ac88a9-e43d-4db8-b037-636bdf08489f",
        sourceCardId: "card-tmt-staff-review",
        approvedInteractionId: "interaction-approval-1",
        employees: [{ name: "Sage", email: "sage@example.com" }],
      }),
    } as unknown as NextRequest;

    const response = await POST(request, { params: Promise.resolve({ id: "catalog-a" }) });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.data.batchId).toBe("batch-a");
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(prismaMock.staffReviewInviteBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approvedBy: "admin@tripd.ar",
          sourceCommentId: "53ac88a9-e43d-4db8-b037-636bdf08489f",
          sourceCardId: "card-tmt-staff-review",
          approvedInteractionId: "interaction-approval-1",
          totalRecipients: 1,
        }),
      })
    );
  });

  it("persists no-send evidence and never calls email for a superseded batch A", async () => {
    prismaMock.staffReviewInviteBatch.findFirst.mockResolvedValue(batch("superseded"));
    prismaMock.staffReviewInviteRecipient.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const { sendApprovedReviewInviteBatch } = await import("./route");
    const result = await sendApprovedReviewInviteBatch({
      batchId: "batch-a",
      catalogItemId: "catalog-a",
      partnerId: "partner-a",
    });

    expect(result).toMatchObject({ ok: false, status: 207, sent: 0, blocked: 1 });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(prismaMock.staffReviewInviteNoSendEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          batchId: "batch-a",
          recipientId: "recipient-a",
          accessTokenId: "access-token-a",
          reason: "batch_not_current",
          requiresApproval: true,
        }),
      })
    );
    expect(prismaMock.staffReviewInviteRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "recipient-a" },
        data: expect.objectContaining({ status: "blocked", failureCode: "batch_not_current" }),
      })
    );
  });

  it("partial recovery sends only pending rows and stores the provider message id", async () => {
    prismaMock.staffReviewInviteBatch.findFirst.mockResolvedValue(batch("partial", [pendingRecipient()]));
    prismaMock.staffReviewInviteRecipient.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const { sendApprovedReviewInviteBatch } = await import("./route");
    const result = await sendApprovedReviewInviteBatch({
      batchId: "batch-a",
      catalogItemId: "catalog-a",
      partnerId: "partner-a",
    });

    expect(result).toMatchObject({ ok: true, status: 200, sent: 1, blocked: 0 });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0]).toMatchObject({
      to: "sage@example.com",
      subject: "Subject A",
      html: "<p>Body A</p>",
      text: "Body A",
    });
    expect(prismaMock.staffReviewInviteRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "recipient-a" },
        data: expect.objectContaining({
          status: "sent",
          providerMessageId: "resend-message-a",
        }),
      })
    );
    expect(prismaMock.mycoEmployeeReviewAssignment.update).toHaveBeenCalledTimes(1);
  });
});
