import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";

import { TMT_DIRECT_STAFF_REVIEWERS } from "./staffReviewRoster";
import { hashStaffReviewInvitationToken } from "./staffReviewInvitations";

const prismaMock = vi.hoisted(() => ({
  partner: { findUnique: vi.fn() },
  mycoEmployee: { findMany: vi.fn() },
  staffReviewInvitation: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
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

function digestText(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function digestCc(cc: string[]) {
  return crypto.createHash("sha256").update(JSON.stringify(cc), "utf8").digest("hex");
}

async function arrangeApprovedBatch(overrides: {
  batch?: Record<string, unknown>;
  recipient?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  invitation?: Record<string, unknown> | null;
} = {}) {
  const {
    sendApprovedStaffReviewInviteBatch,
    sealStaffInvitePayload,
    sealKeyFingerprint,
  } = await import("./staffReviewInviteBatches");
  const { providerCredentialFingerprint } = await import("@/lib/email");
  const { resolveDirectStaffReviewRoster, hashDirectStaffReviewRoster } = await import("./staffReviewRoster");
  const token = "token-a";
  const tokenHash = hashStaffReviewInvitationToken(token);
  const payload = {
    version: "staff-review-invite-payload-v1" as const,
    batchId: "batch-a",
    recipientId: "recipient-1",
    invitationId: "invitation-1",
    employeeId: "employee-0",
    partnerId: PARTNER_ID,
    displayName: "Sage",
    emailNormalized: "sage@thegreenroomonventura.com",
    tokenHash,
    inviteUrl: `https://tripdar.test/staff-review/invite/${token}`,
    cc: [],
    subject: "Subject A",
    html: "<p>A</p>",
    text: "A",
    fromAddress: "Tripdar <noreply@tripd.ar>",
    replyToAddress: "scottyclaw@gmail.com",
    provider: "resend",
    rendererVersion: "staff-review-invite-batch-v1",
    expiresAt: "2026-08-20T05:30:00.000Z",
    ...overrides.payload,
  };
  const sealed = sealStaffInvitePayload(payload);
  const recipient = {
    id: "recipient-1",
    batchId: "batch-a",
    ordinal: 0,
    invitationId: "invitation-1",
    employeeId: "employee-0",
    displayName: "Sage",
    emailNormalized: "sage@thegreenroomonventura.com",
    invitationTokenHash: tokenHash,
    invitationStatusAtApproval: "pending",
    invitationIssuedAt: NOW,
    invitationExpiresAt: new Date("2026-08-20T05:30:00.000Z"),
    invitationRevokedAt: null,
    partnerScopeId: PARTNER_ID,
    recipientIdentityDigest: "identity-digest",
    linkDigest: digestText(payload.inviteUrl),
    ccDigest: digestCc((payload as { cc?: string[] }).cc ?? []),
    subjectDigest: digestText(payload.subject),
    htmlDigest: digestText(payload.html),
    textDigest: digestText(payload.text),
    providerIdempotencyKey: "staff-review-invite:key-a",
    sendStatus: "pending",
    claimId: null,
    claimedAt: null,
    sendAttemptCount: 0,
    validationFailureCode: null,
    validationFailureEvidence: null,
    providerMessageId: null,
    sentAt: null,
    ...sealed,
    ...overrides.recipient,
  };
  const resolved = resolveDirectStaffReviewRoster(PARTNER_ID, roster());
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
    rosterDigest: hashDirectStaffReviewRoster(resolved.reviewers),
    batchDigest: "batch-digest",
    sealKeyFingerprint: sealKeyFingerprint(),
    ...overrides.batch,
  });
  prismaMock.staffReviewInviteBatchRecipient.findMany.mockResolvedValueOnce([recipient]);
  prismaMock.staffReviewInviteBatchRecipient.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.staffReviewInvitation.findUnique.mockResolvedValue(
    overrides.invitation === null
      ? null
      : liveInvitation({
          tokenHash,
          ...overrides.invitation,
        })
  );
  prismaMock.staffReviewInviteBatch.update.mockResolvedValue({});
  prismaMock.staffReviewInviteBatchRecipient.update.mockResolvedValue({});
  const sendSpy = vi.fn();

  return { sendApprovedStaffReviewInviteBatch, sendSpy };
}

interface ValidationFailureCase {
  name: string;
  code: string;
  approvedInteractionId?: string;
  batch?: Record<string, unknown>;
  recipient?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  invitation?: Record<string, unknown> | null;
}

const validationFailureCases: ValidationFailureCase[] = [
  {
    name: "wrong approval interaction",
    code: "approval_evidence_mismatch",
    approvedInteractionId: "interaction-b",
  },
  {
    name: "missing invitation",
    code: "missing_invitation",
    invitation: null,
  },
  {
    name: "expired invitation",
    code: "expired",
    invitation: { expiresAt: new Date("2026-08-05T05:29:59.000Z") },
  },
  {
    name: "replaced live token",
    code: "replaced_token",
    invitation: { tokenHash: "different-token-hash" },
  },
  {
    name: "confirmed invitation status",
    code: "invitation_status_mismatch",
    invitation: { status: "confirmed" },
  },
  {
    name: "wrong partner/catalog scope",
    code: "partner_scope_mismatch",
    invitation: {
      partnerId: "partner-other",
      employee: {
        id: "employee-0",
        partnerId: "partner-other",
        name: "Sage",
        email: "sage@thegreenroomonventura.com",
        active: true,
        optedOut: false,
      },
    },
  },
  {
    name: "wrong employee identity",
    code: "employee_mismatch",
    invitation: { employeeId: "employee-other" },
  },
  {
    name: "wrong recipient email",
    code: "recipient_email_mismatch",
    invitation: { emailNormalized: "sage.changed@example.com" },
  },
  {
    name: "inactive employee",
    code: "employee_inactive",
    invitation: {
      employee: {
        id: "employee-0",
        partnerId: PARTNER_ID,
        name: "Sage",
        email: "sage@thegreenroomonventura.com",
        active: false,
        optedOut: false,
      },
    },
  },
  {
    name: "opted-out employee",
    code: "employee_opted_out",
    invitation: {
      employee: {
        id: "employee-0",
        partnerId: PARTNER_ID,
        name: "Sage",
        email: "sage@thegreenroomonventura.com",
        active: true,
        optedOut: true,
      },
    },
  },
  {
    name: "link digest mismatch",
    code: "link_digest_mismatch",
    recipient: { linkDigest: digestText("https://tripdar.test/changed") },
  },
  {
    name: "cc digest mismatch",
    code: "cc_mismatch",
    recipient: { ccDigest: digestCc(["approved@example.com"]) },
    payload: { cc: ["changed@example.com"] },
  },
  {
    name: "subject digest mismatch",
    code: "subject_digest_mismatch",
    recipient: { subjectDigest: digestText("Changed subject") },
  },
  {
    name: "body digest mismatch",
    code: "body_digest_mismatch",
    recipient: { htmlDigest: digestText("<p>Changed</p>") },
  },
  {
    name: "sender mismatch",
    code: "sender_mismatch",
    payload: { fromAddress: "Tripdar <changed@tripd.ar>" },
  },
];

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
    prismaMock.staffReviewInvitation.findMany.mockResolvedValue([]);
    prismaMock.staffReviewInvitation.updateMany.mockResolvedValue({ count: 0 });
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

  it("persists a non-null empty cc digest and sealed empty cc array for new no-Cc rows", async () => {
    const {
      digestCanonical,
      prepareStaffReviewInviteBatch,
      unsealStaffInvitePayload,
    } = await import("./staffReviewInviteBatches");

    await prepareStaffReviewInviteBatch({
      partnerId: PARTNER_ID,
      renderedBy: "admin@example.com",
      requestOrigin: "https://tripdar.test",
      messages: messages(),
      now: NOW,
      sourceIssueId: "KEWL-3075",
    });

    const recipientData = prismaMock.staffReviewInviteBatchRecipient.create.mock.calls[0][0].data;
    expect(recipientData.ccDigest).toBe(digestCanonical([]));
    expect(unsealStaffInvitePayload(recipientData).cc).toEqual([]);
  });

  it("normalizes Cc email casing while preserving order before sealing", async () => {
    const {
      digestCanonical,
      prepareStaffReviewInviteBatch,
      unsealStaffInvitePayload,
    } = await import("./staffReviewInviteBatches");
    const cc = [" Adrienne@TheOtherPathCBD.com ", "AUDREY@TheOtherPathCBD.com"];
    const normalizedCc = ["adrienne@theotherpathcbd.com", "audrey@theotherpathcbd.com"];

    await prepareStaffReviewInviteBatch({
      partnerId: PARTNER_ID,
      renderedBy: "admin@example.com",
      requestOrigin: "https://tripdar.test",
      messages: messages().map((message) => (
        message.email === "sage@thegreenroomonventura.com" ? { ...message, cc } : message
      )),
      now: NOW,
      sourceIssueId: "KEWL-3075",
    });

    const recipientData = prismaMock.staffReviewInviteBatchRecipient.create.mock.calls[0][0].data;
    expect(recipientData.ccDigest).toBe(digestCanonical(normalizedCc));
    expect(unsealStaffInvitePayload(recipientData).cc).toEqual(normalizedCc);
  });

  it.each([
    { name: "blank", cc: ["adrienne@theotherpathcbd.com", " "] },
    { name: "malformed", cc: ["not-an-email"] },
  ])("rejects $name Cc entries before batch preparation", async ({ cc }) => {
    const { prepareStaffReviewInviteBatch } = await import("./staffReviewInviteBatches");

    await expect(prepareStaffReviewInviteBatch({
      partnerId: PARTNER_ID,
      renderedBy: "admin@example.com",
      requestOrigin: "https://tripdar.test",
      messages: messages().map((message) => (
        message.email === "sage@thegreenroomonventura.com" ? { ...message, cc } : message
      )),
      now: NOW,
      sourceIssueId: "KEWL-3075",
    })).rejects.toThrow(/Staff invite Cc entry/);

    expect(prismaMock.staffReviewInvitation.create).not.toHaveBeenCalled();
    expect(prismaMock.staffReviewInviteBatch.create).not.toHaveBeenCalled();
    expect(prismaMock.staffReviewInviteBatchRecipient.create).not.toHaveBeenCalled();
  });

  it("preserves sealed cc through prepare, validation, and provider send", async () => {
    const {
      digestCanonical,
      prepareStaffReviewInviteBatch,
      unsealStaffInvitePayload,
      sealKeyFingerprint,
    } = await import("./staffReviewInviteBatches");
    const { providerCredentialFingerprint } = await import("@/lib/email");
    const { hashDirectStaffReviewRoster, resolveDirectStaffReviewRoster } = await import("./staffReviewRoster");
    const cc = ["adrienne@theotherpathcbd.com"];

    const batch = await prepareStaffReviewInviteBatch({
      partnerId: PARTNER_ID,
      renderedBy: "admin@example.com",
      requestOrigin: "https://tripdar.test",
      messages: messages().map((message) => (
        message.email === "dani@thehigherpath.com" ? message : { ...message, cc }
      )),
      now: NOW,
      sourceIssueId: "KEWL-3075",
    });

    const batchData = prismaMock.staffReviewInviteBatch.create.mock.calls[0][0].data;
    const recipientData = prismaMock.staffReviewInviteBatchRecipient.create.mock.calls[0][0].data;
    expect(recipientData.ccDigest).toBe(digestCanonical(cc));
    expect(batch.recipients[0]).toMatchObject({
      emailMasked: "s***@thegreenroomonventura.com",
      inviteUrl: expect.stringContaining("https://tripdar.test/staff-review/invite/"),
    });
    expect(JSON.stringify(recipientData)).not.toContain("adrienne@theotherpathcbd.com");
    expect(unsealStaffInvitePayload(recipientData).cc).toEqual(cc);

    const resolved = resolveDirectStaffReviewRoster(PARTNER_ID, roster());
    prismaMock.staffReviewInviteBatch.findUnique.mockResolvedValue({
      ...batchData,
      status: "approved",
      approvedInteractionId: "interaction-a",
      approvedBy: "jon@example.com",
      approvedAt: NOW,
      providerCredentialFingerprint: providerCredentialFingerprint("resend"),
      rosterDigest: hashDirectStaffReviewRoster(resolved.reviewers),
      sealKeyFingerprint: sealKeyFingerprint(),
    });
    prismaMock.staffReviewInviteBatchRecipient.findMany
      .mockResolvedValueOnce([{
        ...recipientData,
        sendStatus: "pending",
        claimId: null,
        claimedAt: null,
        sendAttemptCount: 0,
        validationFailureCode: null,
        validationFailureEvidence: null,
        providerMessageId: null,
        sentAt: null,
      }])
      .mockResolvedValueOnce([{ sendStatus: "sent" }]);
    prismaMock.staffReviewInviteBatchRecipient.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.staffReviewInvitation.findUnique.mockResolvedValue(
      liveInvitation({
        id: recipientData.invitationId,
        employeeId: recipientData.employeeId,
        emailNormalized: recipientData.emailNormalized,
        tokenHash: recipientData.invitationTokenHash,
      })
    );
    const sendSpy = vi.fn().mockResolvedValue({ messageId: "resend-cc", provider: "resend" });

    const result = await (await import("./staffReviewInviteBatches")).sendApprovedStaffReviewInviteBatch({
      batchId: batch.id,
      approvedInteractionId: "interaction-a",
      now: NOW,
      send: sendSpy,
    });

    expect(result.sent).toEqual([
      {
        recipientId: recipientData.id,
        emailMasked: "s***@thegreenroomonventura.com",
        providerMessageId: "resend-cc",
      },
    ]);
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({
      to: "sage@thegreenroomonventura.com",
      cc,
    }));
  });

  it("sends a new-format no-Cc row without passing an empty provider cc list", async () => {
    const { sendApprovedStaffReviewInviteBatch, sendSpy } = await arrangeApprovedBatch();
    sendSpy.mockResolvedValue({ messageId: "resend-no-cc", provider: "resend" });
    prismaMock.staffReviewInviteBatchRecipient.findMany.mockResolvedValueOnce([{ sendStatus: "sent" }]);

    const result = await sendApprovedStaffReviewInviteBatch({
      batchId: "batch-a",
      approvedInteractionId: "interaction-a",
      now: NOW,
      send: sendSpy,
    });

    expect(result.sent).toEqual([
      {
        recipientId: "recipient-1",
        emailMasked: "s***@thegreenroomonventura.com",
        providerMessageId: "resend-no-cc",
      },
    ]);
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({
      to: "sage@thegreenroomonventura.com",
    }));
    expect(sendSpy.mock.calls[0][0]).not.toHaveProperty("cc");
  });

  it("keeps true legacy null/no-field Cc rows send-compatible", async () => {
    const { sendApprovedStaffReviewInviteBatch, sendSpy } = await arrangeApprovedBatch({
      payload: { cc: undefined },
      recipient: { ccDigest: null },
    });
    sendSpy.mockResolvedValue({ messageId: "resend-legacy-no-cc", provider: "resend" });
    prismaMock.staffReviewInviteBatchRecipient.findMany.mockResolvedValueOnce([{ sendStatus: "sent" }]);

    const result = await sendApprovedStaffReviewInviteBatch({
      batchId: "batch-a",
      approvedInteractionId: "interaction-a",
      now: NOW,
      send: sendSpy,
    });

    expect(result.sent[0]).toMatchObject({
      recipientId: "recipient-1",
      providerMessageId: "resend-legacy-no-cc",
    });
    expect(sendSpy.mock.calls[0][0]).not.toHaveProperty("cc");
  });

  it("rejects a new-format sealed empty Cc payload when the stored digest is missing", async () => {
    const { sendApprovedStaffReviewInviteBatch, sendSpy } = await arrangeApprovedBatch({
      recipient: { ccDigest: null },
    });

    const result = await sendApprovedStaffReviewInviteBatch({
      batchId: "batch-a",
      approvedInteractionId: "interaction-a",
      now: NOW,
      send: sendSpy,
    });

    expect(sendSpy).not.toHaveBeenCalled();
    expect(result.failed[0]).toMatchObject({ recipientId: "recipient-1", code: "cc_mismatch" });
  });

  it("rejects Cc representation drift without normalizing at send time", async () => {
    const { sendApprovedStaffReviewInviteBatch, sendSpy } = await arrangeApprovedBatch({
      payload: { cc: ["Adrienne@TheOtherPathCBD.com"] },
      recipient: { ccDigest: digestCc(["adrienne@theotherpathcbd.com"]) },
    });

    const result = await sendApprovedStaffReviewInviteBatch({
      batchId: "batch-a",
      approvedInteractionId: "interaction-a",
      now: NOW,
      send: sendSpy,
    });

    expect(sendSpy).not.toHaveBeenCalled();
    expect(result.failed[0]).toMatchObject({ recipientId: "recipient-1", code: "cc_mismatch" });
  });

  it("generation B revokes prior pending invitations and records durable no-send evidence for approved batch A rows", async () => {
    const { prepareStaffReviewInviteBatch } = await import("./staffReviewInviteBatches");
    prismaMock.staffReviewInvitation.findMany
      .mockResolvedValueOnce([{ id: "old-invitation-sage" }])
      .mockResolvedValue([]);

    await prepareStaffReviewInviteBatch({
      partnerId: PARTNER_ID,
      renderedBy: "admin@example.com",
      requestOrigin: "https://tripdar.test",
      messages: messages(),
      now: NOW,
      sourceIssueId: "KEWL-2950",
      sourceCommentId: "comment-1",
    });

    expect(prismaMock.staffReviewInvitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          partnerId: PARTNER_ID,
          employeeId: "employee-0",
          status: "pending",
          revokedAt: null,
        }),
        data: expect.objectContaining({
          status: "revoked",
          revokedBy: "admin@example.com",
          revocationReason: "reissued by staff invite batch render",
        }),
      })
    );
    expect(prismaMock.staffReviewInviteBatchRecipient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          invitationId: { in: ["old-invitation-sage"] },
          sendStatus: { in: ["pending", "claimed", "provider_failed"] },
        }),
        data: expect.objectContaining({
          sendStatus: "validation_failed",
          validationFailureCode: "revoked",
        }),
      })
    );
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
      ccDigest: null,
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

  it.each(validationFailureCases)(
    "fails closed before provider send on $name and persists no-send evidence",
    async ({ code, approvedInteractionId, batch, recipient, payload, invitation }) => {
      const { sendApprovedStaffReviewInviteBatch, sendSpy } = await arrangeApprovedBatch({
        batch,
        recipient,
        payload,
        invitation,
      });

      const result = await sendApprovedStaffReviewInviteBatch({
        batchId: "batch-a",
        approvedInteractionId: approvedInteractionId ?? "interaction-a",
        now: NOW,
        send: sendSpy,
      });

      expect(sendSpy).not.toHaveBeenCalled();
      expect(result.failed[0]).toMatchObject({ recipientId: "recipient-1", code });
      expect(prismaMock.staffReviewInviteBatchRecipient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "recipient-1" },
          data: expect.objectContaining({
            sendStatus: "validation_failed",
            validationFailureCode: code,
            validationFailureEvidence: expect.any(Object),
          }),
        })
      );
      expect(prismaMock.staffReviewInviteBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "batch-a" },
          data: expect.objectContaining({ status: "validation_failed" }),
        })
      );
    }
  );

  it("fails closed on roster drift before provider send", async () => {
    const { sendApprovedStaffReviewInviteBatch, sendSpy } = await arrangeApprovedBatch();
    prismaMock.mycoEmployee.findMany.mockResolvedValue(
      roster().map((employee, index) =>
        index === 0 ? { ...employee, name: "Changed Sage" } : employee
      )
    );

    const result = await sendApprovedStaffReviewInviteBatch({
      batchId: "batch-a",
      approvedInteractionId: "interaction-a",
      now: NOW,
      send: sendSpy,
    });

    expect(sendSpy).not.toHaveBeenCalled();
    expect(result.failed[0]).toMatchObject({ recipientId: "recipient-1", code: "roster_mismatch" });
    expect(prismaMock.staffReviewInviteBatchRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sendStatus: "validation_failed",
          validationFailureCode: "roster_mismatch",
        }),
      })
    );
  });

  it("fails closed on provider credential drift before provider send", async () => {
    const { sendApprovedStaffReviewInviteBatch, sendSpy } = await arrangeApprovedBatch();
    process.env.RESEND_API_KEY = "re_changed";

    const result = await sendApprovedStaffReviewInviteBatch({
      batchId: "batch-a",
      approvedInteractionId: "interaction-a",
      now: NOW,
      send: sendSpy,
    });

    expect(sendSpy).not.toHaveBeenCalled();
    expect(result.failed[0]).toMatchObject({
      recipientId: "recipient-1",
      code: "provider_credential_mismatch",
    });
    expect(prismaMock.staffReviewInviteBatchRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sendStatus: "validation_failed",
          validationFailureCode: "provider_credential_mismatch",
        }),
      })
    );
  });

  it("keeps an all-provider-failed batch approved for retry without marking validation_failed", async () => {
    const { sendApprovedStaffReviewInviteBatch, sendSpy } = await arrangeApprovedBatch();
    prismaMock.staffReviewInviteBatchRecipient.findMany.mockResolvedValueOnce([
      { sendStatus: "provider_failed" },
    ]);
    sendSpy.mockRejectedValueOnce(new Error("resend unavailable"));

    const result = await sendApprovedStaffReviewInviteBatch({
      batchId: "batch-a",
      approvedInteractionId: "interaction-a",
      now: NOW,
      send: sendSpy,
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "staff-review-invite:key-a",
    }));
    expect(prismaMock.staffReviewInviteBatchRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "recipient-1" },
        data: expect.objectContaining({
          sendStatus: "provider_failed",
          providerError: "resend unavailable",
        }),
      })
    );
    expect(prismaMock.staffReviewInviteBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-a" },
        data: { status: "approved" },
      })
    );
    expect(result).toMatchObject({
      batchId: "batch-a",
      status: "approved",
      failed: [{ recipientId: "recipient-1", code: "provider_failed" }],
    });
  });

  it("executor refuses an already-invalidated recipient row without attempting a new claim or provider send", async () => {
    const { sendApprovedStaffReviewInviteBatch, sendSpy } = await arrangeApprovedBatch({
      recipient: {
        sendStatus: "validation_failed",
        validationFailureCode: "revoked",
        validationFailureEvidence: {
          reason: "invitation reissued by staff invite batch render",
        },
      },
    });

    const result = await sendApprovedStaffReviewInviteBatch({
      batchId: "batch-a",
      approvedInteractionId: "interaction-a",
      now: NOW,
      send: sendSpy,
    });

    expect(sendSpy).not.toHaveBeenCalled();
    expect(prismaMock.staffReviewInviteBatchRecipient.updateMany).not.toHaveBeenCalled();
    expect(result.failed).toEqual([
      {
        recipientId: "recipient-1",
        code: "revoked",
        evidence: { reason: "invitation reissued by staff invite batch render" },
      },
    ]);
  });

  it("retries a partial provider failure without resending already-sent rows or changing idempotency keys", async () => {
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
      recipientId: "recipient-provider-failed",
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
      ccDigest: null,
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
    const failedRecipient = {
      id: "recipient-provider-failed",
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
      ccDigest: null,
      subjectDigest: digestText("Subject Dani"),
      htmlDigest: digestText("<p>Dani</p>"),
      textDigest: digestText("Dani"),
      providerIdempotencyKey: "staff-review-invite:key-pending",
      sendStatus: "provider_failed",
      claimId: null,
      claimedAt: null,
      sendAttemptCount: 1,
      providerError: "previous provider timeout",
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
      .mockResolvedValueOnce([sentRecipient, failedRecipient])
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
        recipientId: "recipient-provider-failed",
        emailMasked: "d***@thehigherpath.com",
        providerMessageId: "resend-new",
      },
    ]);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({
      to: "dani@thehigherpath.com",
      idempotencyKey: "staff-review-invite:key-pending",
    }));
    expect(sendSpy.mock.calls[0][0]).not.toHaveProperty("cc");
    expect(prismaMock.staffReviewInviteBatchRecipient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "recipient-provider-failed",
          providerMessageId: null,
          sentAt: null,
          sendStatus: { in: ["pending", "provider_failed"] },
        }),
        data: expect.objectContaining({
          sendStatus: "claimed",
          sendAttemptCount: { increment: 1 },
        }),
      })
    );
    expect(prismaMock.staffReviewInviteBatchRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "recipient-provider-failed" },
        data: expect.objectContaining({
          sendStatus: "sent",
          providerMessageId: "resend-new",
          providerError: null,
        }),
      })
    );
  });
});
