import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRembgArgs, classifyHostedEndpointPayload, rembgEnabled, runSingle } from "./pipeline.mjs";

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

describe("local rembg/u2net catalog-safe path", () => {
  it("maps the locked preset mask config to rembg CLI args", () => {
    const preset = {
      mask: { model: "u2net", alpha_matting: true, fg_threshold: 240, bg_threshold: 10, erode: 5 },
    };
    const args = buildRembgArgs(preset, "/in.png", "/out.png");
    expect(args).toContain("--input");
    expect(args).toContain("/in.png");
    expect(args).toContain("--output");
    expect(args).toContain("/out.png");
    expect(args[args.indexOf("--model") + 1]).toBe("u2net");
    expect(args[args.indexOf("--fg-threshold") + 1]).toBe("240");
    expect(args[args.indexOf("--bg-threshold") + 1]).toBe("10");
    expect(args[args.indexOf("--erode") + 1]).toBe("5");
    expect(args).toContain("--alpha-matting");
  });

  it("omits --alpha-matting and defaults model to u2net when preset is sparse", () => {
    const args = buildRembgArgs({ mask: {} }, "/in.png", "/out.png");
    expect(args).not.toContain("--alpha-matting");
    expect(args[args.indexOf("--model") + 1]).toBe("u2net");
  });

  it("honors the PHOTO_PIPELINE_REMBG opt-out flag", () => {
    delete process.env.PHOTO_PIPELINE_REMBG;
    expect(rembgEnabled()).toBe(true);
    process.env.PHOTO_PIPELINE_REMBG = "0";
    expect(rembgEnabled()).toBe(false);
    process.env.PHOTO_PIPELINE_REMBG = "off";
    expect(rembgEnabled()).toBe(false);
    process.env.PHOTO_PIPELINE_REMBG = "1";
    expect(rembgEnabled()).toBe(true);
  });

  it("uses the zero-cost local mask (no lightbox rectangle) when no paid provider is configured", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "tripdar-rembg-wire-"));
    const inputPath = path.join(workDir, "source.png");
    const rootDir = path.join(workDir, "blob");
    const maskSourcePath = path.join(workDir, "mask.png");
    const stubPath = path.join(workDir, "stub-python.sh");

    // A product-shaped silhouette on a black field — a real isolation, NOT the
    // whole lightbox rectangle. Coverage stays well under the 0.35 review gate.
    await sharp({ create: { width: 1000, height: 1400, channels: 3, background: "#000000" } })
      .composite([
        {
          input: Buffer.from(
            `<svg width="1000" height="1400" xmlns="http://www.w3.org/2000/svg">
              <rect x="410" y="250" width="180" height="900" rx="50" fill="#ffffff"/>
            </svg>`,
          ),
        },
      ])
      .png()
      .toFile(maskSourcePath);

    await sharp({ create: { width: 1800, height: 1800, channels: 3, background: "#ece7dc" } })
      .composite([
        {
          input: Buffer.from(
            `<svg width="1800" height="1800" xmlns="http://www.w3.org/2000/svg">
              <rect x="700" y="350" width="400" height="1100" rx="70" fill="#f5edcf" stroke="#202020" stroke-width="16"/>
            </svg>`,
          ),
        },
      ])
      .png()
      .toFile(inputPath);

    // Stub interpreter that stands in for `python3 rembg_mask.py …`: it locates
    // the --output arg and drops our controlled mask there, exit 0.
    await writeFile(
      stubPath,
      `#!/bin/sh
out=""
while [ $# -gt 0 ]; do
  if [ "$1" = "--output" ]; then out="$2"; fi
  shift
done
cp "${maskSourcePath}" "$out"
exit 0
`,
    );
    await chmod(stubPath, 0o755);

    delete process.env.OPENROUTER_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_AI_GATEWAY_BACKGROUND_REMOVAL_URL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.PHOTO_PIPELINE_REMBG;
    process.env.PHOTO_PIPELINE_PYTHON = stubPath;

    const result = await runSingle({
      inputPath,
      rootDir,
      ledger: "filesystem",
      sku: "RB-U2-01",
      brand: "Rembg Labs",
      productName: "U2Net",
      variant: "1g",
      view: "front",
      operator: "qa",
    });
    const manifest = JSON.parse(await readFile(path.join(repoRoot, result.manifestPath), "utf8"));

    expect(manifest.background_removal.provider).toBe("local-rembg");
    expect(manifest.background_removal.model).toBe("u2net");
    expect(manifest.background_removal.cost_usd).toBe(0);
    expect(manifest.processing_mode).toBe("catalog_safe");
    // Real isolation → NOT the deterministic lightbox fallback.
    expect(manifest.warnings).not.toContain(
      "background: hosted background removal unavailable; deterministic local mask used",
    );
    // Catalog-safe real-removal fidelity score, not the 0.82 fallback score.
    expect(manifest.label_fidelity_score).toBe(0.94);
    // Zero-cost isolation still requires a human catalog approval.
    expect(manifest.status).toBe("needs_review");
    expect(manifest.warnings).toContain(
      "review: local rembg/u2net produced a catalog-safe isolation at zero cost; human catalog approval still required",
    );
  });

  it("falls back to the deterministic mask when the local rembg runtime is missing", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "tripdar-rembg-miss-"));
    const inputPath = path.join(workDir, "source.png");
    const rootDir = path.join(workDir, "blob");

    await sharp({ create: { width: 1400, height: 1400, channels: 3, background: "#ece7dc" } })
      .composite([
        {
          input: Buffer.from(
            `<svg width="1400" height="1400" xmlns="http://www.w3.org/2000/svg">
              <rect x="560" y="300" width="280" height="800" rx="40" fill="#f5edcf" stroke="#202020" stroke-width="12"/>
            </svg>`,
          ),
        },
      ])
      .png()
      .toFile(inputPath);

    delete process.env.OPENROUTER_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_AI_GATEWAY_BACKGROUND_REMOVAL_URL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.PHOTO_PIPELINE_REMBG;
    // Point at a non-existent interpreter so the rembg attempt fails gracefully.
    process.env.PHOTO_PIPELINE_PYTHON = path.join(workDir, "does-not-exist-python");

    const result = await runSingle({
      inputPath,
      rootDir,
      ledger: "filesystem",
      sku: "RB-FB-01",
      brand: "Rembg Labs",
      productName: "Fallback",
      variant: "1g",
      view: "front",
      operator: "qa",
    });
    const manifest = JSON.parse(await readFile(path.join(repoRoot, result.manifestPath), "utf8"));

    expect(manifest.background_removal.provider).toBe("local-fallback");
    expect(manifest.status).toBe("needs_review");
    expect(manifest.warnings).toContain(
      "background: hosted background removal unavailable; deterministic local mask used",
    );
  });
});
