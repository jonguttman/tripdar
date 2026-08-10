import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminSession } from "@/domain/auth/adminSession";
import {
  approveStaffReviewInviteBatch,
  prepareStaffReviewInviteBatch,
  revokeStaffReviewInvitation,
  StaffInviteError,
  type StaffInviteDb,
} from "./staffReviewInviteBatches";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const PARTNER_ID = "partner_tmt";
const OTHER_PARTNER_ID = "partner_other";
const ADMIN_EMAIL = "jon@example.com";
const SEAL_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const NOW = new Date("2026-08-09T17:45:00.000Z");

type RecordedCall = {
  method: string;
  args: unknown[];
};

type ReviewerState = {
  id: string;
  name: string;
  email: string;
};

type InvitationState = {
  id: string;
  partnerId: string;
  employeeId: string;
  displayName: string;
  emailNormalized: string;
  status: string;
  issuedBy: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
  revocationReason: string | null;
};

type CatalogTokenState = {
  id: string;
  purpose: string;
  partnerId: string;
  status: string;
  revokedAt: Date | null;
};

type CreateDbOptions = {
  partnerFound?: boolean;
  reviewers?: ReviewerState[];
  invitations?: InvitationState[];
  activeCatalogTokens?: CatalogTokenState[];
  failRecipientCreateAt?: number;
};

function baseTemplates() {
  return {
    subject: "Your Tripdar review link: {{INVITE_URL}}",
    html: "<p>Open {{INVITE_URL}} when you are ready.</p>",
    text: "Open {{INVITE_URL}} when you are ready.",
    cc: ["ops@example.test"],
  };
}

function superAdminSession(): AdminSession {
  return {
    user: { email: ADMIN_EMAIL },
    expires: "2099-01-01T00:00:00.000Z",
    actualUser: { email: ADMIN_EMAIL, role: "super_admin" },
    viewAs: null,
  };
}

function pendingInvitation(overrides: Partial<InvitationState> = {}): InvitationState {
  return {
    id: "invite_1",
    partnerId: PARTNER_ID,
    employeeId: "emp_a",
    displayName: "Adrienne",
    emailNormalized: "adrienne@themushroomtop.internal",
    status: "pending",
    issuedBy: "approval",
    issuedAt: new Date("2026-08-05T00:00:00.000Z"),
    expiresAt: new Date("2026-08-30T00:00:00.000Z"),
    revokedAt: null,
    revokedBy: null,
    revocationReason: null,
    ...overrides,
  };
}

