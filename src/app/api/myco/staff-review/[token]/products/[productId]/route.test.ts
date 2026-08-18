import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CATALOG_FIELD_SPECS } from "@/domain/myco/catalogFieldSpec";
import { createPrismaMock } from "@/test/prismaMock";

const requireReviewerMock = vi.hoisted(() => vi.fn());

const txMock = vi.hoisted(() => ({
  catalogFieldChange: { createMany: vi.fn() },
  catalogFieldVerificationState: { upsert: vi.fn() },
  staffReviewerIdentityAlias: { findMany: vi.fn() },
  storeProductCatalog: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
}));

const prismaMock = vi.hoisted(() => ({
  catalogFieldVerificationRule: { findMany: vi.fn(), createMany: vi.fn() },
  staffReviewerIdentityAlias: { findMany: vi.fn() },
  storeProductCatalog: { findFirst: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock(prismaMock) };
});

vi.mock("@/domain/myco/staffReviewAuth", () => ({
  REVIEWER_SESSION_COOKIE: "staff_review_session",
  requireReviewer: requireReviewerMock,
}));

let POST: typeof import("./route").POST;

beforeAll(async () => {
  ({ POST } = await import("./route"));
});

function specRuleRows() {
  return CATALOG_FIELD_SPECS.map((spec) => ({
    partnerId: null,
    active: true,
    ...spec,
  }));
}

function activeColumnRule() {
  return {
    fieldName: "unsafeActiveProjection",
    tier: "A",
    requiredConfirmations: 1,
    requiresDistinctReviewers: false,
    gateRequired: true,
    readinessKey: null,
    catalogColumn: "active",
    label: "Unsafe active projection",
    helpText: null,
    inputType: "text",
    allowsConfirmedAbsent: false,
    gateSatisfyingValues: [],
    sortOrder: 999,
  };
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "catalog-1",
    partnerId: "partner-1",
    archivedAt: null,
    productName: "Legacy Product",
    brand: "Legacy Brand",
    brandRef: null,
    format: "gummy",
    sku: "sku-1",
    active: false,
    activeCompound: "psilocybin",
    materialMassBasis: "mushroom_material_mg_per_unit",
    productUnitMg: 100,
    unitsPerPack: 10,
    totalDoseMg: 1000,
    onsetMinutes: 30,
    durationMinutes: 240,
    brandMicroUnits: null,
    brandMiniUnits: null,
    brandMacroUnits: null,
    brandDoseTiers: null,
    photoUrl: null,
    researchOnly: false,
    listingOverrideAt: null,
    listingOverrideBy: null,
    listingOverrideReason: null,
    photos: [],
    vibeProfile: null,
    strengthOffset: null,
    catalogFieldChanges: [],
    ...overrides,
  };
}

