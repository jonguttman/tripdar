/**
 * KEWL-2508 — the duplicate route's half of the KEWL-2335 listing gate.
 *
 * The gate was enforced on `PATCH /api/admin/myco/[id]` and nowhere else. This route
 * hardcoded `active: true` and referenced no gate symbol at all, so one admin click put
 * an unreviewed, photo-less product on the customer path — the KEWL-2327 failure the
 * gate exists to close.
 *
 * These tests are negative controls: revert `active: false` to `active: true` in
 * `route.ts` and the first two must fail. A test that only asserted "the route returns
 * 201" would have passed against the bug, which is why the assertions below are about
 * the row's `active` flag and about the REAL gate's verdict on the REAL create payload —
 * not about the status code.
 *
 * The gate is evaluated here through `evaluateGateForItem`, the same function
 * `loadGateForProduct` calls, rather than against a hardcoded expectation. That is
 * deliberate: it ties this test to the shipped gate, so a future change that made a bare
 * duplicate listable would surface here instead of silently re-opening the hole.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { CATALOG_FIELD_SPECS } from "@/domain/myco/catalogFieldSpec";
import { evaluateGateForItem, type FieldRuleRow } from "@/domain/myco/staffReviewService";

const PARTNER_ID = "cms71s4l0000010sy61og8q23"; // QA sandbox partner, never the live TMT partner.
const SOURCE_ID = "prod_source_0001";
const ADMIN_EMAIL = "admin@x.internal";

const prismaMock = vi.hoisted(() => ({
  storeProductCatalog: { findUnique: vi.fn(), create: vi.fn() },
}));
const getServerSessionMock = vi.hoisted(() => vi.fn());
const resolveProductForAdminMock = vi.hoisted(() => vi.fn());

// Strict view (KEWL-2467): any un-stubbed prisma access throws by name rather than
// collapsing into the route's catch-all 500.
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock(prismaMock) };
});
vi.mock("@/domain/auth/adminSession", () => ({ getAdminSession: getServerSessionMock }));
vi.mock("@/domain/myco/adminAccess", () => ({
  resolveProductForAdmin: resolveProductForAdminMock,
}));

import { POST } from "./route";

/** The shipped field spec as the gate consumes it. Mirrors `specToRow` in staffReviewService. */
const RULES: FieldRuleRow[] = CATALOG_FIELD_SPECS.map((spec) => ({ ...spec }));

/**
 * A source product that is itself fully listable — every gate-required column populated,
 * a photo, a confirmed offset. Duplicating a *blocked* product proving the copy is
 * blocked would be weak; the real defect is that a copy of a GOOD product went live
 * carrying none of what made the original good.
 */
function listableSource() {
  return {
    id: SOURCE_ID,
    partnerId: PARTNER_ID,
    productName: "QA Fixture Capsule",
    format: "capsule",
    brand: "QA Fixture Brand",
    brandId: "brand_qa_0001",
    strainSlug: null,
    activeCompound: "psilocybin",
    productUnitMg: 100,
    unitsPerPack: 10,
    totalDoseMg: 1000,
    ingredients: ["Psilocybe cubensis extract"],
    flavors: ["mint"],
    onsetMinutes: 30,
    durationMinutes: 240,
    brandMicroUnits: 1,
    brandMiniUnits: 3,
    brandMacroUnits: 8,
    brandDoseTiers: null,
    brandDoseInstructions: "One capsule with food.",
    photoUrl: "https://cdn.example/qa-fixture.jpg",
    active: true,
    researchOnly: false,
    notes: null,
    listingOverrideAt: null,
    listingOverrideBy: null,
    listingOverrideReason: null,
    strengthOffset: { offset: "standard", rationale: null, confirmed: true },
    vibeProfile: { scores: { calm: 3, focus: 2 } },
  };
}

/**
 * The row the DB would actually hold, i.e. the route's `create` payload with
 * `StoreProductCatalog` schema defaults applied for every column the route omits.
 * `activeCompound` is the one that matters: the route does not copy it, so a duplicate
 * always lands on the `@default("unknown")` the gate fails closed on.
 */
