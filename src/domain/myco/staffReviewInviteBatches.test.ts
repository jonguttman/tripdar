import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";

import { TMT_DIRECT_STAFF_REVIEWERS } from "./staffReviewRoster";
import { hashStaffReviewInvitationToken } from "./staffReviewInvitations";

const prismaMock = vi.hoisted(() => ({
  partner: { findUnique: vi.fn() },
  mycoEmployee: { findMany: vi.fn() },
  staffReviewInvitation: {
    create: vi.fn(),
    findUnique: vi.fn(),
  },
  staffReviewInviteBatch: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  staffReviewInviteBatchRecipient: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)),
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock(prismaMock) };
});

const PARTNER_ID = "partner-tmt";
const NOW = new Date("2026-08-05T05:30:00.000Z");

function seedEnv() {
  process.env.RESEND_API_KEY = "re_test_123";
  process.env.STAFF_INVITE_BATCH_SEALING_KEY = "test sealing key";
}

function roster() {
  return TMT_DIRECT_STAFF_REVIEWERS.map((reviewer, index) => ({
    id: `employee-${index}`,
    partnerId: PARTNER_ID,
    name: reviewer.displayName,
    email: reviewer.email,
    active: true,
    optedOut: false,
  }));
}

function messages() {
  return TMT_DIRECT_STAFF_REVIEWERS.map((reviewer) => ({
    email: reviewer.email,
    subject: `Staff catalog review for ${reviewer.displayName}`,
    html: `<p>Hello ${reviewer.displayName}</p><a href="{{INVITE_URL}}">Open review</a>`,
    text: `Hello ${reviewer.displayName}\n{{INVITE_URL}}`,
  }));
}

function liveInvitation(overrides: Record<string, unknown> = {}) {
  return {
    id: "invitation-1",
    partnerId: PARTNER_ID,
    employeeId: "employee-0",
    emailNormalized: "sage@thegreenroomonventura.com",
    tokenHash: "token-hash-a",
    status: "pending",
    issuedAt: NOW,
    expiresAt: new Date("2026-08-20T05:30:00.000Z"),
    revokedAt: null,
    employee: {
      id: "employee-0",
      partnerId: PARTNER_ID,
      name: "Sage",
      email: "sage@thegreenroomonventura.com",
      active: true,
      optedOut: false,
    },
    ...overrides,
  };
}

