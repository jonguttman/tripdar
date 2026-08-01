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

  it("rejects accidental full-image payloads from the catalog-safe endpoint", () => {
    const result = classifyHostedEndpointPayload({
      image_base64: Buffer.from("full-image").toString("base64"),
      usage: { total_tokens: 56 },
    });

    expect(result).toBeNull();
  });

  it("runs premium only when requested and always writes a measured, human-gated artifact", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "tripdar-photo-pipeline-"));
    const inputPath = path.join(workDir, "source.png");
    const rootDir = path.join(workDir, "blob");
    const catalogSafeRootDir = path.join(workDir, "catalog-safe-blob");
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

    const common = {
      inputPath,
      ledger: "filesystem",
      sku: "NF-BM-20",
      brand: "Nocturnal Farms",
      productName: "Blue Moon",
      variant: "20mg",
      view: "front",
      operator: "qa",
    };
    const catalogSafeResult = await runSingle({ ...common, rootDir: catalogSafeRootDir });
    const catalogSafeManifest = JSON.parse(
      await readFile(path.join(repoRoot, catalogSafeResult.manifestPath), "utf8"),
    );

    delete process.env.VERCEL_AI_GATEWAY_BACKGROUND_REMOVAL_URL;
    process.env.OPENROUTER_API_KEY = "test-key";
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        choices: [{ message: { images: [{ image_url: { url: `data:image/png;base64,${generatedSubject.toString("base64")}` } }] } }],
        usage: { total_tokens: 56, cost: 0.127 },
      }),
    });

    const result = await runSingle({
      ...common,
      rootDir,
      mode: "premium",
      productFormat: "capsule bottle",
    });
    const manifest = JSON.parse(await readFile(path.join(repoRoot, result.manifestPath), "utf8"));
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(result.job.status).toBe("needs_review");
    expect(result.job.processingMode).toBe("premium");
    expect(result.job.approvedBy).toBeNull();
    expect(manifest.status).toBe("needs_review");
    expect(manifest.processing_mode).toBe("premium");
    expect(manifest.requires_review).toBe(true);
    expect(manifest.approved_by).toBeNull();
    expect(manifest.background_removal.output_kind).toBe("generative_image");
    expect(manifest.outputs.white_master).toContain("premium-enhanced/");
    expect(manifest.outputs.white_master).toContain("_premium_v01.png");
    expect(manifest.outputs.transparent_master).toBeNull();
    expect(manifest.catalog_safe_outputs.white_master).toContain("catalog-safe/");
    expect(manifest.label_fidelity_score).toBeTypeOf("number");
    expect(manifest.label_validation.score).toBe(manifest.label_fidelity_score);
    expect(manifest.label_validation.warnings).toContain(
      "label fidelity: source OCR unavailable; configure PHOTO_PIPELINE_OCR_URL or ANTHROPIC_API_KEY",
    );
    expect(result.job.costCents).toBe(13);
    expect(requestBody.messages[0].content[0].text).toContain("Studio product photograph of Blue Moon");
    expect(requestBody.messages[0].content[0].text).not.toContain("STORED ONLY, NOT EXECUTED IN MVP");
    expect(requestBody.messages[0].content[0].text).toContain("Blue Moon");
    expect(requestBody.messages[0].content[0].text).toContain("capsule bottle");
    for (const outputKey of ["transparent_master", "white_master", "web", "thumbnail"]) {
      const before = await readFile(path.join(repoRoot, catalogSafeManifest.outputs[outputKey]));
      const duringPremium = await readFile(path.join(repoRoot, manifest.catalog_safe_outputs[outputKey]));
      expect(duringPremium.equals(before), `${outputKey} changed in premium mode`).toBe(true);
    }
    expect(manifest.warnings).toContain(
      "review: AI-enhanced generative output is non-catalog-safe; human label verification required",
    );
    // This test synthesises and processes real images through sharp end-to-end.
    // It lands ~3.3s on a dev machine, which fits under vitest's 5s default but
    // exceeds it on a slower CI runner. The timeout is generous on purpose: a
    // real hang should still fail rather than stall the job.
  }, 30000);
});