function objectValue(input: unknown, key: string): unknown {
  return input && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

function stringArrayFromInFilter(input: unknown): string[] | null {
  const inValue = objectValue(input, "in");
  return Array.isArray(inValue) && inValue.every((item) => typeof item === "string") ? inValue : null;
}

function matchesStringFilter(actual: string, expected: unknown): boolean {
  if (typeof expected === "string") return actual === expected;
  const inValues = stringArrayFromInFilter(expected);
  return inValues ? inValues.includes(actual) : true;
}

function matchesInvitationWhere(invitation: InvitationState, where: unknown): boolean {
  if (!where || typeof where !== "object") return true;
  const filters = where as Record<string, unknown>;
  if (!matchesStringFilter(invitation.id, filters.id)) return false;
  if (!matchesStringFilter(invitation.partnerId, filters.partnerId)) return false;
  if (!matchesStringFilter(invitation.employeeId, filters.employeeId)) return false;
  if (!matchesStringFilter(invitation.status, filters.status)) return false;
  if (!matchesStringFilter(invitation.revocationReason ?? "", filters.revocationReason)) return false;
  if (filters.revokedAt === null && invitation.revokedAt !== null) return false;
  return true;
}

function matchesRecipientWhere(recipient: Record<string, unknown>, where: unknown): boolean {
  if (!where || typeof where !== "object") return true;
  const filters = where as Record<string, unknown>;
  const invitationId = recipient.invitationId;
  if (typeof invitationId === "string" && !matchesStringFilter(invitationId, filters.invitationId)) return false;
  if (filters.invitationId !== undefined && typeof invitationId !== "string") return false;
  if (!matchesStringFilter(String(recipient.batchId), filters.batchId)) return false;
  if (filters.sentAt === null && recipient.sentAt !== null && recipient.sentAt !== undefined) return false;
  const sendStatus = filters.sendStatus;
  const sendStatuses = stringArrayFromInFilter(sendStatus);
  if (sendStatuses && !sendStatuses.includes(String(recipient.sendStatus))) return false;
  return true;
}

function cloneRecordMap(input: Record<string, Record<string, unknown>>): Record<string, Record<string, unknown>> {
  return structuredClone(input) as Record<string, Record<string, unknown>>;
}

function createDb(options: CreateDbOptions = {}) {
  const calls: RecordedCall[] = [];
  const record = (method: string, args: unknown[]) => calls.push({ method, args });

  const reviewers = options.reviewers ?? [
    { id: "emp_a", name: "Adrienne", email: "adrienne@themushroomtop.internal" },
    { id: "emp_d", name: "Devon", email: "devon@themushroomtop.internal" },
  ];
  const invitations = options.invitations ? structuredClone(options.invitations) : [pendingInvitation({ id: "prior_emp_a" })];
  const catalogTokens = options.activeCatalogTokens
    ? structuredClone(options.activeCatalogTokens)
    : [{ id: "old_staff_link", purpose: "staff_review", partnerId: PARTNER_ID, status: "active", revokedAt: null }];
  const createdBatches: Record<string, Record<string, unknown>> = {};
  const finalRecipients: Record<string, unknown>[] = [];
  let recipientCreateCount = 0;

  const transaction = async <T>(fn: (tx: StaffInviteDb) => Promise<T>): Promise<T> => {
    const batchSnapshot = cloneRecordMap(createdBatches);
    const recipientSnapshot = structuredClone(finalRecipients) as Record<string, unknown>[];
    const invitationSnapshot = structuredClone(invitations) as InvitationState[];
    const tokenSnapshot = structuredClone(catalogTokens) as CatalogTokenState[];
    try {
      return await fn(db);
    } catch (error) {
      for (const key of Object.keys(createdBatches)) delete createdBatches[key];
      Object.assign(createdBatches, batchSnapshot);
      finalRecipients.splice(0, finalRecipients.length, ...recipientSnapshot);
      invitations.splice(0, invitations.length, ...invitationSnapshot);
      catalogTokens.splice(0, catalogTokens.length, ...tokenSnapshot);
      throw error;
    }
  };

  const db: StaffInviteDb = {
    partner: {
      findUnique: vi.fn(async () => (options.partnerFound === false ? null : { id: PARTNER_ID })),
    },
    mycoEmployee: {
      findMany: vi.fn(async () => structuredClone(reviewers) as never),
    },
    staffReviewInviteBatch: {
      create: vi.fn(async (...args: unknown[]) => {
        record("staffReviewInviteBatch.create", args);
        const data = (args[0] as { data: Record<string, unknown> }).data;
        const draftCreate = data.draftRecipients as { create: Record<string, unknown>[] };
        const batch = {
          ...data,
          draftRecipients: draftCreate.create.map((draft) => ({ ...draft, batchId: data.id })),
        };
        createdBatches[String(data.id)] = batch;
        return batch as never;
      }),
      findFirst: vi.fn(async (...args: unknown[]) => {
        record("staffReviewInviteBatch.findFirst", args);
        const where = (args[0] as { where: { id: string; partnerId?: string } }).where;
        const batch = createdBatches[where.id];
        if (!batch || (where.partnerId && batch.partnerId !== where.partnerId)) return null;
        return batch as never;
      }),
      update: vi.fn(async (...args: unknown[]) => {
        record("staffReviewInviteBatch.update", args);
        const where = (args[0] as { where: { id: string }; data: Record<string, unknown> }).where;
        const data = (args[0] as { data: Record<string, unknown> }).data;
        const updated = { ...createdBatches[where.id], ...data };
        createdBatches[where.id] = updated;
        return updated as never;
      }),
    },
    staffReviewInviteBatchDraftRecipient: {
      findMany: vi.fn(async () => []),
    },
    staffReviewInviteBatchRecipient: {
      create: vi.fn(async (...args: unknown[]) => {
        record("staffReviewInviteBatchRecipient.create", args);
        recipientCreateCount += 1;
        if (options.failRecipientCreateAt === recipientCreateCount) {
          throw new Error("recipient write failed");
        }
        const data = (args[0] as { data: Record<string, unknown> }).data;
        const created = { id: `recipient_${finalRecipients.length + 1}`, ...data };
        finalRecipients.push(created);
        return created as never;
      }),
      findMany: vi.fn(async (...args: unknown[]) => {
        record("staffReviewInviteBatchRecipient.findMany", args);
        const where = (args[0] as { where?: unknown }).where;
        return finalRecipients.filter((recipient) => matchesRecipientWhere(recipient, where)) as never;
      }),
      updateMany: vi.fn(async (...args: unknown[]) => {
        record("staffReviewInviteBatchRecipient.updateMany", args);
        const where = (args[0] as { where?: unknown; data: Record<string, unknown> }).where;
        const data = (args[0] as { data: Record<string, unknown> }).data;
        let count = 0;
        for (const recipient of finalRecipients) {
          if (matchesRecipientWhere(recipient, where)) {
            Object.assign(recipient, data);
            count += 1;
          }
        }
        return { count };
      }),
    },
    staffReviewInvitation: {
      findMany: vi.fn(async (...args: unknown[]) => {
        record("staffReviewInvitation.findMany", args);
        const where = (args[0] as { where?: unknown }).where;
        return invitations.filter((invitation) => matchesInvitationWhere(invitation, where)) as never;
      }),
      findFirst: vi.fn(async (...args: unknown[]) => {
        record("staffReviewInvitation.findFirst", args);
        const where = (args[0] as { where?: unknown }).where;
        return (invitations.find((invitation) => matchesInvitationWhere(invitation, where)) as never) ?? null;
      }),
      create: vi.fn(async (...args: unknown[]) => {
        record("staffReviewInvitation.create", args);
        const data = (args[0] as { data: Record<string, unknown> }).data;
        const created = {
          id: `invite_${String(data.employeeId)}`,
          partnerId: String(data.partnerId),
          employeeId: String(data.employeeId),
          displayName: String(data.displayName),
          emailNormalized: String(data.emailNormalized),
          status: String(data.status),
          issuedBy: String(data.issuedBy),
          issuedAt: data.issuedAt instanceof Date ? data.issuedAt : NOW,
          expiresAt: data.expiresAt instanceof Date ? data.expiresAt : NOW,
          revokedAt: null,
          revokedBy: null,
          revocationReason: null,
        };
        invitations.push(created);
        return created as never;
      }),
      update: vi.fn(async (...args: unknown[]) => {
        record("staffReviewInvitation.update", args);
        const where = (args[0] as { where: { id: string }; data: Partial<InvitationState> }).where;
        const data = (args[0] as { data: Partial<InvitationState> }).data;
        const invitation = invitations.find((item) => item.id === where.id);
        if (!invitation) throw new Error("invitation missing in fake db");
        Object.assign(invitation, data);
        return invitation as never;
      }),
      updateMany: vi.fn(async (...args: unknown[]) => {
        record("staffReviewInvitation.updateMany", args);
        const where = (args[0] as { where?: unknown; data: Partial<InvitationState> }).where;
        const data = (args[0] as { data: Partial<InvitationState> }).data;
        let count = 0;
        for (const invitation of invitations) {
          if (matchesInvitationWhere(invitation, where)) {
            Object.assign(invitation, data);
            count += 1;
          }
        }
        return { count };
      }),
    },
    catalogAccessToken: {
      updateMany: vi.fn(async (...args: unknown[]) => {
        record("catalogAccessToken.updateMany", args);
        const where = (args[0] as { where?: Record<string, unknown>; data: Partial<CatalogTokenState> }).where ?? {};
        const data = (args[0] as { data: Partial<CatalogTokenState> }).data;
        let count = 0;
        for (const token of catalogTokens) {
          if (
            token.purpose === where.purpose &&
            token.partnerId === where.partnerId &&
            token.status === where.status
          ) {
            Object.assign(token, data);
            count += 1;
          }
        }
        return { count };
      }),
      create: vi.fn(async (...args: unknown[]) => {
        record("catalogAccessToken.create", args);
        const data = (args[0] as { data: Record<string, unknown> }).data;
        const created = {
          id: `staff_link_${catalogTokens.length + 1}`,
          purpose: String(data.purpose),
          partnerId: String(data.partnerId),
          status: String(data.status),
          revokedAt: null,
        };
        catalogTokens.push(created);
        return {
          id: created.id,
          tokenHash: data.tokenHash,
          issuedAt: NOW,
          expiresAt: data.expiresAt,
        } as never;
      }),
    },
    $executeRawUnsafe: vi.fn(async (...args: unknown[]) => {
      record("$executeRawUnsafe", args);
      return 1;
    }),
    $transaction: transaction,
  };

  return { db, calls, createdBatches, finalRecipients, invitations, catalogTokens };
}

async function prepareDefaultBatch(db: StaffInviteDb) {
  return prepareStaffReviewInviteBatch(
    {
      partnerId: PARTNER_ID,
      renderedBy: ADMIN_EMAIL,
      sourceIssueId: "KEWL-3385",
      sourceCommentId: "57ec73cc-3e9e-42ef-a61b-a088a90fe090",
      templates: baseTemplates(),
      provider: "resend",
      providerCredentialFingerprint: "resend-key-fp",
      fromAddress: "Tripdar <staff@example.test>",
      requestedExpirySeconds: 86_400,
      sealKey: SEAL_KEY,
    },
    db
  );
}

async function approveDefaultBatch(db: StaffInviteDb, batchId: string, interactionId = "paperclip-interaction-1") {
  return approveStaffReviewInviteBatch(
    {
      partnerId: PARTNER_ID,
      batchId,
      approvedInteractionId: interactionId,
      approvedBy: ADMIN_EMAIL,
      sourceEvidence: {
        sourceIssueId: "KEWL-3385",
        sourceCommentId: "57ec73cc-3e9e-42ef-a61b-a088a90fe090",
      },
      providerCredentialFingerprint: "resend-key-fp",
      sealKey: SEAL_KEY,
      now: NOW,
    },
    db
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_URL = "https://tripdar.test";
});

describe("staff review invite batches", () => {
  it("prepare persists only encrypted draft material and does not mint, revoke, or expose credential fields", async () => {
    const { db, calls, createdBatches } = createDb();

    const prepared = await prepareDefaultBatch(db);

    expect(calls.map((call) => call.method)).toEqual(["staffReviewInviteBatch.create"]);
    expect(db.staffReviewInvitation.create).not.toHaveBeenCalled();
    expect(db.staffReviewInvitation.updateMany).not.toHaveBeenCalled();
    expect(db.staffReviewInviteBatchRecipient.updateMany).not.toHaveBeenCalled();
    expect(JSON.stringify(prepared)).not.toContain("/review/myco/");
    expect(JSON.stringify(prepared)).not.toContain("tokenHash");
    expect(JSON.stringify(prepared)).not.toContain("invitationId");

    const batch = createdBatches[prepared.batchId];
    expect(batch.status).toBe("draft");
    expect(batch.batchDigest).toBeNull();
    expect(batch.approvalDigest).toBe(prepared.approvalDigest);
    expect(JSON.stringify(batch)).not.toContain("/review/myco/");
    expect(JSON.stringify(batch)).not.toContain("providerIdempotencyKey");
  });

  it("approval locks the draft, retires B tokens, mints one canonical staff link, and reports accurate metadata", async () => {
    const { db, calls } = createDb();
    const prepared = await prepareDefaultBatch(db);
    calls.length = 0;

    const approved = await approveDefaultBatch(db, prepared.batchId);

    const sequence = calls.map((call) => call.method);
    expect(sequence[0]).toBe("$executeRawUnsafe");
    expect(sequence.filter((method) => method === "$executeRawUnsafe")).toHaveLength(2);
    expect(sequence.indexOf("$executeRawUnsafe", 1)).toBeLessThan(sequence.indexOf("staffReviewInvitation.findMany"));
    expect(sequence.indexOf("$executeRawUnsafe", 1)).toBeLessThan(sequence.indexOf("catalogAccessToken.updateMany"));
    expect(sequence.indexOf("$executeRawUnsafe", 1)).toBeLessThan(sequence.indexOf("catalogAccessToken.create"));
    expect(sequence).toContain("staffReviewInvitation.updateMany");
    expect(sequence).toContain("catalogAccessToken.updateMany");
    expect(sequence.filter((method) => method === "catalogAccessToken.create")).toHaveLength(1);
    expect(sequence.filter((method) => method === "staffReviewInvitation.create")).toHaveLength(0);
    expect(sequence.filter((method) => method === "staffReviewInviteBatchRecipient.create")).toHaveLength(2);
    expect(approved.status).toBe("approved");
    expect(approved.invitationCount).toBe(0);
    expect(approved.staffReviewInvitationCount).toBe(0);
    expect(approved.sharedCatalogAccessTokenCount).toBe(1);
    expect(approved.recipientEvidenceCount).toBe(2);
    expect(approved.recipientCount).toBe(2);
    expect(approved.revokedPriorInvitationCount).toBe(1);

    const linkCreate = calls.find((call) => call.method === "catalogAccessToken.create");
    const linkData = (linkCreate?.args[0] as { data: { expiresAt: Date; tokenHash: string } }).data;
    expect(linkData.expiresAt).toEqual(new Date("2026-08-10T17:45:00.000Z"));
    expect(linkData.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(linkData.tokenHash).not.toContain("/review/myco/");

    const recipientCreates = calls.filter((call) => call.method === "staffReviewInviteBatchRecipient.create");
    const catalogAccessTokenIds = new Set<string>();
    for (const create of recipientCreates) {
      const data = (create.args[0] as { data: { invitationId: string | null; catalogAccessTokenId: string } }).data;
      expect(data.invitationId).toBeNull();
      catalogAccessTokenIds.add(data.catalogAccessTokenId);
    }
    expect([...catalogAccessTokenIds]).toHaveLength(1);
  });

  it("same-interaction approval retry returns the committed metadata without minting, revoking, or writing again", async () => {
    const { db, calls } = createDb();
    const prepared = await prepareDefaultBatch(db);
    const first = await approveDefaultBatch(db, prepared.batchId);
    calls.length = 0;

    const retry = await approveDefaultBatch(db, prepared.batchId);

    expect(retry).toEqual(first);
    expect(calls.map((call) => call.method)).toEqual([
      "$executeRawUnsafe",
      "staffReviewInviteBatch.findFirst",
      "staffReviewInviteBatchRecipient.findMany",
      "staffReviewInvitation.findMany",
    ]);
    expect(db.catalogAccessToken.updateMany).toHaveBeenCalledTimes(1);
    expect(db.catalogAccessToken.create).toHaveBeenCalledTimes(1);
    expect(db.staffReviewInvitation.updateMany).toHaveBeenCalledTimes(1);
    expect(db.staffReviewInviteBatchRecipient.create).toHaveBeenCalledTimes(2);
    expect(db.staffReviewInviteBatchRecipient.updateMany).toHaveBeenCalledTimes(1);
    expect(db.staffReviewInviteBatch.update).toHaveBeenCalledTimes(1);
  });

  it("different approval interaction is refused after commit without extra mutation", async () => {
    const { db, calls } = createDb();
    const prepared = await prepareDefaultBatch(db);
    await approveDefaultBatch(db, prepared.batchId);
    calls.length = 0;

    await expect(approveDefaultBatch(db, prepared.batchId, "paperclip-interaction-2")).rejects.toMatchObject({
      code: "batch_not_draft",
      status: 409,
    });

    expect(calls.map((call) => call.method)).toEqual(["$executeRawUnsafe", "staffReviewInviteBatch.findFirst"]);
    expect(db.catalogAccessToken.create).toHaveBeenCalledTimes(1);
    expect(db.staffReviewInviteBatchRecipient.create).toHaveBeenCalledTimes(2);
    expect(db.staffReviewInviteBatch.update).toHaveBeenCalledTimes(1);
  });

  it("rolls back approval evidence when a recipient write fails", async () => {
    const { db, createdBatches, finalRecipients, catalogTokens, invitations } = createDb({
      failRecipientCreateAt: 2,
    });
    const prepared = await prepareDefaultBatch(db);

    await expect(approveDefaultBatch(db, prepared.batchId)).rejects.toThrow("recipient write failed");

    expect(createdBatches[prepared.batchId].status).toBe("draft");
    expect(finalRecipients).toHaveLength(0);
    expect(catalogTokens.filter((token) => token.status === "active")).toHaveLength(1);
    expect(invitations.filter((invitation) => invitation.status === "revoked")).toHaveLength(0);
    expect(db.staffReviewInviteBatch.update).not.toHaveBeenCalled();
  });

  it("explicit revoke is super-admin only, idempotent for already revoked rows, and invalidates unsent final recipients", async () => {
    const { db, finalRecipients } = createDb({
      invitations: [pendingInvitation()],
      activeCatalogTokens: [],
    });
    finalRecipients.push({ id: "recipient_1", invitationId: "invite_1", sendStatus: "approved", sentAt: null });

    const result = await revokeStaffReviewInvitation(
      {
        session: superAdminSession(),
        partnerId: PARTNER_ID,
        invitationId: "invite_1",
        reason: "Jon asked to revoke this pending staff invite.",
        now: NOW,
      },
      db
    );

    expect(result).toEqual({
      invitationId: "invite_1",
      status: "revoked",
      alreadyRevoked: false,
      invalidatedRecipientCount: 1,
    });
    expect(db.staffReviewInvitation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "invite_1" },
        data: expect.objectContaining({
          status: "revoked",
          revokedBy: ADMIN_EMAIL,
          revocationReason: "Jon asked to revoke this pending staff invite.",
        }),
      })
    );
    expect(db.staffReviewInviteBatchRecipient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ invitationId: "invite_1", sentAt: null }),
        data: expect.objectContaining({ validationFailureCode: "revoked" }),
      })
    );
  });

  it("refuses non-super-admin revoke without mutation", async () => {
    const { db } = createDb({ invitations: [pendingInvitation()], activeCatalogTokens: [] });

    await expect(
      revokeStaffReviewInvitation(
        {
          session: {
            ...superAdminSession(),
            actualUser: { email: "ops@example.com", role: "partner_admin" },
          },
          partnerId: PARTNER_ID,
          invitationId: "invite_1",
          reason: "No longer needed.",
          now: NOW,
        },
        db
      )
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    expect(db.staffReviewInvitation.update).not.toHaveBeenCalled();
    expect(db.staffReviewInviteBatchRecipient.updateMany).not.toHaveBeenCalled();
  });

  it("refuses View-as revoke without mutation", async () => {
    const { db } = createDb({ invitations: [pendingInvitation()], activeCatalogTokens: [] });

    await expect(
      revokeStaffReviewInvitation(
        {
          session: {
            ...superAdminSession(),
            viewAs: {
              id: "target-user",
              email: "target@example.test",
              name: "Target User",
              role: "partner_admin",
              partnerName: "Target Partner",
            },
          },
          partnerId: PARTNER_ID,
          invitationId: "invite_1",
          reason: "No longer needed.",
          now: NOW,
        },
        db
      )
    ).rejects.toMatchObject({ code: "view_as_forbidden", status: 403 });
    expect(db.staffReviewInvitation.update).not.toHaveBeenCalled();
    expect(db.staffReviewInviteBatchRecipient.updateMany).not.toHaveBeenCalled();
  });

  it("preserves wrong-partner and not-found revoke parity as 404 without mutation", async () => {
    const { db } = createDb({
      invitations: [pendingInvitation({ partnerId: OTHER_PARTNER_ID })],
      activeCatalogTokens: [],
    });

    await expect(
      revokeStaffReviewInvitation(
        {
          session: superAdminSession(),
          partnerId: PARTNER_ID,
          invitationId: "invite_1",
          reason: "No longer needed.",
          now: NOW,
        },
        db
      )
    ).rejects.toMatchObject({ code: "invitation_not_found", status: 404 });
    expect(db.staffReviewInvitation.update).not.toHaveBeenCalled();
    expect(db.staffReviewInviteBatchRecipient.updateMany).not.toHaveBeenCalled();
  });

  it("preserves already-revoked audit fields and does not invalidate recipients again", async () => {
    const revokedAt = new Date("2026-08-06T00:00:00.000Z");
    const { db, invitations } = createDb({
      invitations: [
        pendingInvitation({
          status: "revoked",
          revokedAt,
          revokedBy: "previous-admin@example.test",
          revocationReason: "original reason",
        }),
      ],
      activeCatalogTokens: [],
    });

    const result = await revokeStaffReviewInvitation(
      {
        session: superAdminSession(),
        partnerId: PARTNER_ID,
        invitationId: "invite_1",
        reason: "new reason should not replace old reason",
        now: NOW,
      },
      db
    );

    expect(result).toEqual({
      invitationId: "invite_1",
      status: "revoked",
      alreadyRevoked: true,
      invalidatedRecipientCount: 0,
    });
    expect(invitations[0].revokedAt).toEqual(revokedAt);
    expect(invitations[0].revokedBy).toBe("previous-admin@example.test");
    expect(invitations[0].revocationReason).toBe("original reason");
    expect(db.staffReviewInvitation.update).not.toHaveBeenCalled();
    expect(db.staffReviewInviteBatchRecipient.updateMany).not.toHaveBeenCalled();
  });

  it("refuses confirmed and expired-pending invitations with 409 and no mutation", async () => {
    for (const invitation of [
      pendingInvitation({ status: "confirmed" }),
      pendingInvitation({ expiresAt: new Date("2026-08-08T00:00:00.000Z") }),
    ]) {
      const { db } = createDb({ invitations: [invitation], activeCatalogTokens: [] });

      await expect(
        revokeStaffReviewInvitation(
          {
            session: superAdminSession(),
            partnerId: PARTNER_ID,
            invitationId: "invite_1",
            reason: "No longer needed.",
            now: NOW,
          },
          db
        )
      ).rejects.toMatchObject({ code: "invitation_not_pending", status: 409 });
      expect(db.staffReviewInvitation.update).not.toHaveBeenCalled();
      expect(db.staffReviewInviteBatchRecipient.updateMany).not.toHaveBeenCalled();
    }
  });

  it("maps missing partner to 404 parity during prepare without credential mutation", async () => {
    const { db } = createDb({ partnerFound: false, invitations: [], activeCatalogTokens: [] });

    await expect(prepareDefaultBatch(db)).rejects.toMatchObject({ code: "partner_not_found", status: 404 });
    expect(db.staffReviewInvitation.create).not.toHaveBeenCalled();
    expect(db.catalogAccessToken.create).not.toHaveBeenCalled();
    expect(db.staffReviewInviteBatch.create).not.toHaveBeenCalled();
  });

  it("never exposes provider send behavior from the service layer", async () => {
    const source = await import("./staffReviewInviteBatches");

    expect(Object.keys(source)).not.toContain("sendEmail");
    expect(Object.keys(source)).not.toContain("sendStaffReviewInviteBatch");
  });

  it("throws StaffInviteError instances for callers to map without sending", async () => {
    const error = new StaffInviteError("invitation_not_pending", "Invitation is not pending", 409);

    expect(error.code).toBe("invitation_not_pending");
    expect(error.status).toBe(409);
  });
});
