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

let appendFullPackageDoseDisputeChanges: typeof import("./staffReviewService").appendFullPackageDoseDisputeChanges;
let computeFieldStates: typeof import("./staffReviewService").computeFieldStates;
let detectFullPackageDoseDispute: typeof import("./staffReviewService").detectFullPackageDoseDispute;
let fullPackageDoseDisputeReviewContext: typeof import("./staffReviewService").fullPackageDoseDisputeReviewContext;
let recomputeCatalogItemProjection: typeof import("./staffReviewService").recomputeCatalogItemProjection;

beforeAll(async () => {
  ({
    appendFullPackageDoseDisputeChanges,
    computeFieldStates,
    detectFullPackageDoseDispute,
    fullPackageDoseDisputeReviewContext,
    recomputeCatalogItemProjection,
  } = await import("./staffReviewService"));
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

describe("full-package dose dispute detection", () => {
  it("flags a full package that cannot reach the lowest canonical dose", () => {
    const dispute = detectFullPackageDoseDispute({
      activeCompound: "psilocybin",
      unitMaterialMassMg: 1,
      unitsPerPack: 20,
      materialMassBasis: "fruiting_body",
    });

    expect(dispute).toMatchObject({
      fieldName: "totalDoseMg",
      declaredPackageMaterialMassMg: 20,
      minimumDoseMaterialMassMg: 50,
    });
    expect(dispute?.declaredValue).toContain("Declared full package: 20 mg");
    expect(dispute?.requiredValue).toContain("Lowest ladder dose needs: 50 mg");
  });

  it("does not flag the ordinary case where only higher dose levels exceed one pack", () => {
    expect(
      detectFullPackageDoseDispute({
        activeCompound: "psilocybin",
        unitMaterialMassMg: 100,
        unitsPerPack: 2,
        materialMassBasis: "mushroom_material",
      })
    ).toBeNull();
  });

  it("does not model incompatible extract-basis rows as package-size disputes", () => {
    expect(
      detectFullPackageDoseDispute({
        activeCompound: "psilocybin",
        unitMaterialMassMg: 1,
        unitsPerPack: 20,
        materialMassBasis: "whole_fruit_body_extract",
      })
    ).toBeNull();
  });

  it("routes the contradiction through the existing disputed totalDoseMg field state", () => {
    const rules = specRuleRows();
    const changes = appendFullPackageDoseDisputeChanges(
      {
        activeCompound: "psilocybin",
        unitMaterialMassMg: 1,
        unitsPerPack: 20,
        materialMassBasis: "fruiting_body",
      },
      []
    );

    const state = computeFieldStates(rules, changes).totalDoseMg;

    expect(state.state).toBe("disputed");
    expect(state.requiredConfirmations).toBe(2);
    expect(state.competingValues).toEqual([
      expect.stringContaining("Declared full package: 20 mg"),
      expect.stringContaining("Lowest ladder dose needs: 50 mg"),
    ]);
  });

  it("lets two real reviewer confirmations clear the derived dispute without changing product data", () => {
    const rules = specRuleRows();
    const item = {
      activeCompound: "psilocybin",
      unitMaterialMassMg: 1,
      unitsPerPack: 20,
      materialMassBasis: "fruiting_body",
    };
    const disputeContext = fullPackageDoseDisputeReviewContext(item);
    const changes = appendFullPackageDoseDisputeChanges(
      item,
      [
        {
          fieldName: "totalDoseMg",
          previousValue: disputeContext,
          submittedValue: 20,
          actorType: "staff",
          actorIdentity: "employee-1",
          source: "packaging",
          disposition: "accepted",
          createdAt: new Date("2026-08-01T00:00:00Z"),
        },
        {
          fieldName: "totalDoseMg",
          previousValue: disputeContext,
          submittedValue: 20,
          actorType: "staff",
          actorIdentity: "employee-2",
          source: "packaging",
          disposition: "accepted",
          createdAt: new Date("2026-08-01T00:01:00Z"),
        },
      ]
    );

    const state = computeFieldStates(rules, changes).totalDoseMg;

    expect(state.state).toBe("confirmed");
    expect(state.confirmationsCount).toBe(2);
    expect(state.confirmedValue).toBe(20);
  });

  it("does not let stale package-total confirmations suppress first detection", () => {
    const rules = specRuleRows();
    const changes = appendFullPackageDoseDisputeChanges(
      {
        activeCompound: "psilocybin",
        unitMaterialMassMg: 1,
        unitsPerPack: 20,
        materialMassBasis: "fruiting_body",
      },
      [
        {
          fieldName: "totalDoseMg",
          submittedValue: 20,
          actorType: "staff",
          actorIdentity: "employee-1",
          source: "packaging",
          disposition: "accepted",
          createdAt: new Date("2026-07-01T00:00:00Z"),
        },
        {
          fieldName: "totalDoseMg",
          submittedValue: 20,
          actorType: "staff",
          actorIdentity: "employee-2",
          source: "packaging",
          disposition: "accepted",
          createdAt: new Date("2026-07-01T00:01:00Z"),
        },
      ]
    );

    const state = computeFieldStates(rules, changes).totalDoseMg;

    expect(state.state).toBe("disputed");
    expect(state.confirmedValue).toBeNull();
    expect(state.competingValues).toEqual([
      20,
      expect.stringContaining("Declared full package: 20 mg"),
      expect.stringContaining("Lowest ladder dose needs: 50 mg"),
    ]);
  });

  it("reopens a previously cleared finding when relevant package inputs change", () => {
    const rules = specRuleRows();
    const oldItem = {
      activeCompound: "psilocybin",
      unitMaterialMassMg: 1,
      unitsPerPack: 20,
      materialMassBasis: "fruiting_body",
    };
    const oldContext = fullPackageDoseDisputeReviewContext(oldItem);
    const reviewerConfirmations = [
      {
        fieldName: "totalDoseMg",
        previousValue: oldContext,
        submittedValue: 20,
        actorType: "staff",
        actorIdentity: "employee-1",
        source: "packaging",
        disposition: "accepted",
        createdAt: new Date("2026-08-01T00:00:00Z"),
      },
      {
        fieldName: "totalDoseMg",
        previousValue: oldContext,
        submittedValue: 20,
        actorType: "staff",
        actorIdentity: "employee-2",
        source: "packaging",
        disposition: "accepted",
        createdAt: new Date("2026-08-01T00:01:00Z"),
      },
    ];

    expect(
      computeFieldStates(
        rules,
        appendFullPackageDoseDisputeChanges(oldItem, reviewerConfirmations)
      ).totalDoseMg.state
    ).toBe("confirmed");

    const reopened = computeFieldStates(
      rules,
      appendFullPackageDoseDisputeChanges(
        {
          activeCompound: "psilocybin",
          unitMaterialMassMg: 1,
          unitsPerPack: 10,
          materialMassBasis: "fruiting_body",
        },
        reviewerConfirmations
      )
    ).totalDoseMg;

    expect(reopened.state).toBe("disputed");
    expect(reopened.confirmedValue).toBeNull();
    expect(reopened.competingValues).toEqual([
      20,
      expect.stringContaining("Declared full package: 10 mg"),
      expect.stringContaining("Lowest ladder dose needs: 50 mg"),
    ]);
  });

  it("reopens a previously cleared finding when the supported active compound changes", () => {
    const rules = specRuleRows();
    const oldItem = {
      activeCompound: "psilocybin",
      unitMaterialMassMg: 1,
      unitsPerPack: 20,
      materialMassBasis: "fruiting_body",
    };
    const oldContext = fullPackageDoseDisputeReviewContext(oldItem);
    const reviewerConfirmations = [
      {
        fieldName: "totalDoseMg",
        previousValue: oldContext,
        submittedValue: 20,
        actorType: "staff",
        actorIdentity: "employee-1",
        source: "packaging",
        disposition: "accepted",
        createdAt: new Date("2026-08-01T00:00:00Z"),
      },
      {
        fieldName: "totalDoseMg",
        previousValue: oldContext,
        submittedValue: 20,
        actorType: "staff",
        actorIdentity: "employee-2",
        source: "packaging",
        disposition: "accepted",
        createdAt: new Date("2026-08-01T00:01:00Z"),
      },
    ];

    expect(
      computeFieldStates(
        rules,
        appendFullPackageDoseDisputeChanges(oldItem, reviewerConfirmations)
      ).totalDoseMg.state
    ).toBe("confirmed");

    const reopened = computeFieldStates(
      rules,
      appendFullPackageDoseDisputeChanges(
        {
          activeCompound: "psilocin",
          unitMaterialMassMg: 1,
          unitsPerPack: 20,
          materialMassBasis: "fruiting_body",
        },
        reviewerConfirmations
      )
    ).totalDoseMg;

    expect(reopened.state).toBe("disputed");
    expect(reopened.confirmedValue).toBeNull();
    expect(reopened.competingValues).toEqual([
      20,
      expect.stringContaining("Declared full package: 20 mg"),
      expect.stringContaining("Lowest ladder dose needs: 50 mg"),
    ]);
  });

  it.each(["muscimol", "functional-only", "unknown", "", null])(
    "does not apply the psilocybin-family ladder to %s rows",
    (activeCompound) => {
      expect(
        detectFullPackageDoseDispute({
          activeCompound,
          unitMaterialMassMg: 1,
          unitsPerPack: 20,
          materialMassBasis: "fruiting_body",
        })
      ).toBeNull();
    }
  );
});