describe("staff review invite batches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    seedEnv();
    prismaMock.partner.findUnique.mockResolvedValue({ id: PARTNER_ID, name: "The Mushroom Top" });
    prismaMock.mycoEmployee.findMany.mockResolvedValue(roster());
    prismaMock.staffReviewInvitation.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `invitation-${prismaMock.staffReviewInvitation.create.mock.calls.length}`,
      tokenHash: data.tokenHash,
      issuedAt: data.issuedAt,
      expiresAt: data.expiresAt,
      status: data.status,
      revokedAt: null,
    }));
    prismaMock.staffReviewInviteBatch.create.mockResolvedValue({});
    prismaMock.staffReviewInviteBatchRecipient.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: data.id,
      ordinal: data.ordinal,
      invitationId: data.invitationId,
      employeeId: data.employeeId,
      displayName: data.displayName,
      emailNormalized: data.emailNormalized,
      invitationExpiresAt: data.invitationExpiresAt,
    }));
  });

  it("canonical digest is stable across object key order", async () => {
    const { digestCanonical } = await import("./staffReviewInviteBatches");

    expect(digestCanonical({ b: 2, a: { z: 1, c: 3 } })).toBe(
      digestCanonical({ a: { c: 3, z: 1 }, b: 2 })
    );
  });

  it("persists a sealed approval snapshot without plaintext bearer links", async () => {
    const { prepareStaffReviewInviteBatch } = await import("./staffReviewInviteBatches");

    const batch = await prepareStaffReviewInviteBatch({
      partnerId: PARTNER_ID,
      renderedBy: "admin@example.com",
      requestOrigin: "https://tripdar.test",
      messages: messages(),
      now: NOW,
      sourceIssueId: "KEWL-2950",
      sourceCommentId: "comment-1",
    });

    expect(batch.status).toBe("draft");
    expect(batch.recipients).toHaveLength(6);
    expect(prismaMock.staffReviewInvitation.create).toHaveBeenCalledTimes(6);
    expect(prismaMock.staffReviewInviteBatch.create.mock.calls[0][0].data).toMatchObject({
      partnerId: PARTNER_ID,
      status: "draft",
      renderedBy: "admin@example.com",
      sourceIssueId: "KEWL-2950",
      sourceCommentId: "comment-1",
    });
    const recipientData = prismaMock.staffReviewInviteBatchRecipient.create.mock.calls[0][0].data;
    expect(recipientData.sealedPayloadCiphertext).toEqual(expect.any(String));
    expect(JSON.stringify(recipientData)).not.toContain("staff-review/invite");
    expect(JSON.stringify(recipientData)).not.toContain("Open review");
  });

  it("refuses approved batch A after generation B replaces its invitation token before provider send", async () => {
    const {
      sendApprovedStaffReviewInviteBatch,
      sealStaffInvitePayload,
    } = await import("./staffReviewInviteBatches");
    const tokenA = "token-a";
    const tokenHashA = hashStaffReviewInvitationToken(tokenA);
    const sealed = sealStaffInvitePayload({
      version: "staff-review-invite-payload-v1",
      batchId: "batch-a",
      recipientId: "recipient-1",
      invitationId: "invitation-1",
      employeeId: "employee-0",
      partnerId: PARTNER_ID,
      displayName: "Sage",
      emailNormalized: "sage@thegreenroomonventura.com",
      tokenHash: tokenHashA,
      inviteUrl: `https://tripdar.test/staff-review/invite/${tokenA}`,
      subject: "Subject A",
      html: "<p>A</p>",
      text: "A",
      fromAddress: "Tripdar <noreply@tripd.ar>",
      replyToAddress: "scottyclaw@gmail.com",
      provider: "resend",
      rendererVersion: "staff-review-invite-batch-v1",
      expiresAt: "2026-08-20T05:30:00.000Z",
    });
    const digestText = (value: string) =>
      crypto.createHash("sha256").update(value, "utf8").digest("hex");
    const recipient = {
      id: "recipient-1",
      batchId: "batch-a",
      ordinal: 0,
      invitationId: "invitation-1",
      employeeId: "employee-0",
      displayName: "Sage",
      emailNormalized: "sage@thegreenroomonventura.com",
      invitationTokenHash: tokenHashA,
      invitationStatusAtApproval: "pending",
      invitationIssuedAt: NOW,
      invitationExpiresAt: new Date("2026-08-20T05:30:00.000Z"),
      invitationRevokedAt: null,
      partnerScopeId: PARTNER_ID,
      recipientIdentityDigest: "identity-digest",
      linkDigest: digestText(`https://tripdar.test/staff-review/invite/${tokenA}`),
      subjectDigest: digestText("Subject A"),
      htmlDigest: digestText("<p>A</p>"),
      textDigest: digestText("A"),
      providerIdempotencyKey: "staff-review-invite:key-a",
      sendStatus: "pending",
      claimId: null,
      claimedAt: null,
      sendAttemptCount: 0,
      providerMessageId: null,
      sentAt: null,
      ...sealed,
    };
    const sendSpy = vi.fn();
    const { providerCredentialFingerprint, sealKeyFingerprint } = await import("@/lib/email").then(async (email) => ({
      providerCredentialFingerprint: email.providerCredentialFingerprint,
      sealKeyFingerprint: (await import("./staffReviewInviteBatches")).sealKeyFingerprint,
    }));
    prismaMock.staffReviewInviteBatch.findUnique.mockResolvedValue({
      id: "batch-a",
      partnerId: PARTNER_ID,
      status: "approved",
      approvedInteractionId: "interaction-a",
      provider: "resend",
      providerCredentialFingerprint: providerCredentialFingerprint("resend"),
      fromAddress: "Tripdar <noreply@tripd.ar>",
      replyToAddress: "scottyclaw@gmail.com",
      rendererVersion: "staff-review-invite-batch-v1",
      rosterDigest: (await import("./staffReviewRoster")).hashDirectStaffReviewRoster(
        (await import("./staffReviewRoster")).resolveDirectStaffReviewRoster(PARTNER_ID, roster()).reviewers
      ),
      batchDigest: "batch-digest",
      sealKeyFingerprint: sealKeyFingerprint(),
    });
    prismaMock.staffReviewInviteBatchRecipient.findMany.mockResolvedValueOnce([recipient]);
    prismaMock.staffReviewInviteBatchRecipient.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.staffReviewInvitation.findUnique.mockResolvedValue(
      liveInvitation({ tokenHash: "token-hash-b", revokedAt: new Date("2026-08-06T00:00:00.000Z") })
    );
    prismaMock.staffReviewInviteBatch.update.mockResolvedValue({});
    prismaMock.staffReviewInviteBatchRecipient.update.mockResolvedValue({});

    const result = await sendApprovedStaffReviewInviteBatch({
      batchId: "batch-a",
      approvedInteractionId: "interaction-a",
      now: NOW,
      send: sendSpy,
    });

    expect(sendSpy).not.toHaveBeenCalled();
    expect(result.failed[0]).toMatchObject({ recipientId: "recipient-1", code: "revoked" });
    expect(prismaMock.staffReviewInviteBatchRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "recipient-1" },
        data: expect.objectContaining({
          sendStatus: "validation_failed",
          validationFailureCode: "revoked",
        }),
      })
    );
  });

  it("recovers a partial send by skipping provider-message rows and sending only pending rows", async () => {
    const {
      sendApprovedStaffReviewInviteBatch,
      sealStaffInvitePayload,
      sealKeyFingerprint,
    } = await import("./staffReviewInviteBatches");
    const { providerCredentialFingerprint } = await import("@/lib/email");
    const { resolveDirectStaffReviewRoster, hashDirectStaffReviewRoster } = await import("./staffReviewRoster");
    const digestText = (value: string) =>
      crypto.createHash("sha256").update(value, "utf8").digest("hex");
    const token = "token-dani";
    const tokenHash = hashStaffReviewInvitationToken(token);
    const inviteUrl = `https://tripdar.test/staff-review/invite/${token}`;
    const sealed = sealStaffInvitePayload({
      version: "staff-review-invite-payload-v1",
      batchId: "batch-partial",
      recipientId: "recipient-pending",
      invitationId: "invitation-pending",
      employeeId: "employee-1",
      partnerId: PARTNER_ID,
      displayName: "Dani",
      emailNormalized: "dani@thehigherpath.com",
      tokenHash,
      inviteUrl,
      subject: "Subject Dani",
      html: "<p>Dani</p>",
      text: "Dani",
      fromAddress: "Tripdar <noreply@tripd.ar>",
      replyToAddress: "scottyclaw@gmail.com",
      provider: "resend",
      rendererVersion: "staff-review-invite-batch-v1",
      expiresAt: "2026-08-20T05:30:00.000Z",
    });
    const sentRecipient = {
      id: "recipient-sent",
      batchId: "batch-partial",
      ordinal: 0,
      invitationId: "invitation-sent",
      employeeId: "employee-0",
      displayName: "Sage",
      emailNormalized: "sage@thegreenroomonventura.com",
      invitationTokenHash: "sent-token",
      invitationStatusAtApproval: "pending",
      invitationIssuedAt: NOW,
      invitationExpiresAt: new Date("2026-08-20T05:30:00.000Z"),
      invitationRevokedAt: null,
      partnerScopeId: PARTNER_ID,
      recipientIdentityDigest: "sent",
      linkDigest: "sent",
      subjectDigest: "sent",
      htmlDigest: "sent",
      textDigest: "sent",
      sealedPayloadCiphertext: "sent",
      sealedPayloadIv: "sent",
      sealedPayloadAuthTag: "sent",
      providerIdempotencyKey: "staff-review-invite:key-sent",
      sendStatus: "sent",
      claimId: null,
      claimedAt: null,
      sendAttemptCount: 1,
      providerMessageId: "resend-already",
      sentAt: new Date("2026-08-05T05:35:00.000Z"),
    };
    const pendingRecipient = {
      id: "recipient-pending",
      batchId: "batch-partial",
      ordinal: 1,
      invitationId: "invitation-pending",
      employeeId: "employee-1",
      displayName: "Dani",
      emailNormalized: "dani@thehigherpath.com",
      invitationTokenHash: tokenHash,
      invitationStatusAtApproval: "pending",
      invitationIssuedAt: NOW,
      invitationExpiresAt: new Date("2026-08-20T05:30:00.000Z"),
      invitationRevokedAt: null,
      partnerScopeId: PARTNER_ID,
      recipientIdentityDigest: "identity-dani",
      linkDigest: digestText(inviteUrl),
      subjectDigest: digestText("Subject Dani"),
      htmlDigest: digestText("<p>Dani</p>"),
      textDigest: digestText("Dani"),
      providerIdempotencyKey: "staff-review-invite:key-pending",
      sendStatus: "pending",
      claimId: null,
      claimedAt: null,
      sendAttemptCount: 0,
      providerMessageId: null,
      sentAt: null,
      ...sealed,
    };
    const resolved = resolveDirectStaffReviewRoster(PARTNER_ID, roster());
    prismaMock.staffReviewInviteBatch.findUnique.mockResolvedValue({
      id: "batch-partial",
      partnerId: PARTNER_ID,
      status: "partially_sent",
      approvedInteractionId: "interaction-partial",
      provider: "resend",
      providerCredentialFingerprint: providerCredentialFingerprint("resend"),
      fromAddress: "Tripdar <noreply@tripd.ar>",
      replyToAddress: "scottyclaw@gmail.com",
      rendererVersion: "staff-review-invite-batch-v1",
      rosterDigest: hashDirectStaffReviewRoster(resolved.reviewers),
      batchDigest: "batch-digest",
      sealKeyFingerprint: sealKeyFingerprint(),
    });
    prismaMock.staffReviewInviteBatchRecipient.findMany
      .mockResolvedValueOnce([sentRecipient, pendingRecipient])
      .mockResolvedValueOnce([{ sendStatus: "sent" }, { sendStatus: "sent" }]);
    prismaMock.staffReviewInviteBatchRecipient.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.staffReviewInvitation.findUnique.mockResolvedValue(
      liveInvitation({
        id: "invitation-pending",
        employeeId: "employee-1",
        emailNormalized: "dani@thehigherpath.com",
        tokenHash,
        employee: {
          id: "employee-1",
          partnerId: PARTNER_ID,
          name: "Dani",
          email: "dani@thehigherpath.com",
          active: true,
          optedOut: false,
        },
      })
    );
    prismaMock.staffReviewInviteBatchRecipient.update.mockResolvedValue({});
    prismaMock.staffReviewInviteBatch.update.mockResolvedValue({});
    const sendSpy = vi.fn().mockResolvedValue({ messageId: "resend-new", provider: "resend" });

    const result = await sendApprovedStaffReviewInviteBatch({
      batchId: "batch-partial",
      approvedInteractionId: "interaction-partial",
      now: NOW,
      send: sendSpy,
    });

    expect(result.skipped).toEqual([{ recipientId: "recipient-sent", reason: "already_sent" }]);
    expect(result.sent).toEqual([
      {
        recipientId: "recipient-pending",
        emailMasked: "d***@thehigherpath.com",
        providerMessageId: "resend-new",
      },
    ]);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({
      to: "dani@thehigherpath.com",
      idempotencyKey: "staff-review-invite:key-pending",
    }));
  });
});