function persistedRowFromCreate(data: Record<string, unknown>) {
  return {
    format: data.format as string,
    brand: (data.brand ?? null) as string | null,
    brandId: (data.brandId ?? null) as string | null,
    productUnitMg: (data.productUnitMg ?? null) as number | null,
    unitsPerPack: (data.unitsPerPack ?? null) as number | null,
    totalDoseMg: (data.totalDoseMg ?? null) as number | null,
    onsetMinutes: (data.onsetMinutes ?? null) as number | null,
    durationMinutes: (data.durationMinutes ?? null) as number | null,
    brandMicroUnits: (data.brandMicroUnits ?? null) as number | null,
    brandMiniUnits: (data.brandMiniUnits ?? null) as number | null,
    brandMacroUnits: (data.brandMacroUnits ?? null) as number | null,
    brandDoseTiers: data.brandDoseTiers ?? null,
    photoUrl: (data.photoUrl ?? null) as string | null,
    activeCompound: (data.activeCompound ?? "unknown") as string, // schema default
    researchOnly: (data.researchOnly ?? false) as boolean, // schema default
    listingOverrideAt: null,
    listingOverrideBy: null,
    listingOverrideReason: null,
  };
}

async function callRoute() {
  const res = await POST({} as never, { params: Promise.resolve({ id: SOURCE_ID }) });
  const createArgs = prismaMock.storeProductCatalog.create.mock.calls[0]?.[0] as
    | { data: Record<string, unknown> }
    | undefined;
  return { res, data: createArgs?.data };
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSessionMock.mockResolvedValue({ user: { email: ADMIN_EMAIL } });
  resolveProductForAdminMock.mockResolvedValue({ ok: true, partnerId: PARTNER_ID });
  prismaMock.storeProductCatalog.findUnique.mockResolvedValue(listableSource());
  prismaMock.storeProductCatalog.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    id: "prod_dup_0001",
    ...args.data,
    strengthOffset: null,
    vibeProfile: null,
    photos: [],
    brandRef: null,
  }));
});

describe("POST /api/admin/myco/[id]/duplicate — listing gate reach (KEWL-2508)", () => {
  it("creates the duplicate inactive", async () => {
    const { res, data } = await callRoute();

    expect(res.status).toBe(201);
    expect(data).toBeDefined();
    // Load-bearing: `StoreProductCatalog.active` is `@default(true)`, so omitting the
    // key would also produce an active row. It must be explicitly false.
    expect(data!.active).toBe(false);
  });

  it("never produces an active row that the real gate would reject", async () => {
    const { data } = await callRoute();

    const gate = evaluateGateForItem({
      item: persistedRowFromCreate(data!) as never,
      extras: {
        // The duplicate copies no photos and no confirmed offset.
        photoCount: 0,
        vibeScores: (data!.vibeProfile as { create?: { scores?: unknown } } | undefined)?.create?.scores ?? null,
        strengthOffset: { offset: "standard", confirmed: false },
      },
      rules: RULES,
      // Verification is per-product in `CatalogFieldVerificationState` and is never
      // copied, so a fresh duplicate has no confirmations of its own.
      fieldStates: {},
    });

    // Premise check: the duplicate genuinely cannot clear the gate. If this ever goes
    // true, the assertion below stops meaning anything, so it is asserted, not assumed.
    expect(gate.listable).toBe(false);
    expect(gate.blockers.map((b) => b.kind)).toContain("unknown_active_compound");

    // The defect, stated exactly: no active row that fails the gate.
    expect(data!.active === true && !gate.listable).toBe(false);
  });

  it("copies no verification state or photo from the source", async () => {
    const { data } = await callRoute();

    // Inheriting confirmations would forge staff sign-off: they are per-reviewer,
    // per-product assertions about a physical package.
    expect(prismaMock.storeProductCatalog.create).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(data)).not.toContain("catalogFieldVerificationState");
    expect(data!.photoUrl).toBeNull();
    expect(data!.flavors).toEqual([]);
    expect((data!.strengthOffset as { create: { confirmed: boolean } }).create.confirmed).toBe(false);
  });

  it("still refuses unauthenticated callers", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const res = await POST({} as never, { params: Promise.resolve({ id: SOURCE_ID }) });

    expect(res.status).toBe(401);
    expect(prismaMock.storeProductCatalog.create).not.toHaveBeenCalled();
  });
});
