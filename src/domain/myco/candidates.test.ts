import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  storeProductCatalog: { findMany: vi.fn() },
}));

// Strict view (KEWL-2467): the code under test sees a Proxy that throws by name on
// any un-stubbed prisma access, so a signature change the mock has not kept up with
// fails as "not stubbed" instead of as a downstream undefined/500.
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock(prismaMock) };
});

import { getRecommendableProducts } from "./candidates";

function readyCatalogRow(
  id: string,
  activeCompound: string | null,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    productName: `Product ${id}`,
    format: "capsule",
    brand: "Psilly",
    brandId: null,
    brandRef: null,
    strainSlug: null,
    photoUrl: "https://example.test/product.jpg",
    photos: [],
    ingredients: [],
    flavors: [],
    onsetMinutes: 30,
    durationMinutes: 240,
    brandDoseInstructions: null,
    activeCompound,
    productUnitMg: 100,
    unitsPerPack: 10,
    totalDoseMg: 1000,
    brandDoseTiers: null,
    brandMicroUnits: 1,
    brandMiniUnits: 2,
    brandMacroUnits: 5,
    researchOnly: false,
    vibeProfile: { scores: { clarity_cognition: 0.8 } },
    strengthOffset: { offset: "standard", confirmed: true, rationale: null },
    fieldVerificationStates: [],
    ...overrides,
  };
}

describe("getRecommendableProducts compound candidacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the measured legacy unknown shape non-empty", async () => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue(
      Array.from({ length: 4 }, (_, index) => readyCatalogRow(`legacy-${index + 1}`, "unknown")),
    );

    const candidates = await getRecommendableProducts("partner-1");

    expect(candidates).toHaveLength(4);
    expect(candidates.every((candidate) => candidate.dose.activeCompound === "unknown")).toBe(true);
  });

  it.each(["unknown", "", null])(
    "retains product identity for legacy %s compound values while dose output stays gated",
    async (activeCompound) => {
      prismaMock.storeProductCatalog.findMany.mockResolvedValue([
        readyCatalogRow("candidate", activeCompound),
      ]);

      const candidates = await getRecommendableProducts("partner-1");

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({
        id: "candidate",
        productName: "Product candidate",
        dose: { activeCompound },
      });
    },
  );

  it.each(["muscimol", "functional-only", "lions-mane"])(
    "excludes unsupported compound %s despite complete legacy readiness inputs",
    async (activeCompound) => {
      prismaMock.storeProductCatalog.findMany.mockResolvedValue([
        readyCatalogRow("candidate", activeCompound),
      ]);

      await expect(getRecommendableProducts("partner-1")).resolves.toEqual([]);
    },
  );
});

/**
 * KEWL-2460 — this is the only code path that decides which photos a customer
 * may see, so the approved-only filter belongs in the query itself. A pending
 * brand-portal photo must neither be shown nor satisfy the readiness photo gate.
 */
describe("getRecommendableProducts photo visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks the database for approved photos only", async () => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([]);

    await getRecommendableProducts("partner-1");

    const args = prismaMock.storeProductCatalog.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ partnerId: "partner-1", active: true, archivedAt: null, researchOnly: false });
    expect(args.include.photos.where).toEqual({ status: "approved" });
  });

  it("keeps a product whose only photo is pending without exposing that photo", async () => {
    // The approved-only filter above means a pending row never reaches us, so the
    // row arrives with an empty `photos` array.
    const row = readyCatalogRow("pending-only", "psilocybin", { photoUrl: null, photos: [] });
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([row]);

    const candidates = await getRecommendableProducts("partner-1");

    expect(candidates).toHaveLength(1);
    expect(candidates[0].photoUrl).toBeNull();
  });

  it("serves the approved photo when one exists", async () => {
    const row = readyCatalogRow("approved", "psilocybin", {
      photoUrl: null,
      photos: [{ url: "https://cdn.test/approved.jpg" }],
    });
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([row]);

    const candidates = await getRecommendableProducts("partner-1");

    expect(candidates).toHaveLength(1);
    expect(candidates[0].photoUrl).toBe("https://cdn.test/approved.jpg");
  });
});

describe("getRecommendableProducts verification posture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps active products with zero verified fields in the recommendation pool", async () => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([
      readyCatalogRow("unverified-active", "psilocybin", {
        fieldVerificationStates: [],
        strengthOffset: { offset: "standard", confirmed: false, rationale: null },
      }),
    ]);

    const candidates = await getRecommendableProducts("partner-1");

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: "unverified-active",
      fieldVerificationStates: {},
    });
  });
});
