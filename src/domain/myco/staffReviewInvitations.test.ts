import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyReviewerSession } from "./reviewerPin";
import { QA_STAFF_REVIEW_PARTNER_ID_ENV } from "./staffReviewRoster";

const sendEmailMock = vi.hoisted(() => vi.fn());

const prismaMock = vi.hoisted(() => ({
  partner: { findUnique: vi.fn() },
  mycoEmployee: { upsert: vi.fn() },
  staffReviewInvitation: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  staffReviewInviteBatchRecipient: {
    updateMany: vi.fn(),
  },
  staffReviewSession: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  reviewerEnrollmentEvent: {
    create: vi.fn(),
  },
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)),
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock(prismaMock) };
});

vi.mock("@/lib/email", () => ({
  DEFAULT_EMAIL_FROM_ADDRESS: "Tripdar <noreply@tripd.ar>",
  DEFAULT_EMAIL_REPLY_TO_ADDRESS: "scottyclaw@gmail.com",
  sendEmail: sendEmailMock,
}));

const SECRET = "test-secret-for-staff-invites";
const PARTNER_ID = "partner-tmt";
const QA_PARTNER_ID = "partner-qa";
const INVITATION_ID = "invite-1";
const EMPLOYEE_ID = "employee-clay";
const SAGE_ID = "employee-sage";

function invitation(overrides: Record<string, unknown> = {}) {
  return {
    id: INVITATION_ID,
    partnerId: PARTNER_ID,
    employeeId: EMPLOYEE_ID,
    emailNormalized: "clayton@thehigherpath.com",
    tokenHash: "hash",
    status: "pending",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    revokedAt: null,
    confirmedAt: null,
    employee: {
      id: EMPLOYEE_ID,
      partnerId: PARTNER_ID,
      name: "Clay",
      email: "clayton@thehigherpath.com",
      active: true,
      optedOut: false,
    },
    ...overrides,
  };
}

