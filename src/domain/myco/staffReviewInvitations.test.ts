import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyReviewerSession } from "./reviewerPin";

const prismaMock = vi.hoisted(() => ({
  partner: { findUnique: vi.fn() },
  mycoEmployee: { upsert: vi.fn() },
  staffReviewInvitation: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  staffReviewSession: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)),
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock(prismaMock) };
});

const SECRET = "test-secret-for-staff-invites";
const PARTNER_ID = "partner-tmt";
const INVITATION_ID = "invite-1";
const EMPLOYEE_ID = "employee-clay";

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
    prismaMock.partner.findUnique.mockResolvedValue({ id: PARTNER_ID, name: "The Mushroom Top" });
    prismaMock.mycoEmployee.upsert.mockResolvedValue({
      id: EMPLOYEE_ID,
      name: "Clay",
      email: "clayton@thehigherpath.com",
      active: true,
      optedOut: false,
    });
    prismaMock.staffReviewInvitation.findUnique.mockResolvedValue(invitation());
    prismaMock.staffReviewInvitation.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.staffReviewInvitation.create.mockResolvedValue({
      id: INVITATION_ID,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    prismaMock.staffReviewSession.create.mockResolvedValue({ id: "session-1" });
    prismaMock.staffReviewSession.findMany.mockResolvedValue([]);
    prismaMock.staffReviewSession.findUnique.mockResolvedValue(null);
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

  it("prepares an UNSENT DRAFT batch and stores only token hashes", async () => {
    const { prepareCanonicalStaffReviewInvitationBatch } = await import("./staffReviewInvitations");
    const batch = await prepareCanonicalStaffReviewInvitationBatch({
      partnerId: PARTNER_ID,
      issuedBy: "admin@example.com",
      requestOrigin: "https://tripdar.test",
      qaOnly: true,
    });

    expect(batch.status).toBe("UNSENT DRAFT");
    expect(batch.send).toBe(false);
    expect(batch.recipients).toHaveLength(1);
    expect(batch.recipients[0]).toMatchObject({
      displayName: "QA Reviewer",
      email: "qa-reviewer@tripdar-qa.invalid",
      status: "UNSENT DRAFT",
    });
    expect(batch.recipients[0].url).toContain("/staff-review/invite/");
    expect(prismaMock.staffReviewInvitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ token: expect.any(String) }),
      })
    );
    expect(prismaMock.staffReviewInvitation.create.mock.calls[0][0].data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
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
    prismaMock.mycoEmployee.upsert.mockResolvedValue({
      id: EMPLOYEE_ID,
      name: "QA Reviewer",
      email: "qa-reviewer@tripdar-qa.invalid",
      active: false,
      optedOut: false,
    });

    const { prepareCanonicalStaffReviewInvitationBatch } = await import("./staffReviewInvitations");
    const batch = await prepareCanonicalStaffReviewInvitationBatch({
      partnerId: PARTNER_ID,
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
