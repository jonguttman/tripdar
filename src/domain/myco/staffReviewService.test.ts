import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CATALOG_FIELD_SPECS } from "./catalogFieldSpec";

const txMock = vi.hoisted(() => ({
  catalogFieldVerificationState: { upsert: vi.fn() },
  storeProductCatalog: { update: vi.fn() },
}));

const prismaMock = vi.hoisted(() => ({
  catalogFieldVerificationRule: { findMany: vi.fn(), createMany: vi.fn() },
  storeProductCatalog: { findUniqueOrThrow: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock(prismaMock) };
});

let recomputeCatalogItemProjection: typeof import("./staffReviewService").recomputeCatalogItemProjection;

beforeAll(async () => {
  ({ recomputeCatalogItemProjection } = await import("./staffReviewService"));
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

describe("staff-review catalog projection hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    prismaMock.catalogFieldVerificationRule.createMany.mockResolvedValue({ count: 0 });
    prismaMock.$transaction.mockImplementation(async (callback) => callback(txMock));
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
    prismaMock.storeProductCatalog.findUniqueOrThrow.mockResolvedValue({
      id: "catalog-1",
      active: false,
      catalogFieldChanges: [
        {
          fieldName: unsafeRule.fieldName,
          submittedValue: true,
          actorType: "staff",
          actorIdentity: "employee-1",
          source: "personal-knowledge",
          disposition: "accepted",
          createdAt: new Date("2026-07-31T16:00:00Z"),
        },
      ],
      fieldVerificationStates: [],
    });

    const result = await recomputeCatalogItemProjection("catalog-1");

    expect(result.columnsChanged).toEqual([]);
    expect(txMock.storeProductCatalog.update).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      "[staff-review] Skipping disallowed catalog column projection",
      expect.objectContaining({
        catalogItemId: "catalog-1",
        fieldName: unsafeRule.fieldName,
        catalogColumn: "active",
        source: "recomputeCatalogItemProjection",
      })
    );
  });
});