describe("staff review invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = SECRET;
    process.env[QA_STAFF_REVIEW_PARTNER_ID_ENV] = QA_PARTNER_ID;
    prismaMock.partner.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      name: where.id === QA_PARTNER_ID ? "Tripdar QA" : "The Mushroom Top",
    }));
    prismaMock.mycoEmployee.upsert.mockResolvedValue({
      id: EMPLOYEE_ID,
      name: "Clay",
      email: "clayton@thehigherpath.com",
      active: true,
      optedOut: false,
    });
    prismaMock.staffReviewInvitation.findUnique.mockResolvedValue(invitation());
    prismaMock.staffReviewInvitation.findFirst.mockResolvedValue(invitation());
    prismaMock.staffReviewInvitation.findMany.mockResolvedValue([]);
    prismaMock.staffReviewInvitation.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.staffReviewInvitation.create.mockResolvedValue({
      id: INVITATION_ID,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    prismaMock.staffReviewSession.create.mockResolvedValue({ id: "session-1" });
    prismaMock.staffReviewSession.findMany.mockResolvedValue([]);
    prismaMock.staffReviewSession.findUnique.mockResolvedValue(null);
    prismaMock.reviewerEnrollmentEvent.create.mockResolvedValue({});
    sendEmailMock.mockResolvedValue({ messageId: "msg-1", provider: "resend" });
  });

  afterEach(() => {
    delete process.env[QA_STAFF_REVIEW_PARTNER_ID_ENV];
  });

  it("GET preview is read-only and returns one identity with a CSRF nonce", async () => {
    const { getStaffInvitePreview } = await import("./staffReviewInvitations");
    const preview = await getStaffInvitePreview("raw-invite-token");

    expect(preview).toMatchObject({
      state: "ready",
      displayName: "Clay",
      emailMasked: "cn@thehigherpath.com",
    });
    expect(preview?.csrfToken).toContain(INVITATION_ID);
    expect(prismaMock.staffReviewInvitation.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.staffReviewInvitation.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.staffReviewSession.create).not.toHaveBeenCalled();
  });

  it("refuses wrong email without consuming the invitation or creating a session", async () => {
    const { confirmStaffReviewInvitation, createInvitationCsrfToken, hashStaffReviewInvitationToken } =
      await import("./staffReviewInvitations");
    const tokenHash = hashStaffReviewInvitationToken("raw-invite-token");
    prismaMock.staffReviewInvitation.findUnique.mockResolvedValue(
      invitation({ tokenHash })
    );
    const csrfToken = createInvitationCsrfToken({ invitationId: INVITATION_ID, tokenHash });

    const result = await confirmStaffReviewInvitation({
      token: "raw-invite-token",
      email: "someone-else@example.com",
      csrfToken,
    });

    expect(result).toMatchObject({ ok: false, status: 403, code: "wrong_email" });
    expect(prismaMock.staffReviewInvitation.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.staffReviewSession.create).not.toHaveBeenCalled();
  });

  it("requires a valid CSRF nonce before consuming the invitation", async () => {
    const { confirmStaffReviewInvitation } = await import("./staffReviewInvitations");
    const result = await confirmStaffReviewInvitation({
      token: "raw-invite-token",
      email: "clayton@thehigherpath.com",
      csrfToken: "stale",
    });

    expect(result).toMatchObject({ ok: false, status: 403, code: "csrf" });
    expect(prismaMock.staffReviewInvitation.updateMany).not.toHaveBeenCalled();
  });

  it("confirms once and returns a session cookie bound to the real employee id", async () => {
    const { confirmStaffReviewInvitation, createInvitationCsrfToken, hashStaffReviewInvitationToken } =
      await import("./staffReviewInvitations");
    const tokenHash = hashStaffReviewInvitationToken("raw-invite-token");
    prismaMock.staffReviewInvitation.findUnique.mockResolvedValue(invitation({ tokenHash }));
    const csrfToken = createInvitationCsrfToken({ invitationId: INVITATION_ID, tokenHash });

    const result = await confirmStaffReviewInvitation({
      token: "raw-invite-token",
      email: "  CLAYTON@THEHIGHERPATH.COM ",
      csrfToken,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectPath).toBe("/staff/catalog/session");
    const session = verifyReviewerSession(result.cookieValue, {
      tokenId: "session-1",
      secret: SECRET,
    });
    expect(session.ok && session.employeeId).toBe(EMPLOYEE_ID);
    expect(prismaMock.staffReviewInvitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: INVITATION_ID, status: "pending" }),
        data: expect.objectContaining({ status: "confirmed" }),
      })
    );
  });

  it("offers re-entry instead of authenticating a used invitation without the original cookie", async () => {
    const { confirmStaffReviewInvitation, createInvitationCsrfToken, hashStaffReviewInvitationToken } =
      await import("./staffReviewInvitations");
    const tokenHash = hashStaffReviewInvitationToken("raw-invite-token");
    prismaMock.staffReviewInvitation.findUnique.mockResolvedValue(
      invitation({ tokenHash, status: "confirmed", confirmedAt: new Date() })
    );
    const csrfToken = createInvitationCsrfToken({ invitationId: INVITATION_ID, tokenHash });

    const result = await confirmStaffReviewInvitation({
      token: "raw-invite-token",
      email: "clayton@thehigherpath.com",
      csrfToken,
    });

    expect(result).toMatchObject({ ok: false, status: 200, code: "reentry_offered" });
    expect(prismaMock.staffReviewSession.create).not.toHaveBeenCalled();
  });

  it("refuses expired, revoked, and replayed credentials with the re-entry matrix copy", async () => {
    const { confirmStaffReviewInvitation, createInvitationCsrfToken, hashStaffReviewInvitationToken } =
      await import("./staffReviewInvitations");
    const tokenHash = hashStaffReviewInvitationToken("raw-invite-token");
    const csrfToken = createInvitationCsrfToken({ invitationId: INVITATION_ID, tokenHash });

    prismaMock.staffReviewInvitation.findUnique.mockResolvedValue(
      invitation({ tokenHash, expiresAt: new Date(Date.now() - 1000) })
    );
    await expect(
      confirmStaffReviewInvitation({
        token: "raw-invite-token",
        email: "clayton@thehigherpath.com",
        csrfToken,
      })
    ).resolves.toMatchObject({
      ok: false,
      status: 410,
      code: "expired",
      message: "This invitation expired. Enter your email below and we'll send a fresh link.",
    });

    prismaMock.staffReviewInvitation.findUnique.mockResolvedValue(
      invitation({ tokenHash, status: "revoked", revokedAt: new Date() })
    );
    await expect(
      confirmStaffReviewInvitation({
        token: "raw-invite-token",
        email: "clayton@thehigherpath.com",
        csrfToken,
      })
    ).resolves.toMatchObject({
      ok: false,
      status: 410,
      code: "revoked",
      message: "This invitation was cancelled. Ask Jon for a new one.",
    });

    prismaMock.staffReviewInvitation.findUnique.mockResolvedValue(invitation({ tokenHash }));
    prismaMock.staffReviewInvitation.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      confirmStaffReviewInvitation({
        token: "raw-invite-token",
        email: "clayton@thehigherpath.com",
        csrfToken,
      })
    ).resolves.toMatchObject({
      ok: false,
      status: 409,
      code: "replayed",
      message: "This link was just used. Enter your email and we'll send a fresh one.",
    });
  });

  it("re-enters on a second device with the same invitation-bound real-email employee id", async () => {
    const existingProgress = [
      { id: "change-devon-real-1", actorIdentity: EMPLOYEE_ID },
      { id: "change-devon-real-2", actorIdentity: EMPLOYEE_ID },
    ];
    const { confirmStaffReviewInvitation, createInvitationCsrfToken, hashStaffReviewInvitationToken } =
      await import("./staffReviewInvitations");
    const originalTokenHash = hashStaffReviewInvitationToken("original-invite-token");
    prismaMock.staffReviewInvitation.findUnique.mockResolvedValue(
      invitation({ tokenHash: originalTokenHash })
    );
    prismaMock.staffReviewSession.create
      .mockResolvedValueOnce({ id: "home-session" })
      .mockResolvedValueOnce({ id: "work-session" });
    const originalCsrf = createInvitationCsrfToken({
      invitationId: INVITATION_ID,
      tokenHash: originalTokenHash,
    });

    const home = await confirmStaffReviewInvitation({
      token: "original-invite-token",
      email: "clayton@thehigherpath.com",
      csrfToken: originalCsrf,
    });
    expect(home.ok && home.status).toBe("confirmed");

    let reentryInvitationData: Record<string, unknown> | null = null;
    prismaMock.staffReviewInvitation.findFirst.mockResolvedValue(
      invitation({ tokenHash: originalTokenHash, status: "confirmed", confirmedAt: new Date() })
    );
    prismaMock.staffReviewInvitation.findMany.mockResolvedValue([]);
    prismaMock.staffReviewInvitation.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      reentryInvitationData = data;
      return { id: "reentry-invitation" };
    });

    const { requestStaffReviewReentry } = await import("./staffReviewInvitations");
    const reentry = await requestStaffReviewReentry({
      email: "CLAYTON@THEHIGHERPATH.COM",
      requestOrigin: "https://tripdar.test",
    });
    expect(reentry.ok).toBe(true);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(reentry.ok && reentry.afterResponse).toBeTypeOf("function");
    if (reentry.ok) await reentry.afterResponse?.();

    const text = sendEmailMock.mock.calls[0][0].text as string;
    const freshToken = text.match(/\/staff-review\/invite\/([^\s]+)/)?.[1] ?? "";
    expect(freshToken).not.toBe("");
    const freshTokenHash = hashStaffReviewInvitationToken(freshToken);
    expect(reentryInvitationData).toMatchObject({
      partnerId: PARTNER_ID,
      employeeId: EMPLOYEE_ID,
      emailNormalized: "clayton@thehigherpath.com",
      tokenHash: freshTokenHash,
      issuedBy: "self-service-reentry",
    });

    prismaMock.staffReviewInvitation.findUnique.mockResolvedValue(
      invitation({
        id: "reentry-invitation",
        tokenHash: freshTokenHash,
        issuedBy: "self-service-reentry",
      })
    );
    prismaMock.staffReviewInvitation.updateMany.mockResolvedValue({ count: 1 });
    const freshCsrf = createInvitationCsrfToken({
      invitationId: "reentry-invitation",
      tokenHash: freshTokenHash,
    });
    const work = await confirmStaffReviewInvitation({
      token: freshToken,
      email: "clayton@thehigherpath.com",
      csrfToken: freshCsrf,
    });

    expect(work.ok).toBe(true);
    if (!work.ok) return;
    const session = verifyReviewerSession(work.cookieValue, {
      tokenId: "work-session",
      secret: SECRET,
    });
    expect(session.ok && session.employeeId).toBe(EMPLOYEE_ID);
    expect(prismaMock.staffReviewSession.create.mock.calls[1][0].data.employeeId).toBe(EMPLOYEE_ID);
    expect(existingProgress).toEqual([
      { id: "change-devon-real-1", actorIdentity: EMPLOYEE_ID },
      { id: "change-devon-real-2", actorIdentity: EMPLOYEE_ID },
    ]);
  });

  it("supports Sage as an invitation identity with no legacy alias counterpart", async () => {
    const { requestStaffReviewReentry } = await import("./staffReviewInvitations");
    prismaMock.staffReviewInvitation.findFirst.mockResolvedValue(
      invitation({
        employeeId: SAGE_ID,
        emailNormalized: "sage@thegreenroomonventura.com",
        employee: {
          id: SAGE_ID,
          partnerId: PARTNER_ID,
          name: "Sage",
          email: "sage@thegreenroomonventura.com",
          active: true,
          optedOut: false,
        },
      })
    );
    prismaMock.staffReviewInvitation.findMany.mockResolvedValue([]);

    const result = await requestStaffReviewReentry({
      email: "sage@thegreenroomonventura.com",
      requestOrigin: "https://tripdar.test",
    });

    expect(result.ok).toBe(true);
    expect(prismaMock.staffReviewInvitation.create.mock.calls[0][0].data).toMatchObject({
      employeeId: SAGE_ID,
      emailNormalized: "sage@thegreenroomonventura.com",
      issuedBy: "self-service-reentry",
    });
  });

  it("enforces DB-backed per-employee and per-partner re-entry limits", async () => {
    const { requestStaffReviewReentry } = await import("./staffReviewInvitations");
    const now = new Date("2026-08-10T17:00:00.000Z");
    prismaMock.staffReviewInvitation.findFirst.mockResolvedValue(invitation());
    prismaMock.staffReviewInvitation.findMany
      .mockResolvedValueOnce([
        { issuedAt: new Date("2026-08-10T16:10:00.000Z") },
        { issuedAt: new Date("2026-08-10T16:20:00.000Z") },
        { issuedAt: new Date("2026-08-10T16:30:00.000Z") },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      requestStaffReviewReentry({ email: "clayton@thehigherpath.com", now })
    ).resolves.toMatchObject({
      ok: false,
      status: 429,
      code: "too_many_requests",
      retryAfter: 600,
    });
    expect(prismaMock.staffReviewInvitation.create).not.toHaveBeenCalled();

    prismaMock.staffReviewInvitation.findMany.mockReset();
    prismaMock.staffReviewInvitation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(
        Array.from({ length: 30 }, (_, index) => ({
          issuedAt: new Date(now.getTime() - (30 - index) * 60 * 1000),
        }))
      );
    await expect(
      requestStaffReviewReentry({ email: "clayton@thehigherpath.com", now })
    ).resolves.toMatchObject({
      ok: false,
      status: 429,
      code: "too_many_requests",
    });
    expect(prismaMock.staffReviewInvitation.create).not.toHaveBeenCalled();
  });

  it("does not schedule mail for unmatched, inactive, or opted-out re-entry requests", async () => {
    const { requestStaffReviewReentry, STAFF_REVIEW_REENTRY_SUCCESS_MESSAGE } =
      await import("./staffReviewInvitations");
    prismaMock.staffReviewInvitation.findFirst.mockResolvedValueOnce(null);
    await expect(
      requestStaffReviewReentry({ email: "nobody@example.com" })
    ).resolves.toEqual({
      ok: true,
      status: 202,
      message: STAFF_REVIEW_REENTRY_SUCCESS_MESSAGE,
    });

    prismaMock.staffReviewInvitation.findFirst.mockResolvedValueOnce(
      invitation({ employee: { ...invitation().employee, active: false } })
    );
    await expect(
      requestStaffReviewReentry({ email: "clayton@thehigherpath.com" })
    ).resolves.toEqual({
      ok: true,
      status: 202,
      message: STAFF_REVIEW_REENTRY_SUCCESS_MESSAGE,
    });

    prismaMock.staffReviewInvitation.findFirst.mockResolvedValueOnce(
      invitation({ employee: { ...invitation().employee, optedOut: true } })
    );
    await expect(
      requestStaffReviewReentry({ email: "clayton@thehigherpath.com" })
    ).resolves.toEqual({
      ok: true,
      status: 202,
      message: STAFF_REVIEW_REENTRY_SUCCESS_MESSAGE,
    });

    expect(prismaMock.staffReviewInvitation.create).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("prepares a QA-sandbox UNSENT DRAFT batch and stores only token hashes", async () => {
    const { prepareCanonicalStaffReviewInvitationBatch } = await import("./staffReviewInvitations");
    const batch = await prepareCanonicalStaffReviewInvitationBatch({
      partnerId: QA_PARTNER_ID,
      issuedBy: "admin@example.com",
      requestOrigin: "https://tripdar.test",
      qaOnly: true,
    });

    expect(batch.partner.id).toBe(QA_PARTNER_ID);
    expect(batch.status).toBe("UNSENT DRAFT");
    expect(batch.send).toBe(false);
    expect(batch.recipients).toHaveLength(1);
    expect(batch.recipients[0]).toMatchObject({
      displayName: "QA Reviewer",
      email: "qa-reviewer@tripdar-qa.invalid",
      status: "UNSENT DRAFT",
    });
    expect(batch.recipients[0].url).toContain("/staff-review/invite/");
    expect(prismaMock.mycoEmployee.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          partnerId_email: {
            partnerId: QA_PARTNER_ID,
            email: "qa-reviewer@tripdar-qa.invalid",
          },
        },
      })
    );
    expect(prismaMock.staffReviewInvitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ token: expect.any(String) }),
      })
    );
    expect(prismaMock.staffReviewInvitation.create.mock.calls[0][0].data).toMatchObject({
      partnerId: QA_PARTNER_ID,
      emailNormalized: "qa-reviewer@tripdar-qa.invalid",
    });
    expect(prismaMock.staffReviewInvitation.create.mock.calls[0][0].data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("invalidates approved unsent batch recipients when a pending direct invitation is revoked on reissue", async () => {
    prismaMock.staffReviewInvitation.findMany.mockResolvedValue([{ id: "old-invitation" }]);

    const { prepareCanonicalStaffReviewInvitationBatch } = await import("./staffReviewInvitations");
    await prepareCanonicalStaffReviewInvitationBatch({
      partnerId: QA_PARTNER_ID,
      issuedBy: "admin@example.com",
      requestOrigin: "https://tripdar.test",
      qaOnly: true,
    });

    expect(prismaMock.staffReviewInviteBatchRecipient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          invitationId: { in: ["old-invitation"] },
          sendStatus: { in: ["pending", "claimed", "provider_failed"] },
          batch: { status: { in: ["approved", "sending", "partially_sent"] } },
        }),
        data: expect.objectContaining({
          sendStatus: "validation_failed",
          validationFailureCode: "revoked",
        }),
      })
    );
  });

  it("refuses TMT qaOnly before any transaction-backed invitation mutation", async () => {
    const { prepareCanonicalStaffReviewInvitationBatch } = await import("./staffReviewInvitations");

    await expect(
      prepareCanonicalStaffReviewInvitationBatch({
        partnerId: PARTNER_ID,
        issuedBy: "admin@example.com",
        requestOrigin: "https://tripdar.test",
        qaOnly: true,
      })
    ).rejects.toMatchObject({
      code: "qa_partner_scope_refused",
      statusCode: 403,
      message: "qaOnly is only allowed for the QA staff review partner.",
    });

    expect(prismaMock.partner.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.mycoEmployee.upsert).not.toHaveBeenCalled();
    expect(prismaMock.staffReviewInvitation.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.staffReviewInvitation.create).not.toHaveBeenCalled();
  });

  it("keeps non-QA canonical preview inert until Jon approves live token generation", async () => {
    const { prepareCanonicalStaffReviewInvitationBatch } = await import("./staffReviewInvitations");
    const batch = await prepareCanonicalStaffReviewInvitationBatch({
      partnerId: PARTNER_ID,
      issuedBy: "admin@example.com",
      requestOrigin: "https://tripdar.test",
    });

    expect(batch).toMatchObject({
      status: "UNSENT DRAFT",
      send: false,
      previewOnly: true,
    });
    expect(batch.recipients).toHaveLength(6);
    expect(batch.recipients.map((recipient) => recipient.displayName)).toEqual([
      "Sage",
      "Dani",
      "Eddie",
      "Devon",
      "Clay",
      "Audrey",
    ]);
    expect(batch.recipients.every((recipient) => recipient.url === null)).toBe(true);
    expect(batch.recipients.every((recipient) => recipient.tokenPreview === null)).toBe(true);
    expect(batch.recipients.every((recipient) => recipient.tokenHashPrefix === null)).toBe(true);
    expect(batch.recipients.every((recipient) => recipient.invitationId === null)).toBe(true);
    expect(batch.recipients.every((recipient) => recipient.employeeId === null)).toBe(true);
    expect(prismaMock.mycoEmployee.upsert).not.toHaveBeenCalled();
    expect(prismaMock.staffReviewInvitation.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.staffReviewInvitation.create).not.toHaveBeenCalled();
  });

  it("does not reactivate inactive or opted-out employees during preview prep", async () => {
    process.env[QA_STAFF_REVIEW_PARTNER_ID_ENV] = QA_PARTNER_ID;
    prismaMock.mycoEmployee.upsert.mockResolvedValue({
      id: EMPLOYEE_ID,
      name: "QA Reviewer",
      email: "qa-reviewer@tripdar-qa.invalid",
      active: false,
      optedOut: false,
    });

    const { prepareCanonicalStaffReviewInvitationBatch } = await import("./staffReviewInvitations");
    const batch = await prepareCanonicalStaffReviewInvitationBatch({
      partnerId: QA_PARTNER_ID,
      issuedBy: "admin@example.com",
      qaOnly: true,
    });

    expect(prismaMock.mycoEmployee.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { name: "QA Reviewer" } })
    );
    expect(prismaMock.staffReviewInvitation.create).not.toHaveBeenCalled();
    expect(batch.recipients[0]).toMatchObject({
      status: "SKIPPED",
      error: "Employee inactive or opted out",
    });
  });
});
