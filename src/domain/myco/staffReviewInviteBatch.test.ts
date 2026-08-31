import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmailMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  storeProductCatalog: { findUnique: vi.fn() },
  mycoEmployee: { upsert: vi.fn() },
  catalogAccessToken: { create: vi.fn(), update: vi.fn() },
  mycoEmployeeReviewAssignment: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  staffReviewInviteBatch: {
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  staffReviewInviteRecipient: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    groupBy: vi.fn(),
  },
  staffReviewInviteNoSendEvidence: {
    create: vi.fn(),
  },
  $transaction: vi.fn(async (input: unknown) => {
    if (Array.isArray(input)) return Promise.all(input);
    if (typeof input === "function") return input(prismaMock);
    return input;
  }),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: sendEmailMock,
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock(prismaMock) };
});

const PRODUCT_ID = "product-1";
const PARTNER_ID = "partner-1";
const EMPLOYEE_ID = "employee-1";
const ASSIGNMENT_ID = "assignment-1";
const ACCESS_TOKEN_ID = "access-token-1";
const BATCH_ID = "batch-a";
const RECIPIENT_ID = "recipient-1";
const APPROVED_BY = "admin@tripdar.test";
function product() {
  return {
    id: PRODUCT_ID,
    partnerId: PARTNER_ID,
    brandId: "brand-1",
    productName: "Blue Blend",
    partner: { name: "The Mushroom Top" },
  };
}

function employee(overrides: Record<string, unknown> = {}) {
  return {
    id: EMPLOYEE_ID,
    name: "Clay",
    email: "clay@tmt.example",
    active: true,
    optedOut: false,
    ...overrides,
  };
}

async function approveOneRecipient() {
  const { approveStaffReviewInviteBatch } = await import("./staffReviewInviteBatch");
  prismaMock.storeProductCatalog.findUnique.mockResolvedValue(product());
  prismaMock.staffReviewInviteBatch.create.mockResolvedValue({ id: BATCH_ID });
  prismaMock.staffReviewInviteBatch.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.staffReviewInviteBatch.update.mockResolvedValue({});
  prismaMock.mycoEmployee.upsert.mockResolvedValue(employee());
  prismaMock.mycoEmployeeReviewAssignment.findUnique.mockResolvedValue(null);
  prismaMock.catalogAccessToken.create.mockResolvedValue({ id: ACCESS_TOKEN_ID });
  prismaMock.mycoEmployeeReviewAssignment.create.mockResolvedValue({ id: ASSIGNMENT_ID });
  prismaMock.staffReviewInviteRecipient.create.mockResolvedValue({ id: RECIPIENT_ID });

  const approved = await approveStaffReviewInviteBatch({
    partnerId: PARTNER_ID,
    catalogItemId: PRODUCT_ID,
    approvedBy: APPROVED_BY,
    requestOrigin: "https://tripdar.test",
    expiresInDays: 27,
    employees: [{ name: "Clay", email: "CLAY@TMT.EXAMPLE" }],
  });

  const recipientData = prismaMock.staffReviewInviteRecipient.create.mock.calls[0][0].data;
  const batchCreateData = prismaMock.staffReviewInviteBatch.create.mock.calls[0][0].data;
  const batchUpdateData = prismaMock.staffReviewInviteBatch.update.mock.calls.at(-1)?.[0].data;
  return { approved, recipientData, batchCreateData, batchUpdateData };
}