function postRequest(body: Record<string, unknown>) {
  return new NextRequest(
    "https://tripdar.test/api/myco/staff-review/raw-token/products/catalog-1",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

async function post(body: Record<string, unknown>) {
  return POST(postRequest(body), {
    params: Promise.resolve({ token: "raw-token", productId: "catalog-1" }),
  });
}

describe("staff-review product submit projection hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    requireReviewerMock.mockResolvedValue({
      ok: true,
      tokenId: "token-row-1",
      partnerId: "partner-1",
      employeeId: "employee-1",
      employeeName: "Avery",
    });
    prismaMock.catalogFieldVerificationRule.createMany.mockResolvedValue({ count: 0 });
    prismaMock.storeProductCatalog.findFirst.mockResolvedValue(product());
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(
        createPrismaMock(
          {
            catalogFieldChange: txMock.catalogFieldChange,
            catalogFieldVerificationState: txMock.catalogFieldVerificationState,
            staffReviewerIdentityAlias: txMock.staffReviewerIdentityAlias,
            storeProductCatalog: txMock.storeProductCatalog,
          },
          "tx"
        )
      )
    );
    prismaMock.staffReviewerIdentityAlias.findMany.mockResolvedValue([]);
    txMock.staffReviewerIdentityAlias.findMany.mockResolvedValue([]);
    txMock.catalogFieldChange.createMany.mockResolvedValue({ count: 1 });
    txMock.catalogFieldVerificationState.upsert.mockResolvedValue({});
    txMock.storeProductCatalog.update.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips and logs a confirmed rule row that targets StoreProductCatalog.active", async () => {
    const unsafeRule = activeColumnRule();
    prismaMock.catalogFieldVerificationRule.findMany
      .mockResolvedValueOnce([...specRuleRows(), unsafeRule])
      .mockResolvedValueOnce([unsafeRule]);
    txMock.storeProductCatalog.findUniqueOrThrow.mockResolvedValue(
      product({
        catalogFieldChanges: [
          {
            id: "change-1",
            fieldName: unsafeRule.fieldName,
            submittedValue: true,
            actorType: "staff",
            actorIdentity: "employee-1",
            source: "personal-knowledge",
            disposition: "accepted",
            createdAt: new Date("2026-07-31T16:00:00Z"),
          },
        ],
      })
    );

    const response = await post({
      answers: [
        {
          fieldName: unsafeRule.fieldName,
          action: "fill",
          value: true,
          source: "personal-knowledge",
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(txMock.catalogFieldVerificationState.upsert).toHaveBeenCalled();
    expect(txMock.storeProductCatalog.update).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      "[staff-review] Skipping disallowed catalog column projection",
      expect.objectContaining({
        catalogItemId: "catalog-1",
        fieldName: unsafeRule.fieldName,
        catalogColumn: "active",
        source: "staffReviewProductSubmit",
      })
    );
  });

  it("keeps totalDoseMg numeric when a second reviewer confirms a full-package dose dispute", async () => {
    const existingConfirmation = {
      id: "change-employee-1",
      fieldName: "totalDoseMg",
      submittedValue: 20,
      actorType: "staff",
      actorIdentity: "employee-1",
      source: "packaging",
      disposition: "accepted",
      createdAt: new Date("2026-08-01T00:00:00Z"),
    };
    const secondConfirmation = {
      id: "change-employee-2",
      fieldName: "totalDoseMg",
      submittedValue: 20,
      actorType: "staff",
      actorIdentity: "employee-2",
      source: "packaging",
      disposition: "accepted",
      createdAt: new Date("2026-08-01T00:01:00Z"),
    };
    prismaMock.catalogFieldVerificationRule.findMany.mockResolvedValue(specRuleRows());
    requireReviewerMock.mockResolvedValue({
      ok: true,
      tokenId: "token-row-1",
      partnerId: "partner-1",
      employeeId: "employee-2",
      employeeName: "Blake",
    });
    prismaMock.storeProductCatalog.findFirst.mockResolvedValue(
      product({
        unitMaterialMassMg: 1,
        unitsPerPack: 20,
        totalDoseMg: 20,
        materialMassBasis: "fruiting_body",
        catalogFieldChanges: [existingConfirmation],
      })
    );
    txMock.storeProductCatalog.findUniqueOrThrow.mockResolvedValue(
      product({
        unitMaterialMassMg: 1,
        unitsPerPack: 20,
        totalDoseMg: 20,
        materialMassBasis: "fruiting_body",
        catalogFieldChanges: [existingConfirmation, secondConfirmation],
      })
    );

    const response = await post({
      answers: [{ fieldName: "totalDoseMg", action: "confirm", source: "packaging" }],
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.fieldStates.totalDoseMg).toMatchObject({
      state: "confirmed",
      confirmationsCount: 2,
      requiredConfirmations: 2,
    });
    expect(txMock.catalogFieldChange.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          catalogItemId: "catalog-1",
          fieldName: "totalDoseMg",
          previousValue: 20,
          submittedValue: 20,
        }),
      ],
    });
    expect(txMock.catalogFieldVerificationState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          state: "confirmed",
          confirmedValue: 20,
        }),
      })
    );
    expect(txMock.storeProductCatalog.update).toHaveBeenCalledWith({
      where: { id: "catalog-1" },
      data: { totalDoseMg: 20 },
    });
  });
});
