import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyHostedEndpointPayload, runSingle } from "./pipeline.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const originalEnv = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

describe("photo pipeline hosted endpoint policy", () => {
  it("keeps mask and cutout endpoint payloads in catalog-safe mode", () => {
    const mask = classifyHostedEndpointPayload({
      mask_base64: Buffer.from("mask").toString("base64"),
      usage: { total_tokens: 12 },
    });
    const cutout = classifyHostedEndpointPayload({
      cutout_base64: Buffer.from("cutout").toString("base64"),
      usage: { total_tokens: 34 },
    });

    expect(mask?.processingMode).toBe("catalog_safe");
    expect(mask?.service.output_kind).toBe("mask_or_cutout");
    expect(mask?.maskBuffer?.toString()).toBe("mask");
    expect(mask?.subjectBuffer).toBeNull();
    expect(cutout?.processingMode).toBe("catalog_safe");
    expect(cutout?.service.output_kind).toBe("mask_or_cutout");
    expect(cutout?.subjectBuffer?.toString()).toBe("cutout");
  });

  it("classifies full image payloads as premium review artifacts", () => {
    const result = classifyHostedEndpointPayload({
      image_base64: Buffer.from("full-image").toString("base64"),
      usage: { total_tokens: 56 },
    });

    expect(result?.processingMode).toBe("premium");
    expect(result?.service.output_kind).toBe("generative_image");
    expect(result?.subjectBuffer?.toString()).toBe("full-image");
    expect(result?.maskBuffer).toBeNull();
  });

  it("forces generated full-image runs into AI-enhanced needs-review outputs", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "tripdar-photo-pipeline-"));
    const inputPath = path.join(workDir, "source.png");
    const rootDir = path.join(workDir, "blob");
    const generatedSubject = await sharp({
      create: { width: 1000, height: 1400, channels: 4, background: "#00000000" },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="1000" height="1400" xmlns="http://www.w3.org/2000/svg">
              <rect x="250" y="120" width="500" height="1120" rx="80" fill="#ffffff" stroke="#202020" stroke-width="18"/>
              <rect x="310" y="560" width="380" height="360" rx="20" fill="#f5edcf" stroke="#222" stroke-width="8"/>
              <text x="500" y="700" text-anchor="middle" font-family="Arial" font-size="62" fill="#111" font-weight="700">NOCTURNAL</text>
              <text x="500" y="800" text-anchor="middle" font-family="Arial" font-size="50" fill="#245f7b">BLUE MOON</text>
            </svg>`,
          ),
        },
      ])
      .png()
      .toBuffer();

    await sharp({
      create: { width: 1800, height: 1800, channels: 4, background: "#ece7dc" },
    })
      .composite([{ input: generatedSubject, left: 400, top: 160 }])
      .png()
      .toFile(inputPath);

    process.env.VERCEL_AI_GATEWAY_BACKGROUND_REMOVAL_URL = "https://example.test/remove-background";
    process.env.AI_GATEWAY_API_KEY = "test-key";
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        image_base64: generatedSubject.toString("base64"),
        usage: { total_tokens: 56 },
      }),
    });

    const result = await runSingle({
      inputPath,
      rootDir,
      ledger: "filesystem",
      sku: "NF-BM-20",
      brand: "Nocturnal Farms",
      productName: "Blue Moon",
      variant: "20mg",
      view: "front",
      operator: "qa",
    });
    const manifest = JSON.parse(await readFile(path.join(repoRoot, result.manifestPath), "utf8"));

    expect(result.job.status).toBe("needs_review");
    expect(result.job.processingMode).toBe("premium");
    expect(result.job.approvedBy).toBeNull();
    expect(manifest.status).toBe("needs_review");
    expect(manifest.processing_mode).toBe("premium");
    expect(manifest.approved_by).toBeNull();
    expect(manifest.background_removal.output_kind).toBe("generative_image");
    expect(manifest.outputs.white_master).toContain("premium-enhanced/");
    expect(manifest.outputs.white_master).toContain("_ai-enhanced_v01.png");
    expect(manifest.outputs.transparent_master).toContain("_ai-enhanced_v01.png");
    expect(manifest.warnings).toContain(
      "review: AI-enhanced generative output is non-catalog-safe; human label verification required",
    );
  });
});
