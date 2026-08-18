import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductCandidate } from "@/domain/myco/scoring";

const prismaMock = vi.hoisted(() => ({
  partner: { findFirst: vi.fn() },
  recommendationSession: { create: vi.fn() },
}));

const candidatesMock = vi.hoisted(() => ({
  getRecommendableProducts: vi.fn(),
}));

const reflectionMock = vi.hoisted(() => ({
  generateReflections: vi.fn(),
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock(prismaMock) };
});

vi.mock("@/domain/myco/candidates", () => candidatesMock);
vi.mock("@/domain/myco/reflection", () => reflectionMock);
vi.mock("@/domain/strain/blob-store", () => ({ loadStrainData: vi.fn(async () => []) }));
vi.mock("@/domain/recommendation-engine/strain-profiles", () => ({
  generateAllProfiles: vi.fn(() => []),
}));
vi.mock("@/domain/myco/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  clientIp: vi.fn(() => "127.0.0.1"),
}));

import { POST } from "./route";

const VIBE_SCORES = {
  clarity_cognition: 0.8,
  mood_social: 0.6,
  visual_pattern: 0.4,
  somatic: 0.3,
  energy_direction: 0.5,
  depth_direction: 0.7,
};

function confirmed(fieldName: string) {
  return { [fieldName]: { state: "confirmed", confirmedValue: "confirmed" } };
}

function candidate(
  index: number,
  fieldVerificationStates: ProductCandidate["fieldVerificationStates"] = {}
): ProductCandidate {
  return {
    id: `tmt-product-${index}`,
    productName: `TMT Product ${index}`,
    format: "capsule",
    brandName: "The Mushroom Top",
    strainSlug: null,
    photoUrl: `https://cdn.test/product-${index}.jpg`,
    ingredients: ["ingredient one", "ingredient two"],
    flavors: ["bright"],
    onsetMinutes: 30,
    durationMinutes: 240,
    brandDoseInstructions: "Take one capsule.",
    vibeScores: VIBE_SCORES,
    strengthOffset: index === 2 ? "stronger" : "standard",
    strengthRationale: index === 2 ? "Staff note" : null,
    fieldVerificationStates,
    dose: {
      format: "capsule",
      activeCompound: "psilocybin",
      productUnitMg: 100,
      brandDoseTiers: null,
      brandMicroUnits: 1,
      brandMiniUnits: 2,
      brandMacroUnits: 5,
    },
  };
}

function request() {
  return new Request("https://tripdar.test/api/myco/recommend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      partnerSlug: "tmt",
      intents: ["focus"],
      experienceLevel: "experienced",
      intensity: "moderate",
      formatPreference: "no_preference",
    }),
  }) as unknown as NextRequest;
}

describe("POST /api/myco/recommend field verification suppression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.partner.findFirst.mockResolvedValue({
      id: "partner-tmt",
      name: "The Mushroom Top",
      mycoWelcomeMessage: null,
    });
    prismaMock.recommendationSession.create.mockResolvedValue({ sessionToken: "myco_test" });
    reflectionMock.generateReflections.mockResolvedValue([
      "Reflection 1",
      "Reflection 2",
      "Reflection 3",
      "Reflection 4",
    ]);
  });

  it("returns four products and suppresses unverified response fields", async () => {
    const doseVerifiedExceptStrength = {
      ...confirmed("activeCompound"),
      ...confirmed("doseBasis"),
      ...confirmed("productUnitMg"),
      ...confirmed("unitsPerPack"),
      ...confirmed("totalDoseMg"),
    };
    candidatesMock.getRecommendableProducts.mockResolvedValue([
      candidate(1),
      candidate(2, doseVerifiedExceptStrength),
      candidate(3),
      candidate(4),
    ]);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(4);
    expect(body.results.map((result: { productName: string }) => result.productName)).toEqual([
      "TMT Product 1",
      "TMT Product 2",
      "TMT Product 3",
      "TMT Product 4",
    ]);
    expect(body.results[0]).toMatchObject({
      ingredients: null,
      onsetMinutes: null,
      durationMinutes: null,
      doseGuidance: null,
      brandDoseInstructions: null,
    });
    expect(body.results[1].doseGuidance).toBeTruthy();
    expect(body.results[1].doseGuidance).not.toHaveProperty("offsetNote");
    expect(body.results[1].brandDoseInstructions).toBeNull();
    expect(reflectionMock.generateReflections).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ candidate: expect.objectContaining({ id: "tmt-product-1" }) }),
      ]),
      { intents: ["focus"], experienceLevel: "experienced", intensity: "moderate" }
    );
  });
});
