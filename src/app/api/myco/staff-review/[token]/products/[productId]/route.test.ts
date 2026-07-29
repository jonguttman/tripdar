/**
 * KEWL-2457 — staff edits queue for review; confirmations still flow.
 *
 * The domain-level proof is in `staffReviewService.test.ts`. What is pinned HERE is the
 * end of the write path, because that is where the damage happened: the submit
 * transaction projects a `confirmed` field onto the live `StoreProductCatalog` column,
 * and a customer reads that column. So the test that matters is not "the row says
 * pending" — it is **`storeProductCatalog.update` was never called.**
 *
 * Fixture is production-shaped per KEWL-2354: an active, non-archived row with
 * `activeCompound: "unknown"` and an EMPTY ledger, which is the state all six
 * selector-reachable products are actually in. A fixture pre-seeded with confirmations
 * would pass while proving nothing about the rows this ships against.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { CONFIRMED_ABSENT_VALUE } from "@/domain/myco/catalogFieldSpec";
import type { FieldRuleRow } from "@/domain/myco/staffReviewService";

const CLAY = "employee-clay";
const PARTNER_ID = "partner-mushroom-top";
const PRODUCT_ID = "catalog-item-1";

/** Tier A — one confirmation, so it is the fastest path from an answer to a live column. */
const TIER_A: FieldRuleRow = {
  fieldName: "onsetMinutes",
  tier: "A",
  requiredConfirmations: 1,
  requiresDistinctReviewers: false,
  gateRequired: true,
  readinessKey: null,
  catalogColumn: "onsetMinutes",
  label: "Onset",
  helpText: null,
  inputType: "number",
  allowsConfirmedAbsent: true,
  gateSatisfyingValues: [],
  sortOrder: 0,
};

const RULES = [TIER_A];

const prismaMock = vi.hoisted(() => ({
  storeProductCatalog: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  catalogFieldChange: { createMany: vi.fn() },
  catalogFieldVerificationState: { upsert: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/domain/myco/staffReviewAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/domain/myco/staffReviewAuth")>()),
  requireReviewer: vi.fn(async () => ({
    ok: true as const,
    partnerId: PARTNER_ID,
    employeeId: CLAY,
    employeeName: "Clay",
  })),
}));

// Real state maths, stubbed rule loading — the rules are config rows, not logic.
vi.mock("@/domain/myco/staffReviewService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/domain/myco/staffReviewService")>()),
  ensureFieldRules: vi.fn(async () => RULES),
}));

/** A live production row: active, unknown compound, nothing verified yet. */
function catalogRow(changes: Record<string, unknown>[] = []) {
  return {
    id: PRODUCT_ID,
    partnerId: PARTNER_ID,
    productName: "Blue Meanie 500mg",
    brand: "Mushroom Top",
    brandId: null,
    brandRef: null,
    format: "capsule",
    sku: null,
    strainSlug: null,
    flavors: [],
    activeCompound: "unknown",
    researchOnly: false,
    archivedAt: null,
    productUnitMg: null,
    unitsPerPack: null,
    totalDoseMg: null,
    onsetMinutes: null,
    durationMinutes: null,
    brandMicroUnits: null,
    brandMiniUnits: null,
    brandMacroUnits: null,
    brandDoseTiers: null,
    photoUrl: null,
    photos: [],
    vibeProfile: null,
    strengthOffset: null,
    listingOverrideAt: null,
    listingOverrideBy: null,
    listingOverrideReason: null,
    _count: { photos: 0 },
    catalogFieldChanges: changes,
  };
}

/** The transaction, executed for real against the mocks, with the ledger append applied. */
function wireTransaction(existingChanges: Record<string, unknown>[] = []) {
  const written: Record<string, unknown>[] = [];
  prismaMock.catalogFieldChange.createMany.mockImplementation(
    async ({ data }: { data: Record<string, unknown>[] }) => {
      written.push(...data.map((row) => ({ ...row, createdAt: new Date() })));
      return { count: data.length };
    }
  );
  prismaMock.storeProductCatalog.findUniqueOrThrow.mockImplementation(async () =>
    catalogRow([...existingChanges, ...written])
  );
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)
  );
  return { written };
}

