import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateLabelFidelity } from "./label-fidelity.mjs";

const labelRegion = { x: 0.25, y: 0.39, width: 0.5, height: 0.36 };
const originalEnv = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

async function productFixture({ product = "BLUE MOON", dosage = "20 MG", quantity = "10 CAPSULES", capWidth, bodyWidth = 310 } = {}) {
  const resolvedCapWidth = capWidth ?? bodyWidth * (250 / 310);
  const capLeft = (600 - resolvedCapWidth) / 2;
  const bodyLeft = (600 - bodyWidth) / 2;
  return sharp({
    create: { width: 600, height: 900, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: Buffer.from(`<svg width="600" height="900" xmlns="http://www.w3.org/2000/svg">
          <rect x="${capLeft}" y="70" width="${resolvedCapWidth}" height="105" rx="18" fill="#242933"/>
          <rect x="${bodyLeft}" y="155" width="${bodyWidth}" height="670" rx="54" fill="#f8f6ef" stroke="#263238" stroke-width="8"/>
          <rect x="${bodyLeft + 5}" y="350" width="${bodyWidth - 10}" height="330" rx="12" fill="#e8d89d" stroke="#263238" stroke-width="6"/>
          <text x="300" y="430" text-anchor="middle" font-family="Arial" font-size="34" font-weight="700" fill="#17242f">NOCTURNAL</text>
          <text x="300" y="500" text-anchor="middle" font-family="Arial" font-size="38" font-weight="700" fill="#245f7b">${product}</text>
          <text x="300" y="575" text-anchor="middle" font-family="Arial" font-size="34" fill="#17242f">${dosage}</text>
          <text x="300" y="630" text-anchor="middle" font-family="Arial" font-size="24" fill="#17242f">${quantity}</text>
        </svg>`),
      },
    ])
    .png()
    .toBuffer();
}

