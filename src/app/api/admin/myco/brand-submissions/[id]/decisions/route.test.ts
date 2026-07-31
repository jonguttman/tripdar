import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  brandSubmission: { findUnique: vi.fn(), update: vi.fn() },
  catalogFieldChange: { findFirst: vi.fn(), update: vi.fn() },
  storeProductCatalog: { update: vi.fn() },
  catalogFieldVerificationState: { findUnique: vi.fn(), update: vi.fn() },
  productPhoto: { findFirst: vi.fn(), update: vi.fn() },
  brand: { update: vi.fn() },
  $transaction: vi.fn(),
}));

const getServerSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@/domain/auth/config", () => ({ authOptions: {} }));

import { POST } from "./route";

const ADMIN = "admin@test.dev";

function request(body: unknown) {
  return new Request("http://localhost:3000/api/admin/myco/brand-submissions/submission-1/decisions", {
    method: "POST",
    body: JSON.stringify(body),
  }) as never;
}

function params(id = "submission-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSessionMock.mockResolvedValue({ user: { email: ADMIN } });
  prismaMock.$transaction.mockImplementation(async (fn: never) =>
    (fn as unknown as (tx: typeof prismaMock) => unknown)(prismaMock),
  );
  prismaMock.brandSubmission.findUnique.mockResolvedValue({
    id: "submission-1",
    brandId: "brand-1",
    status: "pending",
    reviewedAt: null,
    reviewedBy: null,
    payload: { brandFields: {}, brandAssets: {} },
    brand: { id: "brand-1", socialHandles: {} },
    fieldChanges: [
      { id: "change-accept", disposition: "pending" },
      { id: "change-reject", disposition: "pending" },
    ],
    photos: [{ id: "photo-1", status: "pending" }],
  });
  prismaMock.catalogFieldVerificationState.findUnique.mockResolvedValue(null);
});

describe("brand submission review decisions", () => {
  it("refuses unauthenticated access", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const response = await POST(request({ fieldDecisions: [] }), params());

    expect(response.status).toBe(401);
  });

  it("accepts one field and rejects another without all-or-nothing behavior", async () => {
    prismaMock.catalogFieldChange.findFirst
      .mockResolvedValueOnce({
        id: "change-accept",
        catalogItemId: "item-1",
        fieldName: "productUnitMg",
        submittedValue: 125,
        actorType: "brand",
        source: "brand-provided",
        disposition: "pending",
      })
      .mockResolvedValueOnce({
        id: "change-reject",
        catalogItemId: "item-1",
        fieldName: "unitsPerPack",
        submittedValue: 30,
        actorType: "brand",
        source: "brand-provided",
        disposition: "pending",
      });

    const response = await POST(
      request({
        fieldDecisions: [
          { id: "change-accept", decision: "accepted" },
          { id: "change-reject", decision: "rejected", reason: "package disagrees" },
        ],
      }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.catalogFieldChange.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "change-accept" },
        data: expect.objectContaining({ disposition: "accepted", dispositionBy: ADMIN }),
      }),
    );
    expect(prismaMock.catalogFieldChange.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "change-reject" },
        data: expect.objectContaining({
          disposition: "rejected",
          dispositionBy: ADMIN,
          dispositionReason: "package disagrees",
        }),
      }),
    );
    expect(prismaMock.storeProductCatalog.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.storeProductCatalog.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { productUnitMg: 125 },
    });
  });

  it("moves an accepted brand change on a confirmed field to needs_re_review", async () => {
    prismaMock.brandSubmission.findUnique.mockResolvedValue({
      id: "submission-1",
      brandId: "brand-1",
      status: "pending",
      reviewedAt: null,
      reviewedBy: null,
      payload: { brandFields: {}, brandAssets: {} },
      brand: { id: "brand-1", socialHandles: {} },
      fieldChanges: [{ id: "change-accept", disposition: "pending" }],
      photos: [],
    });
    prismaMock.catalogFieldChange.findFirst.mockResolvedValue({
      id: "change-accept",
      catalogItemId: "item-1",
      fieldName: "productUnitMg",
      submittedValue: 125,
      actorType: "brand",
      source: "brand-provided",
      disposition: "pending",
    });
    prismaMock.catalogFieldVerificationState.findUnique.mockResolvedValue({
      id: "state-1",
      state: "confirmed",
      requiredConfirmations: 2,
    });

    const response = await POST(
      request({ fieldDecisions: [{ id: "change-accept", decision: "accepted" }] }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.catalogFieldVerificationState.update).toHaveBeenCalledWith({
      where: { id: "state-1" },
      data: expect.objectContaining({
        state: "needs_re_review",
        confirmationsCount: 0,
        confirmedValue: 125,
        lastAcceptedChangeId: "change-accept",
      }),
    });
  });

  it("accepts and rejects product photos independently", async () => {
    prismaMock.brandSubmission.findUnique.mockResolvedValue({
      id: "submission-1",
      brandId: "brand-1",
      status: "pending",
      reviewedAt: null,
      reviewedBy: null,
      payload: { brandFields: {}, brandAssets: {} },
      brand: { id: "brand-1", socialHandles: {} },
      fieldChanges: [],
      photos: [{ id: "photo-1", status: "pending" }, { id: "photo-2", status: "pending" }],
    });
    prismaMock.productPhoto.findFirst
      .mockResolvedValueOnce({ id: "photo-1", status: "pending" })
      .mockResolvedValueOnce({ id: "photo-2", status: "pending" });

    const response = await POST(
      request({
        photoDecisions: [
          { id: "photo-1", decision: "accepted" },
          { id: "photo-2", decision: "rejected", reason: "wrong package" },
        ],
      }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.productPhoto.update).toHaveBeenCalledWith({
      where: { id: "photo-1" },
      data: expect.objectContaining({ status: "approved", approvedBy: ADMIN }),
    });
    expect(prismaMock.productPhoto.update).toHaveBeenCalledWith({
      where: { id: "photo-2" },
      data: expect.objectContaining({
        status: "rejected",
        rejectedBy: ADMIN,
        rejectionReason: "wrong package",
      }),
    });
  });
});
