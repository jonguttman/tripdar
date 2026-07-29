import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  storeProductCatalog: { findMany: vi.fn() },
  catalogFieldChange: { findMany: vi.fn() },
  catalogFieldVerificationRule: { findMany: vi.fn(), createMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { CATALOG_FIELD_SPECS } from "./catalogFieldSpec";
import type { ListingGateResult } from "./listingGate";
import {
  dispositionFor,
  evaluateRecommendableProducts,
  getRecommendableProducts,
  LISTING_GATE_POSTURE,
} from "./candidates";

/**
 * KEWL-2447 fixtures.
 *
 * `productionShapedRow()` is the important one: it mirrors the six products that
 * are live to customers right now (verified against prod Neon at 2221c5e) —
 * `active: true`, `activeCompound: 'unknown'`, `researchOnly: false`,
 * `listingOverrideAt: null`, and ZERO staff verification rows. KEWL-2354 shipped
 * 51/51 green while returning 422 to all traffic because every fixture used
 * `activeCompound: 'psilocybin'`, which no live row has. A test that cannot fail
 * on today's production data is not testing this.
 */

function readyCatalogRow(id: string, activeCompound: string | null) {
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
    _count: { photos: 0 },
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
    vibeProfile: { scores: { clarity_cognition: 0.8 } },
    strengthOffset: { offset: "standard", confirmed: true, rationale: null },
    // Listing-gate columns (KEWL-2335).
    researchOnly: false,
    listingOverrideAt: null as Date | null,
    listingOverrideBy: null as string | null,
    listingOverrideReason: null as string | null,
  };
}

/** Exactly the shape of the six products live in production today. */
function productionShapedRow(id: string) {
  return readyCatalogRow(id, "unknown");
}

function gateResult(overrides: Partial<ListingGateResult> = {}): ListingGateResult {
  return {
    listable: false,
    viaOverride: false,
    blockers: [],
    hardBlockers: [],
    verifiedFieldCount: 0,
    requiredFieldCount: 15,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // `ensureFieldRules()` reads the approved Tier A–D set. Returning the real specs
  // keeps the gate's required-field set identical to production's gate-required rows.
  prismaMock.catalogFieldVerificationRule.findMany.mockResolvedValue(CATALOG_FIELD_SPECS);
  prismaMock.catalogFieldVerificationRule.createMany.mockResolvedValue({ count: 0 });
  // Production truth: zero staff verification for every live product.
  prismaMock.catalogFieldChange.findMany.mockResolvedValue([]);
});

describe("getRecommendableProducts compound candidacy", () => {
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

describe("KEWL-2447 — research-only exclusion in the selector where clause", () => {
  it("never asks the database for research-only rows", async () => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([]);

    await getRecommendableProducts("partner-1");

    expect(prismaMock.storeProductCatalog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { partnerId: "partner-1", active: true, archivedAt: null, researchOnly: false },
      }),
    );
  });
});

describe("KEWL-2447 — the gate is evaluated against real production shape", () => {
  it("finds the six-live-products shape NOT listable", async () => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([productionShapedRow("live-1")]);

    const [evaluated] = await evaluateRecommendableProducts("partner-1");

    expect(evaluated.gate.listable).toBe(false);
    expect(evaluated.gate.viaOverride).toBe(false);
    expect(evaluated.gate.verifiedFieldCount).toBe(0);
    expect(evaluated.gate.requiredFieldCount).toBeGreaterThan(0);
  });

  it("names `unknown` active compound as a blocker on the live shape", async () => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([productionShapedRow("live-1")]);

    const [evaluated] = await evaluateRecommendableProducts("partner-1");

    expect(evaluated.gate.blockers.map((blocker) => blocker.kind)).toContain(
      "unknown_active_compound",
    );
    expect(evaluated.gate.blockers.some((blocker) => blocker.kind === "unverified_field")).toBe(
      true,
    );
  });

  it("gives zero gate credit to a non-staff (agent) change row", async () => {
    // Mirrors the single real CatalogFieldChange on an active product in prod: the
    // KEWL-2347 append-only probe, actorType 'agent'. Only `staff` submissions count.
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([productionShapedRow("live-1")]);
    prismaMock.catalogFieldChange.findMany.mockResolvedValue([
      {
        catalogItemId: "live-1",
        fieldName: "shortDescription",
        submittedValue: "KEWL-2347 append-only probe — do not delete (by design)",
        actorType: "agent",
        actorIdentity: "jordi-kewl-2347",
        source: "verification",
        disposition: "approved",
        createdAt: new Date("2026-07-20T00:00:00Z"),
      },
    ]);

    const [evaluated] = await evaluateRecommendableProducts("partner-1");

    expect(evaluated.gate.verifiedFieldCount).toBe(0);
    expect(evaluated.gate.listable).toBe(false);
  });
});