async function submit(answers: Record<string, unknown>[]) {
  const { POST } = await import("./route");
  // NextRequest, not Request: the route reads `request.cookies`, which only the Next
  // wrapper provides.
  const request = new NextRequest(
    `https://tripdar.test/api/myco/staff-review/tok/products/${PRODUCT_ID}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers }),
    }
  );
  const response = await POST(request as never, {
    params: Promise.resolve({ token: "tok", productId: PRODUCT_ID }),
  });
  return { response, body: await response.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.storeProductCatalog.findFirst.mockResolvedValue(catalogRow());
  prismaMock.catalogFieldVerificationState.upsert.mockResolvedValue({});
  prismaMock.storeProductCatalog.update.mockResolvedValue({});
});

describe("POST — a staff edit queues instead of going live (KEWL-2457)", () => {
  it("writes `fill` as pending and does NOT touch the catalog column", () => {
    const { written } = wireTransaction();
    return submit([
      { fieldName: "onsetMinutes", action: "fill", value: 30, source: "packaging" },
    ]).then(({ response, body }) => {
      expect(response.status).toBe(200);
      expect(written[0].disposition).toBe("pending");
      // The whole point. Before this change a single Tier-A fill confirmed on arrival
      // and wrote 30 straight onto the row a customer reads.
      expect(prismaMock.storeProductCatalog.update).not.toHaveBeenCalled();
      expect(body.data.queuedForReview).toEqual(["onsetMinutes"]);
    });
  });

  it("writes `correct` as pending", async () => {
    const { written } = wireTransaction();
    await submit([
      { fieldName: "onsetMinutes", action: "correct", value: 45, source: "packaging" },
    ]);
    expect(written[0].disposition).toBe("pending");
    expect(prismaMock.storeProductCatalog.update).not.toHaveBeenCalled();
  });

  it("writes `confirmed_absent` as pending — clearing a column is still a change", async () => {
    const { written } = wireTransaction();
    await submit([
      { fieldName: "onsetMinutes", action: "confirmed_absent", source: "packaging" },
    ]);
    expect(written[0].submittedValue).toBe(CONFIRMED_ABSENT_VALUE);
    expect(written[0].disposition).toBe("pending");
    expect(prismaMock.storeProductCatalog.update).not.toHaveBeenCalled();
  });

  it("writes `dont_know` as accepted — it is not an answer and changes nothing", async () => {
    const { written } = wireTransaction();
    await submit([{ fieldName: "onsetMinutes", action: "dont_know" }]);
    expect(written[0].disposition).toBe("accepted");
    expect(prismaMock.storeProductCatalog.update).not.toHaveBeenCalled();
  });

  it("keeps `confirm` flowing as before, column write included", async () => {
    // Peer confirmation is not an edit and must not be slowed down — it is the only
    // check operating while a change waits in Jon's queue.
    const priorAccepted = {
      id: "prior",
      fieldName: "onsetMinutes",
      previousValue: null,
      submittedValue: 30,
      actorType: "staff",
      actorIdentity: "employee-audrey",
      source: "packaging",
      disposition: "accepted",
      createdAt: new Date(1000),
    };
    prismaMock.storeProductCatalog.findFirst.mockResolvedValue(catalogRow([priorAccepted]));
    const { written } = wireTransaction([priorAccepted]);

    await submit([{ fieldName: "onsetMinutes", action: "confirm", source: "packaging" }]);

    expect(written[0].disposition).toBe("accepted");
    expect(prismaMock.storeProductCatalog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { onsetMinutes: 30 } })
    );
  });

  it("refuses to Confirm a value that only exists as a pending edit", async () => {
    // A pending change is not `liveValue`, so there is nothing on screen to agree with.
    // Were it otherwise, one Confirm would launder an unreviewed value past the gate.
    const priorPending = {
      id: "prior",
      fieldName: "onsetMinutes",
      previousValue: null,
      submittedValue: 30,
      actorType: "staff",
      actorIdentity: "employee-audrey",
      source: "packaging",
      disposition: "pending",
      createdAt: new Date(1000),
    };
    prismaMock.storeProductCatalog.findFirst.mockResolvedValue(catalogRow([priorPending]));
    wireTransaction([priorPending]);

    const { response } = await submit([
      { fieldName: "onsetMinutes", action: "confirm", source: "packaging" },
    ]);

    expect(response.status).toBe(400);
    expect(prismaMock.storeProductCatalog.update).not.toHaveBeenCalled();
  });
});