describe("REAL label fidelity validation", () => {
  it("passes an unchanged clean control", async () => {
    const source = await productFixture();
    const result = await validateLabelFidelity({
      sourceImage: source,
      premiumImage: source,
      sourceLabelRegion: labelRegion,
      premiumLabelRegion: labelRegion,
      sourceOcr: "NOCTURNAL\nBLUE MOON\n20 MG\n10 CAPSULES",
      premiumOcr: "NOCTURNAL\nBLUE MOON\n20 MG\n10 CAPSULES",
      expected: { productName: "Blue Moon", dosage: "20 mg", quantity: "10 capsules" },
    });

    expect(result.passed).toBe(true);
    expect(result.hardFlagged).toBe(false);
    expect(result.score).toBeGreaterThan(0.98);
    expect(result.signals.geometry.containerProportionsPass).toBe(true);
    expect(result.signals.geometry.capShapePass).toBe(true);
  });

  it("gives deliberately different label content a lower visual score", async () => {
    const source = await productFixture();
    const altered = await productFixture({ product: "SUN BURST", dosage: "35 MG", quantity: "30 GUMMIES" });
    const clean = await validateLabelFidelity({
      sourceImage: source,
      premiumImage: source,
      sourceLabelRegion: labelRegion,
      premiumLabelRegion: labelRegion,
    });
    const changed = await validateLabelFidelity({
      sourceImage: source,
      premiumImage: altered,
      sourceLabelRegion: labelRegion,
      premiumLabelRegion: labelRegion,
    });

    expect(changed.score).toBeLessThan(clean.score);
    expect(changed.signals.structuralSimilarity).toBeLessThan(clean.signals.structuralSimilarity);
    expect(changed.signals.perceptualSimilarity).toBeLessThan(clean.signals.perceptualSimilarity);
  });

  it("hard-flags seeded dosage corruption from a pluggable OCR provider", async () => {
    const source = await productFixture();
    const premium = await productFixture({ dosage: "200 MG" });
    const ocr = vi.fn(async ({ role }) =>
      role === "source"
        ? "NOCTURNAL\nBLUE MOON\n20 MG\n10 CAPSULES"
        : "NOCTURNAL\nBLUE MOON\n200 MG\n10 CAPSULES",
    );

    const result = await validateLabelFidelity({
      sourceImage: source,
      premiumImage: premium,
      sourceLabelRegion: labelRegion,
      premiumLabelRegion: labelRegion,
      ocr,
      expected: { productName: "Blue Moon", dosage: "20 mg", quantity: "10 capsules" },
    });

    expect(ocr).toHaveBeenCalledTimes(2);
    expect(result.hardFlagged).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.requiresReview).toBe(true);
    expect(result.criticalDeltas.some((delta) => delta.category === "dosage")).toBe(true);
  });

  it("hard-flags product name, quantity, ingredients, and warning changes", async () => {
    const image = await productFixture();
    const result = await validateLabelFidelity({
      sourceImage: image,
      premiumImage: image,
      sourceLabelRegion: labelRegion,
      premiumLabelRegion: labelRegion,
      sourceOcr: "BLUE MOON\n10 CAPSULES\nINGREDIENTS: LION'S MANE, COCOA\nWARNING: KEEP OUT OF REACH",
      premiumOcr: "BLUE MORN\n30 CAPSULES\nINGREDIENTS: LION'S MANE, COCONUT\nWARNING: SAFE FOR CHILDREN",
      expected: {
        productName: "Blue Moon",
        quantity: "10 capsules",
        ingredients: ["cocoa"],
        warnings: ["keep out of reach"],
      },
    });
    const categories = new Set(result.criticalDeltas.map((delta) => delta.category));

    expect(result.hardFlagged).toBe(true);
    expect(categories.has("product_name")).toBe(true);
    expect(categories.has("quantity")).toBe(true);
    expect(categories.has("ingredients")).toBe(true);
    expect(categories.has("warning")).toBe(true);
    expect(categories.has("number")).toBe(true);
  });

  it("checks container proportions and cap shape independently of OCR", async () => {
    const source = await productFixture();
    const alteredCap = await productFixture({ capWidth: 120 });
    const result = await validateLabelFidelity({
      sourceImage: source,
      premiumImage: alteredCap,
      sourceLabelRegion: labelRegion,
      premiumLabelRegion: labelRegion,
    });

    expect(result.signals.geometry.capShapePass).toBe(false);
    expect(result.requiresReview).toBe(true);
  });

  it("detects a changed container aspect ratio", async () => {
    const source = await productFixture();
    const narrowContainer = await productFixture({ bodyWidth: 210 });
    const result = await validateLabelFidelity({
      sourceImage: source,
      premiumImage: narrowContainer,
      sourceLabelRegion: labelRegion,
      premiumLabelRegion: labelRegion,
      sourceOcr: "BLUE MOON 20 MG 10 CAPSULES",
      premiumOcr: "BLUE MOON 20 MG 10 CAPSULES",
    });

    expect(result.signals.geometry.containerProportionsPass).toBe(false);
    expect(result.requiresReview).toBe(true);
  });

  it("supports the pipeline aliases, snake-case config, and hosted default OCR", async () => {
    const image = await productFixture();
    process.env.PHOTO_PIPELINE_OCR_URL = "https://ocr.example.test/extract";
    process.env.PHOTO_PIPELINE_OCR_API_KEY = "test-key";
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      const request = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          text: request.role === "source"
            ? "BLUE MOON\n20 MG\n10 CAPSULES"
            : "BLUE MOON\n20 MG\n10 CAPSULES",
        }),
      };
    });

    const result = await validateLabelFidelity({
      sourcePath: image,
      candidatePath: image,
      productName: "Blue Moon",
      variant: "20 mg",
      thresholds: {
        score_min_review: 0.9,
        structural_similarity_min: 0.86,
        geometry_similarity_min: 0.9,
        ocr_similarity_min: 0.92,
        label_region: { left: 0.25, top: 0.39, width: 0.5, height: 0.36 },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.passed).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.regions.source).toEqual(result.regions.premium);
  });

  it("fails closed with a warning when no default OCR provider is configured", async () => {
    const image = await productFixture();
    delete process.env.PHOTO_PIPELINE_OCR_URL;
    delete process.env.PHOTO_PIPELINE_OCR_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const result = await validateLabelFidelity({
      sourcePath: image,
      candidatePath: image,
      sourceLabelRegion: labelRegion,
      premiumLabelRegion: labelRegion,
    });

    expect(result.passed).toBe(false);
    expect(result.requiresReview).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("OCR unavailable"))).toBe(true);
    expect(result.issues).toContain("OCR comparison unavailable; label text was not verified");
  });
});