describe("KEWL-2447 — positive control: the gate CAN pass", () => {
  /**
   * Without this, every gate assertion above would still pass if the gate were
   * hardwired to `listable: false`. This builds the fully-verified counterpart of
   * `productionShapedRow()` — every gate-required field confirmed by as many
   * distinct staff reviewers as its tier demands — and proves it lists cleanly.
   */
  function fullStaffVerification(catalogItemId: string) {
    return CATALOG_FIELD_SPECS.filter((spec) => spec.gateRequired).flatMap((spec) =>
      Array.from({ length: spec.requiredConfirmations }, (_, index) => ({
        catalogItemId,
        fieldName: spec.fieldName,
        // The photo check only accepts "yes"; the rest accept any confirmed value.
        submittedValue: spec.gateSatisfyingValues[0] ?? `verified-${spec.fieldName}`,
        actorType: "staff",
        actorIdentity: `reviewer-${index + 1}`,
        source: "packaging",
        disposition: "accepted",
        createdAt: new Date(`2026-07-2${index + 1}T00:00:00Z`),
      })),
    );
  }

  it("lists a fully verified, known-compound product cleanly and without an override", async () => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([
      { ...readyCatalogRow("verified-1", "psilocybin"), _count: { photos: 1 } },
    ]);
    prismaMock.catalogFieldChange.findMany.mockResolvedValue(fullStaffVerification("verified-1"));

    const [evaluated] = await evaluateRecommendableProducts("partner-1");

    expect(evaluated.gate.blockers).toEqual([]);
    expect(evaluated.gate.listable).toBe(true);
    expect(evaluated.gate.viaOverride).toBe(false);
    expect(evaluated.gate.verifiedFieldCount).toBe(evaluated.gate.requiredFieldCount);
  });

  it.each(["inert", "suppress", "override", "dark"] as const)(
    "lists the fully verified product under every posture (%s)",
    async (posture) => {
      prismaMock.storeProductCatalog.findMany.mockResolvedValue([
        { ...readyCatalogRow("verified-1", "psilocybin"), _count: { photos: 1 } },
      ]);
      prismaMock.catalogFieldChange.findMany.mockResolvedValue(fullStaffVerification("verified-1"));

      const [evaluated] = await evaluateRecommendableProducts("partner-1", posture);

      expect(evaluated.disposition).toBe("list");
    },
  );

  it("blocks that same fully verified product the moment its compound reverts to unknown", async () => {
    // The one-field delta between listable and not — this is the live products' defect.
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([
      { ...readyCatalogRow("verified-1", "unknown"), _count: { photos: 1 } },
    ]);
    prismaMock.catalogFieldChange.findMany.mockResolvedValue(fullStaffVerification("verified-1"));

    const [evaluated] = await evaluateRecommendableProducts("partner-1");

    expect(evaluated.gate.listable).toBe(false);
    expect(evaluated.gate.blockers.map((blocker) => blocker.kind)).toContain(
      "unknown_active_compound",
    );
  });
});

describe("KEWL-2447 — batching, not N+1", () => {
  it("issues exactly one change query for the whole candidate set", async () => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) => productionShapedRow(`live-${index + 1}`)),
    );

    const evaluated = await evaluateRecommendableProducts("partner-1");

    expect(evaluated).toHaveLength(6);
    expect(prismaMock.catalogFieldChange.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.catalogFieldChange.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          catalogItemId: {
            in: ["live-1", "live-2", "live-3", "live-4", "live-5", "live-6"],
          },
        },
      }),
    );
  });

  it("does not query changes at all when nothing clears readiness", async () => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([]);

    await evaluateRecommendableProducts("partner-1");

    expect(prismaMock.catalogFieldChange.findMany).not.toHaveBeenCalled();
  });

  it("attributes each item's changes to the right product", async () => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([
      productionShapedRow("live-1"),
      productionShapedRow("live-2"),
    ]);
    prismaMock.catalogFieldChange.findMany.mockResolvedValue([
      {
        catalogItemId: "live-2",
        fieldName: CATALOG_FIELD_SPECS[0].fieldName,
        submittedValue: "confirmed value",
        actorType: "staff",
        actorIdentity: "reviewer-a",
        source: "packaging",
        disposition: "accepted",
        createdAt: new Date("2026-07-20T00:00:00Z"),
      },
    ]);

    const evaluated = await evaluateRecommendableProducts("partner-1");
    const byId = new Map(evaluated.map((entry) => [entry.candidate.id, entry]));

    expect(byId.get("live-1")!.gate.verifiedFieldCount).toBe(0);
    expect(byId.get("live-2")!.gate.verifiedFieldCount).toBeGreaterThan(0);
  });
});