function validationRecord(input: {
  recipientData: Record<string, unknown>;
  batchCreateData: Record<string, unknown>;
  batchUpdateData: Record<string, unknown>;
  overrides?: Record<string, unknown>;
}): Record<string, unknown> {
  const recipientSnapshot = input.recipientData.recipientSnapshot as Record<string, unknown>;
  const expiresAt = new Date(recipientSnapshot.expiresAt as string);
  const assignment = {
    id: ASSIGNMENT_ID,
    catalogItemId: PRODUCT_ID,
    employeeId: EMPLOYEE_ID,
    accessTokenId: ACCESS_TOKEN_ID,
    tokenHash: input.recipientData.tokenHash,
    status: "assigned",
    expiresAt,
    accessToken: {
      id: ACCESS_TOKEN_ID,
      tokenHash: input.recipientData.accessTokenHash,
      purpose: "staff_review",
      status: "active",
      partnerId: PARTNER_ID,
      brandId: "brand-1",
      catalogItemId: PRODUCT_ID,
      issuedToType: "staff",
      issuedToId: EMPLOYEE_ID,
      issuedToEmail: "clay@tmt.example",
      expiresAt,
      revokedAt: null,
    },
    employee: employee(),
    catalogItem: product(),
  };
  const record = {
    id: RECIPIENT_ID,
    batchId: BATCH_ID,
    assignmentId: ASSIGNMENT_ID,
    employeeId: EMPLOYEE_ID,
    accessTokenId: ACCESS_TOKEN_ID,
    emailNormalized: "clay@tmt.example",
    employeeName: "Clay",
    tokenHash: input.recipientData.tokenHash,
    accessTokenHash: input.recipientData.accessTokenHash,
    linkDigest: input.recipientData.linkDigest,
    subjectDigest: input.recipientData.subjectDigest,
    htmlDigest: input.recipientData.htmlDigest,
    textDigest: input.recipientData.textDigest,
    rosterDigest: input.recipientData.rosterDigest,
    sender: input.recipientData.sender,
    status: "pending",
    providerMessageId: null,
    sentAt: null,
    messageSnapshot: input.recipientData.messageSnapshot,
    recipientSnapshot: input.recipientData.recipientSnapshot,
    accessToken: assignment.accessToken,
    assignment,
    batch: {
      id: BATCH_ID,
      partnerId: PARTNER_ID,
      catalogItemId: PRODUCT_ID,
      status: "approved",
      expiresAt,
      sender: input.recipientData.sender,
      providerCredentialFingerprint: input.batchCreateData.providerCredentialFingerprint,
      subjectDigest: input.batchUpdateData.subjectDigest,
      htmlDigest: input.batchUpdateData.htmlDigest,
      textDigest: input.batchUpdateData.textDigest,
      rosterDigest: input.batchUpdateData.rosterDigest,
      recipients: [
        {
          id: RECIPIENT_ID,
          rosterDigest: input.recipientData.rosterDigest,
          subjectDigest: input.recipientData.subjectDigest,
          htmlDigest: input.recipientData.htmlDigest,
          textDigest: input.recipientData.textDigest,
        },
      ],
    },
  };
  return deepMerge(record, input.overrides ?? {});
}

