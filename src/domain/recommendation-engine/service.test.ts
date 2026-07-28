/**
 * KEWL-2356 service-layer tests: catalog overlay must pass divisor amount AND
 * basis into scoring, must fail closed on unsupported active compounds, and must
 * persist productUnits: null when unit math was suppressed.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  strainRecommendationConfig: { findMany: vi.fn() },
  storeProductCatalog: { findMany: vi.fn() },
  feedbackAggregate: { findMany: vi.fn() },
  recommendationSession: { create: vi.fn() },
}));

const loadStrainDataMock = vi.hoisted(() => vi.fn());
const scoreStrainsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/domain/strain/blob-store", () => ({ loadStrainData: loadStrainDataMock }));
vi.mock("./scoring", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./scoring")>()),
  scoreStrains: scoreStrainsMock,
}));

import { generateRecommendations, parseHighUnitCount } from "./service";

const PARTNER = "partner-1";

function catalogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cat-1",
    strainSlug: "golden-teacher",
    productName: "Golden Teacher Capsules",
    format: "capsule",
    productUnitMg: null,
    unitMaterialMassMg: 444,
    materialMassBasis: "mushroom_material",
    activeCompound: "psilocybin",
    photoUrl: null,
    strengthOffset: null,
    ...overrides,
  };
}

/** The config the scoring layer actually received for a slug. */
function configPassedFor(slug: string) {
  const [options] = scoreStrainsMock.mock.calls.at(-1) ?? [];
  return options?.adminConfigs?.get(slug);
}

async function run() {
  return generateRecommendations(
    {
      experienceLevel: "experienced",
      inputPath: "mood_tiles",
      intentVector: {
        clarity_cognition: 0.6, mood_social: 0.6, visual_pattern: 0.6,
        somatic: 0.6, energy_direction: 0.6, depth_direction: 0.6,
      },
      rawInput: {},
      siteId: "site-1",
    },
    PARTNER,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.strainRecommendationConfig.findMany.mockResolvedValue([]);
  prismaMock.storeProductCatalog.findMany.mockResolvedValue([catalogRow()]);
  prismaMock.feedbackAggregate.findMany.mockResolvedValue([]);
  prismaMock.recommendationSession.create.mockImplementation(async (args: never) => ({
    sessionToken: "rec_test",
    results: [],
    _args: args,
  }));
  loadStrainDataMock.mockResolvedValue([
    { id: "golden-teacher", name: "Golden Teacher" },
  ]);
  scoreStrainsMock.mockReturnValue([]);
});

describe("catalog overlay -> scoring", () => {
  it("passes both the material mass amount and its basis", async () => {
    await run();

    expect(configPassedFor("golden-teacher")).toMatchObject({
      productName: "Golden Teacher Capsules",
      productUnitMaterialMassMg: 444,
      productMaterialMassBasis: "mushroom_material",
    });
  });

  it("passes an incompatible basis through verbatim so scoring can reject it", async () => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([
      catalogRow({ materialMassBasis: "whole_fruit_body_extract", unitMaterialMassMg: 1 }),
    ]);
    await run();

    expect(configPassedFor("golden-teacher")).toMatchObject({
      productMaterialMassBasis: "whole_fruit_body_extract",
    });
  });

  it("leaves basis undefined rather than guessing when the column is null", async () => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([
      catalogRow({ materialMassBasis: null }),
    ]);
    await run();

    expect(configPassedFor("golden-teacher")?.productMaterialMassBasis).toBeUndefined();
  });
});

describe("fail-closed active compound gate", () => {
  it.each(["unknown", "muscimol", "functional-only", "lions-mane", ""])(
    "keeps %s out of candidates",
    async (activeCompound) => {
      prismaMock.storeProductCatalog.findMany.mockResolvedValue([
        catalogRow({ activeCompound }),
      ]);
      await run();

      expect(configPassedFor("golden-teacher")).toBeUndefined();
    },
  );

  it.each(["psilocybin", "psilocin"])("admits %s", async (activeCompound) => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([
      catalogRow({ activeCompound }),
    ]);
    await run();

    expect(configPassedFor("golden-teacher")).toBeDefined();
  });
});

describe("persistence of suppressed unit math", () => {
  it("stores null productUnits and does not throw when suggestedUnits is absent", async () => {
    scoreStrainsMock.mockReturnValue([
      {
        strainSlug: "golden-teacher", strainName: "Golden Teacher",
        matchScore: 80, baseScore: 80, feedbackMod: 0, adminMod: 0,
        doseLevel: 4, doseLevelName: "Museum Dose", doseLowMg: 1500, doseHighMg: 3500,
        product: { name: "Golden Teacher Capsules", url: "", format: "capsule" },
        description: "", tags: {}, cautions: [],
      },
    ]);

    await expect(run()).resolves.toBeDefined();

    const createArgs = prismaMock.recommendationSession.create.mock.calls[0][0];
    expect(createArgs.data.results.create[0].productUnits).toBeNull();
  });

  it("stores the high unit count when unit math is present", async () => {
    scoreStrainsMock.mockReturnValue([
      {
        strainSlug: "golden-teacher", strainName: "Golden Teacher",
        matchScore: 80, baseScore: 80, feedbackMod: 0, adminMod: 0,
        doseLevel: 4, doseLevelName: "Museum Dose", doseLowMg: 1500, doseHighMg: 3500,
        product: { name: "GT", url: "", format: "capsule", suggestedUnits: "4-8" },
        description: "", tags: {}, cautions: [],
      },
    ]);

    await run();

    const createArgs = prismaMock.recommendationSession.create.mock.calls[0][0];
    expect(createArgs.data.results.create[0].productUnits).toBe(8);
  });
});

describe("parseHighUnitCount", () => {
  it("returns null for suppressed unit math", () => {
    expect(parseHighUnitCount(undefined)).toBeNull();
  });

  it("returns null for unparseable ranges instead of a bogus 0", () => {
    expect(parseHighUnitCount("4")).toBeNull();
    expect(parseHighUnitCount("")).toBeNull();
    expect(parseHighUnitCount("many-units")).toBeNull();
  });

  it("extracts the high end of a range", () => {
    expect(parseHighUnitCount("4-8")).toBe(8);
    expect(parseHighUnitCount("11-25")).toBe(25);
  });
});