describe("KEWL-2447 — the posture decision point", () => {
  it("ships inert, so this PR is a no-op against production data", async () => {
    expect(LISTING_GATE_POSTURE).toBe("inert");

    prismaMock.storeProductCatalog.findMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) => productionShapedRow(`live-${index + 1}`)),
    );

    // All six fail the gate...
    const evaluated = await evaluateRecommendableProducts("partner-1");
    expect(evaluated.every((entry) => entry.gate.listable === false)).toBe(true);

    // ...and all six are still served, exactly as before this change.
    const candidates = await getRecommendableProducts("partner-1");
    expect(candidates).toHaveLength(6);
  });

  it.each([
    ["suppress", "list_stripped"],
    ["override", "drop"],
    ["dark", "drop"],
  ] as const)("posture %s disposes a gate-blocked live product as %s", async (posture, expected) => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([productionShapedRow("live-1")]);

    const [evaluated] = await evaluateRecommendableProducts("partner-1", posture);

    expect(evaluated.disposition).toBe(expected);
  });

  describe("dispositionFor (pure)", () => {
    const blocked = gateResult({ listable: false, viaOverride: false });
    const overridden = gateResult({ listable: true, viaOverride: true });
    const clean = gateResult({ listable: true, viaOverride: false });

    it("inert lists everything, blocked or not", () => {
      expect(dispositionFor(blocked, "inert")).toBe("list");
      expect(dispositionFor(overridden, "inert")).toBe("list");
      expect(dispositionFor(clean, "inert")).toBe("list");
    });

    it("suppress keeps blocked products but marks them for field stripping", () => {
      expect(dispositionFor(blocked, "suppress")).toBe("list_stripped");
      expect(dispositionFor(clean, "suppress")).toBe("list");
      expect(dispositionFor(overridden, "suppress")).toBe("list");
    });

    it("override drops blocked products but honours a valid Jon override", () => {
      expect(dispositionFor(blocked, "override")).toBe("drop");
      expect(dispositionFor(overridden, "override")).toBe("list");
      expect(dispositionFor(clean, "override")).toBe("list");
    });

    it("dark drops blocked products AND overridden ones", () => {
      expect(dispositionFor(blocked, "dark")).toBe("drop");
      expect(dispositionFor(overridden, "dark")).toBe("drop");
      expect(dispositionFor(clean, "dark")).toBe("list");
    });
  });
});

describe("KEWL-2447 — viaOverride is honoured end to end", () => {
  function overriddenLiveRow(id: string) {
    return {
      ...productionShapedRow(id),
      listingOverrideAt: new Date("2026-07-25T00:00:00Z"),
      listingOverrideBy: "jon",
      listingOverrideReason: "Pilot launch — verified by hand",
    };
  }

  it("marks a force-listed product listable via override", async () => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([overriddenLiveRow("live-1")]);

    const [evaluated] = await evaluateRecommendableProducts("partner-1", "override");

    expect(evaluated.gate.listable).toBe(true);
    expect(evaluated.gate.viaOverride).toBe(true);
    expect(evaluated.disposition).toBe("list");
  });

  it("still drops the force-listed product under the dark posture", async () => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([overriddenLiveRow("live-1")]);

    const [evaluated] = await evaluateRecommendableProducts("partner-1", "dark");

    expect(evaluated.gate.viaOverride).toBe(true);
    expect(evaluated.disposition).toBe("drop");
  });

  it("does not honour an incomplete override (no reason)", async () => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([
      { ...overriddenLiveRow("live-1"), listingOverrideReason: null },
    ]);

    const [evaluated] = await evaluateRecommendableProducts("partner-1", "override");

    expect(evaluated.gate.listable).toBe(false);
    expect(evaluated.disposition).toBe("drop");
  });
});