function deepMerge(base: Record<string, unknown>, overrides: Record<string, unknown>): Record<string, unknown> {
  const out = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (
      value &&
      typeof value === "object" &&
      !(value instanceof Date) &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === "object" &&
      !(base[key] instanceof Date) &&
      !Array.isArray(base[key])
    ) {
      out[key] = deepMerge(base[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function runSendValidation(record: Record<string, unknown>) {
  const { sendApprovedStaffReviewInviteBatch } = await import("./staffReviewInviteBatch");
  const sendProvider = vi.fn().mockResolvedValue({ id: "provider-message-1" });
  prismaMock.staffReviewInviteRecipient.findMany.mockResolvedValue([
    {
      id: RECIPIENT_ID,
      assignmentId: ASSIGNMENT_ID,
      employeeId: EMPLOYEE_ID,
      emailNormalized: "clay@tmt.example",
    },
  ]);
  prismaMock.staffReviewInviteRecipient.findUnique.mockResolvedValue(record);
  prismaMock.staffReviewInviteNoSendEvidence.create.mockResolvedValue({ id: "evidence-1" });
  prismaMock.staffReviewInviteRecipient.update.mockResolvedValue({});
  prismaMock.staffReviewInviteBatch.update.mockResolvedValue({});
  prismaMock.mycoEmployeeReviewAssignment.update.mockResolvedValue({});
  prismaMock.staffReviewInviteRecipient.groupBy.mockResolvedValue([{ status: "refused", _count: { _all: 1 } }]);

  const result = await sendApprovedStaffReviewInviteBatch({ batchId: BATCH_ID, sendProvider });
  return { result, sendProvider };
}

describe("staff review invite batches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "approved-key";
  });

  it("canonicalizes digests independent of object key order", async () => {
    const { canonicalDigest } = await import("./staffReviewInviteBatch");

    expect(canonicalDigest({ b: 2, a: { d: 4, c: 3 } })).toBe(
      canonicalDigest({ a: { c: 3, d: 4 }, b: 2 })
    );
  });

  it("freezes approved recipient snapshots before sending", async () => {
    const { approved, recipientData, batchUpdateData } = await approveOneRecipient();

    expect(approved.batchId).toBe(BATCH_ID);
    expect(approved.assignments[0]).toMatchObject({
      employeeId: EMPLOYEE_ID,
      assignmentId: ASSIGNMENT_ID,
      recipientId: RECIPIENT_ID,
      email: "clay@tmt.example",
      sent: false,
    });
    expect(approved.assignments[0].link).toContain("/review/myco/");
    expect(recipientData.messageSnapshot.link).toBe(approved.assignments[0].link);
    expect(recipientData.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(recipientData.accessTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(batchUpdateData.recipientCount).toBe(1);
    expect(prismaMock.staffReviewInviteBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ supersededByBatchId: BATCH_ID }),
      })
    );
  });

  it("validates an approved row without marking the public review link opened", async () => {
    const { validateApprovedStaffReviewInviteRecipient } = await import("./staffReviewInviteBatch");
    const captured = await approveOneRecipient();
    const record = validationRecord(captured);
    prismaMock.staffReviewInviteRecipient.findUnique.mockResolvedValue(record);
    prismaMock.staffReviewInviteRecipient.update.mockResolvedValue({});

    const result = await validateApprovedStaffReviewInviteRecipient({
      recipientId: RECIPIENT_ID,
      persistEvidence: false,
    });

    expect(result.ok).toBe(true);
    expect(prismaMock.mycoEmployeeReviewAssignment.update).not.toHaveBeenCalled();
    expect(prismaMock.catalogAccessToken.update).not.toHaveBeenCalled();
    expect(prismaMock.staffReviewInviteNoSendEvidence.create).not.toHaveBeenCalled();
  });

  it("sends only pending recipients during partial recovery", async () => {
    const captured = await approveOneRecipient();
    const record = validationRecord(captured);
    const { sendApprovedStaffReviewInviteBatch } = await import("./staffReviewInviteBatch");
    const sendProvider = vi.fn().mockResolvedValue({ id: "provider-message-1" });
    prismaMock.staffReviewInviteRecipient.findMany.mockResolvedValue([
      {
        id: RECIPIENT_ID,
        assignmentId: ASSIGNMENT_ID,
        employeeId: EMPLOYEE_ID,
        emailNormalized: "clay@tmt.example",
      },
    ]);
    prismaMock.staffReviewInviteRecipient.findUnique.mockResolvedValue(record);
    prismaMock.staffReviewInviteRecipient.update.mockResolvedValue({});
    prismaMock.staffReviewInviteBatch.update.mockResolvedValue({});
    prismaMock.mycoEmployeeReviewAssignment.update.mockResolvedValue({});
    prismaMock.staffReviewInviteRecipient.groupBy.mockResolvedValue([{ status: "sent", _count: { _all: 2 } }]);

    const result = await sendApprovedStaffReviewInviteBatch({ batchId: BATCH_ID, sendProvider });

    expect(sendProvider).toHaveBeenCalledTimes(1);
    expect(sendProvider.mock.calls[0][0]).toMatchObject({
      to: "clay@tmt.example",
      from: "Tripdar <noreply@tripd.ar>",
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ sent: true, providerMessageId: "provider-message-1" });
    expect(prismaMock.staffReviewInviteRecipient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { batchId: BATCH_ID, status: "pending", providerMessageId: null },
      })
    );
  });

  it.each([
    [
      "batch A invalidated by later generation B",
      { assignment: { tokenHash: "different-token-hash" } },
      "token_mismatch",
    ],
    [
      "revoked token",
      { assignment: { accessToken: { status: "revoked", revokedAt: new Date("2026-08-02T00:00:00Z") } } },
      "revoked",
    ],
    [
      "missing access token",
      { assignment: { accessToken: null, accessTokenId: null } },
      "access_token_missing",
    ],
    [
      "access token identity mismatch",
      { assignment: { accessTokenId: "access-token-b" } },
      "access_token_mismatch",
    ],
    [
      "expired token",
      { assignment: { expiresAt: new Date("2026-07-01T00:00:00Z") } },
      "expired",
    ],
    [
      "non-current assignment status",
      { assignment: { status: "paused" } },
      "assignment_not_current",
    ],
    [
      "roster mismatch",
      { assignment: { employee: { name: "Clay Updated" } } },
      "roster_mismatch",
    ],
    [
      "body mismatch",
      { messageSnapshot: { html: "<p>changed after approval</p>" } },
      "body_mismatch",
    ],
    [
      "subject mismatch",
      { messageSnapshot: { subject: "Changed subject" } },
      "subject_mismatch",
    ],
    [
      "link mismatch",
      { messageSnapshot: { link: "https://tripdar.test/review/myco/substituted" } },
      "link_mismatch",
    ],
    [
      "sender mismatch",
      { sender: "Other <noreply@example.com>" },
      "sender_mismatch",
    ],
    [
      "duplicate send",
      { providerMessageId: "already-sent", status: "sent" },
      "duplicate_send",
    ],
    [
      "opted-out employee",
      { assignment: { employee: { optedOut: true } } },
      "employee_opted_out",
    ],
    [
      "catalog mismatch",
      { assignment: { catalogItemId: "other-product" } },
      "catalog_mismatch",
    ],
    [
      "recipient email mismatch",
      { assignment: { employee: { email: "other@tmt.example" } } },
      "recipient_mismatch",
    ],
  ])("fails closed before provider call for %s", async (_label, overrides, reason) => {
    const captured = await approveOneRecipient();
    const record = validationRecord({ ...captured, overrides });

    const { result, sendProvider } = await runSendValidation(record);

    expect(sendProvider).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({ sent: false, error: reason });
    expect(prismaMock.staffReviewInviteNoSendEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason,
          requiresApproval: true,
        }),
      })
    );
  });

  it("fails closed before provider call when the provider credential fingerprint changes", async () => {
    const captured = await approveOneRecipient();
    process.env.RESEND_API_KEY = "rotated-key";
    const record = validationRecord(captured);

    const { result, sendProvider } = await runSendValidation(record);

    expect(sendProvider).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({ sent: false, error: "provider_credential_mismatch" });
    expect(prismaMock.staffReviewInviteNoSendEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: "provider_credential_mismatch" }),
      })
    );
  });

  it("fails closed before provider call when the recipient snapshot is missing", async () => {
    const { sendApprovedStaffReviewInviteBatch } = await import("./staffReviewInviteBatch");
    const sendProvider = vi.fn();
    prismaMock.staffReviewInviteRecipient.findMany.mockResolvedValue([
      {
        id: RECIPIENT_ID,
        assignmentId: ASSIGNMENT_ID,
        employeeId: EMPLOYEE_ID,
        emailNormalized: "clay@tmt.example",
      },
    ]);
    prismaMock.staffReviewInviteRecipient.findUnique.mockResolvedValue(null);
    prismaMock.staffReviewInviteRecipient.groupBy.mockResolvedValue([]);
    prismaMock.staffReviewInviteBatch.update.mockResolvedValue({});

    const result = await sendApprovedStaffReviewInviteBatch({ batchId: BATCH_ID, sendProvider });

    expect(sendProvider).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({ sent: false, error: "assignment_missing" });
  });
});
