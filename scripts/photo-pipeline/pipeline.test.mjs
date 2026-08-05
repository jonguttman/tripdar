import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

const putMock = vi.hoisted(() => vi.fn());

vi.mock("@vercel/blob", () => ({ put: putMock }));

import {
  PHOTO_ASSET_LOCAL_WARNING,
  classifyHostedEndpointPayload,
  requiresSourcePreview,
  runSingle,
  warnIfPhotoAssetsRemainLocal,
} from "./pipeline.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const originalEnv = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  putMock.mockReset();
  process.env = { ...originalEnv };
});

describe("photo pipeline hosted endpoint policy", () => {
  it("warns operators when review assets will remain local-only", () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const warn = vi.fn();

    warnIfPhotoAssetsRemainLocal({}, warn);

    expect(warn).toHaveBeenCalledWith(PHOTO_ASSET_LOCAL_WARNING);
  });

  it("does not warn when a Blob token enables hosted review asset references", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_test_token";
    const warn = vi.fn();

    warnIfPhotoAssetsRemainLocal({}, warn);

    expect(warn).not.toHaveBeenCalled();
  });

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

  it("classifies only non-browser-native supported sources for source-preview conversion", () => {
    for (const ext of [".heic", ".HEIF", ".dng", ".TIF", ".tiff"]) {
      expect(requiresSourcePreview(ext), `${ext} should require a source preview`).toBe(true);
    }
    for (const ext of [".jpg", ".JPEG", ".png"]) {
      expect(requiresSourcePreview(ext), `${ext} should keep the immutable original as source`).toBe(false);
    }
  });

  it("keeps non-browser-native originals byte-identical while writing a distinct PNG source preview", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const workDir = await mkdtemp(path.join(tmpdir(), "tripdar-photo-pipeline-"));
    const inputPath = path.join(workDir, "source.TIF");
    const rootDir = path.join(workDir, "blob");
    await sharp({
      create: { width: 1800, height: 1800, channels: 4, background: "#ece7dc" },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="1800" height="1800" xmlns="http://www.w3.org/2000/svg">
              <rect x="560" y="240" width="680" height="1260" rx="90" fill="#ffffff" stroke="#202020" stroke-width="18"/>
              <rect x="640" y="720" width="520" height="430" rx="24" fill="#f5edcf" stroke="#222" stroke-width="8"/>
              <text x="900" y="875" text-anchor="middle" font-family="Arial" font-size="82" fill="#111" font-weight="700">NOCTURNAL</text>
              <text x="900" y="1000" text-anchor="middle" font-family="Arial" font-size="66" fill="#245f7b">BLUE MOON</text>
            </svg>`,
          ),
        },
      ])
      .tiff()
      .toFile(inputPath);
    const inputBytes = await readFile(inputPath);
    const inputHash = sha256(inputBytes);

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
    const copiedOriginal = await readFile(path.join(repoRoot, result.job.originalBlobUrl));
    const sourcePreviewMeta = await sharp(path.join(repoRoot, manifest.source_preview)).metadata();

    expect(sha256(copiedOriginal)).toBe(inputHash);
    expect(result.job.originalBlobUrl).toContain("originals/");
    expect(result.job.originalBlobUrl).toMatch(/\.tif$/);
    expect(manifest.source_preview).toContain("source-previews/");
    expect(manifest.source_preview).toMatch(/\.png$/);
    expect(manifest.source_preview).not.toBe(result.job.originalBlobUrl);
    expect(sourcePreviewMeta.format).toBe("png");
  }, 30000);

  it("keeps browser-native PNG source selection unchanged", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const workDir = await mkdtemp(path.join(tmpdir(), "tripdar-photo-pipeline-"));
    const inputPath = path.join(workDir, "source.png");
    const rootDir = path.join(workDir, "blob");
    await sharp({
      create: { width: 1800, height: 1800, channels: 4, background: "#ece7dc" },
    })
      .png()
      .toFile(inputPath);

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

    expect(result.job.originalBlobUrl).toMatch(/originals\/.+\.png$/);
    expect(manifest.source_preview).toBeUndefined();
  }, 30000);

  it("fails loudly when source-preview conversion is unavailable and does not persist a fake preview", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const workDir = await mkdtemp(path.join(tmpdir(), "tripdar-photo-pipeline-"));
    const inputPath = path.join(workDir, "source.DNG");
    const rootDir = path.join(workDir, "blob");
    const originalBytes = Buffer.from("not a real dng");
    await writeFile(inputPath, originalBytes);

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
    const copiedOriginal = await readFile(path.join(repoRoot, result.job.originalBlobUrl));

    expect(result.job.status).toBe("failed");
    expect(sha256(copiedOriginal)).toBe(sha256(originalBytes));
    expect(manifest.source_preview).toBeUndefined();
    expect(manifest.outputs).toEqual({
      transparent_master: null,
      white_master: null,
      web: null,
      thumbnail: null,
    });
    expect(manifest.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Source preview conversion failed for source.DNG (DNG):"),
      ]),
    );
  });

  it("generates only a missing source preview when dedupe finds an approved non-native legacy row", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const workDir = await mkdtemp(path.join(tmpdir(), "tripdar-photo-pipeline-"));
    const inputPath = path.join(workDir, "source.tif");
    const rootDir = path.join(workDir, "blob");
    await sharp({
      create: { width: 1800, height: 1800, channels: 4, background: "#ece7dc" },
    })
      .tiff()
      .toFile(inputPath);
    const sourceContentHash = sha256(await readFile(inputPath));
    await mkdir(path.join(rootDir, "logs"), { recursive: true });
    await writeFile(
      path.join(rootDir, "logs", "photo-job-ledger.json"),
      `${JSON.stringify([
        {
          id: "tripdar-2026-legacy",
          jobId: "tripdar-2026-legacy",
          sku: "NF-BM-20",
          brand: "Nocturnal Farms",
          productName: "Blue Moon",
          variant: "20mg",
          view: "front",
          sourceFile: "source.tif",
          originalBlobUrl: "https://assets.test/original.tif",
          sourceContentHash,
          processingMode: "catalog_safe",
          status: "approved",
          qualityScore: 0.98,
          labelFidelityScore: null,
          warnings: [],
          manifest: {
            job_id: "tripdar-2026-legacy",
            sku: "NF-BM-20",
            source_file: "source.tif",
            processing_mode: "catalog_safe",
            status: "approved",
            outputs: {
              transparent_master: "https://assets.test/transparent.png",
              white_master: "https://assets.test/white.png",
              web: "https://assets.test/web.webp",
              thumbnail: "https://assets.test/thumb.webp",
            },
            quality_score: 0.98,
            label_fidelity_score: null,
            background_removal: null,
            warnings: [],
            approved_by: "qa",
            approved_at: "2026-08-01T00:00:00.000Z",
          },
          costCents: 0,
          approvedBy: "qa",
          approvedAt: "2026-08-01T00:00:00.000Z",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ], null, 2)}\n`,
    );

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

    expect(result.skipped).toBe(true);
    expect(result.sourcePreviewGenerated).toBe(true);
    expect(result.job.status).toBe("approved");
    expect(result.job.originalBlobUrl).toBe("https://assets.test/original.tif");
    expect(manifest.source_preview).toContain("source-previews/");
    expect(manifest.outputs.white_master).toBe("https://assets.test/white.png");
  }, 30000);

  it("includes a completed source preview in failed manifests", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_AI_GATEWAY_API_KEY;
    const workDir = await mkdtemp(path.join(tmpdir(), "tripdar-photo-pipeline-"));
    const inputPath = path.join(workDir, "source.tiff");
    const rootDir = path.join(workDir, "blob");
    await sharp({
      create: { width: 1800, height: 1800, channels: 4, background: "#ece7dc" },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="1800" height="1800" xmlns="http://www.w3.org/2000/svg">
              <rect x="560" y="240" width="680" height="1260" rx="90" fill="#ffffff" stroke="#202020" stroke-width="18"/>
              <rect x="640" y="720" width="520" height="430" rx="24" fill="#f5edcf" stroke="#222" stroke-width="8"/>
              <text x="900" y="875" text-anchor="middle" font-family="Arial" font-size="82" fill="#111" font-weight="700">NOCTURNAL</text>
              <text x="900" y="1000" text-anchor="middle" font-family="Arial" font-size="66" fill="#245f7b">BLUE MOON</text>
            </svg>`,
          ),
        },
      ])
      .tiff()
      .toFile(inputPath);

    const result = await runSingle({
      inputPath,
      rootDir,
      ledger: "filesystem",
      mode: "premium",
      sku: "NF-BM-20",
      brand: "Nocturnal Farms",
      productName: "Blue Moon",
      variant: "20mg",
      view: "front",
      operator: "qa",
    });
    const manifest = JSON.parse(await readFile(path.join(repoRoot, result.manifestPath), "utf8"));

    expect(result.job.status).toBe("failed");
    expect(manifest.source_preview).toContain("source-previews/");
    expect(manifest.source_preview).toMatch(/\.png$/);
    expect(manifest.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Premium generation failed:"),
      ]),
    );
  }, 30000);

  it("runs premium only when requested and always writes a measured, human-gated artifact", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
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

  it("uploads persisted review assets to Vercel Blob when a Blob token is configured", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_test_token";
    let uploadIndex = 0;
    putMock.mockImplementation(async (pathname, _body, options) => {
      uploadIndex += 1;
      return {
        url: `https://blob.test/${pathname}?mock=${uploadIndex}`,
        downloadUrl: `https://blob.test/${pathname}?download=1&mock=${uploadIndex}`,
        pathname,
        contentType: options.contentType,
        contentDisposition: "inline",
      };
    });

    const workDir = await mkdtemp(path.join(tmpdir(), "tripdar-photo-pipeline-"));
    const inputPath = path.join(workDir, "source.png");
    const rootDir = path.join(workDir, "blob");
    await sharp({
      create: { width: 1800, height: 1800, channels: 4, background: "#ece7dc" },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="1800" height="1800" xmlns="http://www.w3.org/2000/svg">
              <rect x="560" y="240" width="680" height="1260" rx="90" fill="#ffffff" stroke="#202020" stroke-width="18"/>
              <rect x="640" y="720" width="520" height="430" rx="24" fill="#f5edcf" stroke="#222" stroke-width="8"/>
              <text x="900" y="875" text-anchor="middle" font-family="Arial" font-size="82" fill="#111" font-weight="700">NOCTURNAL</text>
              <text x="900" y="1000" text-anchor="middle" font-family="Arial" font-size="66" fill="#245f7b">BLUE MOON</text>
            </svg>`,
          ),
        },
      ])
      .png()
      .toFile(inputPath);

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

    expect(result.job.originalBlobUrl).toMatch(/^https:\/\/blob\.test\/Photo_Pipeline\/originals\//);
    expect(manifest.outputs.transparent_master).toMatch(/^https:\/\/blob\.test\/Photo_Pipeline\/transparent\//);
    expect(manifest.outputs.white_master).toMatch(/^https:\/\/blob\.test\/Photo_Pipeline\/catalog-safe\//);
    expect(manifest.outputs.web).toMatch(/^https:\/\/blob\.test\/Photo_Pipeline\/web\//);
    expect(manifest.outputs.thumbnail).toMatch(/^https:\/\/blob\.test\/Photo_Pipeline\/thumbnails\//);
    expect(manifest.source_preview).toBeUndefined();
    expect(putMock).toHaveBeenCalledTimes(5);
    for (const call of putMock.mock.calls) {
      expect(call[2]).toMatchObject({ access: "public", addRandomSuffix: true });
      await expect(readFile(path.join(rootDir, call[0].replace(/^Photo_Pipeline\//, "")))).resolves.toBeInstanceOf(Buffer);
    }
  });

  it("uploads non-browser-native source previews as separate PNG Blob assets", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_test_token";
    putMock.mockImplementation(async (pathname, _body, options) => ({
      url: `https://blob.test/${pathname}`,
      downloadUrl: `https://blob.test/${pathname}?download=1`,
      pathname,
      contentType: options.contentType,
      contentDisposition: "inline",
    }));

    const workDir = await mkdtemp(path.join(tmpdir(), "tripdar-photo-pipeline-"));
    const inputPath = path.join(workDir, "source.tiff");
    const rootDir = path.join(workDir, "blob");
    await sharp({
      create: { width: 1800, height: 1800, channels: 4, background: "#ece7dc" },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="1800" height="1800" xmlns="http://www.w3.org/2000/svg">
              <rect x="560" y="240" width="680" height="1260" rx="90" fill="#ffffff" stroke="#202020" stroke-width="18"/>
              <rect x="640" y="720" width="520" height="430" rx="24" fill="#f5edcf" stroke="#222" stroke-width="8"/>
              <text x="900" y="875" text-anchor="middle" font-family="Arial" font-size="82" fill="#111" font-weight="700">NOCTURNAL</text>
              <text x="900" y="1000" text-anchor="middle" font-family="Arial" font-size="66" fill="#245f7b">BLUE MOON</text>
            </svg>`,
          ),
        },
      ])
      .tiff()
      .toFile(inputPath);

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
    const originalUpload = putMock.mock.calls.find(([pathname]) =>
      pathname.startsWith("Photo_Pipeline/originals/"),
    );
    const previewUpload = putMock.mock.calls.find(([pathname]) =>
      pathname.startsWith("Photo_Pipeline/source-previews/"),
    );

    expect(result.job.originalBlobUrl).toMatch(/^https:\/\/blob\.test\/Photo_Pipeline\/originals\/.+\.tiff$/);
    expect(manifest.source_preview).toMatch(/^https:\/\/blob\.test\/Photo_Pipeline\/source-previews\/.+\.png$/);
    expect(originalUpload?.[2]).toMatchObject({ contentType: "application/octet-stream" });
    expect(previewUpload?.[2]).toMatchObject({ contentType: "image/png" });
    expect(putMock).toHaveBeenCalledTimes(6);
  }, 30000);
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
