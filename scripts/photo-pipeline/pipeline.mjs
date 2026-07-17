import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORKER_DIR = path.dirname(fileURLToPath(import.meta.url));
const REMBG_SCRIPT = path.join(WORKER_DIR, "rembg_mask.py");
const CONFIG_ROOT = path.join(REPO_ROOT, "photo-pipeline/config");
const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".dng", ".tif", ".tiff"]);
const PREFIXES = {
  originals: "originals",
  working: "working",
  catalogSafe: "catalog-safe",
  premiumEnhanced: "premium-enhanced",
  transparent: "transparent",
  web: "web",
  thumbnails: "thumbnails",
  needsReview: "needs-review",
  rejected: "rejected",
  manifests: "manifests",
  logs: "logs",
};
const BACKGROUND_FALLBACK_WARNING = "background: hosted background removal unavailable; deterministic local mask used";
const LEGACY_BACKGROUND_FALLBACK_WARNING = "background: Vercel AI Gateway unavailable; deterministic local mask used";
const BACKGROUND_FALLBACK_REVIEW_WARNING =
  "review: local fallback background removal cannot verify catalog isolation; human review required";
const HEURISTIC_QA_REVIEW_WARNING =
  "review: Claude Vision unavailable; heuristic QA requires human catalog approval";
const GENERATIVE_REVIEW_WARNING =
  "review: AI-enhanced generative output is non-catalog-safe; human label verification required";
const REMBG_REVIEW_WARNING =
  "review: local rembg/u2net produced a catalog-safe isolation at zero cost; human catalog approval still required";

let prisma;

export async function runBatch(options) {
  const results = [];
  for (const inputPath of options.inputPaths) {
    results.push(await runSingle({ ...options, inputPath }));
  }
  return results;
}

export async function runSingle(options) {
  const configs = await loadConfigs();
  await ensureBlobDirs(options.rootDir);

  const inputPath = options.inputPath;
  const ext = path.extname(inputPath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported image type: ${inputPath}`);
  }

  const originalBytes = await readFile(inputPath);
  const sourceContentHash = createHash("sha256").update(originalBytes).digest("hex");
  const ledger = await createLedger(options);
  const existing = await ledger.findByHash(sourceContentHash);
  if (
    existing?.status === "approved" &&
    existing.processingMode === "catalog_safe" &&
    !hasBackgroundFallbackWarning(existing) &&
    !hasHeuristicQaWarning(jobWarnings(existing)) &&
    !hasGenerativeReviewWarning(jobWarnings(existing))
  ) {
    return {
      job: existing,
      manifestPath: existing.manifestPath ?? existing.manifest?.manifest_path ?? null,
      skipped: true,
    };
  }

  const jobId = existing?.jobId ?? buildJobId(sourceContentHash);
  const baseName = buildBaseName({
    sku: options.sku,
    brand: options.brand,
    productName: options.productName,
    variant: options.variant,
    view: options.view,
  });
  const originalName = `${baseName}_original_${sourceContentHash.slice(0, 12)}${normalOutputExt(ext)}`;
  const originalPath = blobPath(options.rootDir, "originals", originalName);
  const originalBlobUrl = relativeBlobPath(options.rootDir, originalPath);

  if (!existing && existsSync(originalPath)) {
    throw new Error(`Original blob already exists and must not be overwritten: ${originalBlobUrl}`);
  }
  if (!existsSync(originalPath)) {
    await copyFile(inputPath, originalPath);
  }

  let job = existing ?? (await ledger.create({
    jobId,
    sku: options.sku,
    brand: options.brand,
    productName: options.productName,
    variant: options.variant,
    view: options.view,
    sourceFile: path.basename(inputPath),
    originalBlobUrl,
    sourceContentHash,
    processingMode: "catalog_safe",
    status: "uploaded",
    qualityScore: null,
    labelFidelityScore: null,
    warnings: [],
    manifest: {},
    costCents: 0,
    approvedBy: null,
    approvedAt: null,
  }));

  const startedAt = new Date();
  const warnings = [];
  let outputs = emptyOutputs();
  let quality = null;
  let costCents = job.costCents ?? 0;

  try {
    job = await ledger.update(job.jobId, { status: "analyzing" });
    const normalizedPath = blobPath(options.rootDir, "working", `${job.jobId}_normalized.png`);
    await sharp(originalBytes).rotate().png().toFile(normalizedPath);

    quality = await assessQuality(normalizedPath, configs.thresholds);
    costCents += quality.costCents;
    warnings.push(...quality.issues, ...quality.warnings);

    if (!quality.usable) {
      outputs = await writeReviewCopy(options.rootDir, job, normalizedPath, "needsReview");
      const manifest = buildManifest(job, {
        status: "needs_review",
        outputs,
        qualityScore: quality.confidence,
        labelFidelityScore: null,
        warnings: uniqueStrings([...warnings, quality.retake_reason]),
        approvedBy: null,
        approvedAt: null,
      });
      const manifestPath = await writeManifest(options.rootDir, job.jobId, manifest);
      job = await ledger.update(job.jobId, {
        status: "needs_review",
        qualityScore: quality.confidence,
        warnings: manifest.warnings,
        manifest: { ...manifest, manifest_path: manifestPath },
        costCents,
      });
      await writeLog(options.rootDir, job.jobId, { startedAt, completedAt: new Date(), manifest });
      return { job, manifestPath };
    }

    job = await ledger.update(job.jobId, {
      status: "processing",
      qualityScore: quality.confidence,
      warnings,
      costCents,
    });

    const processed = await processCatalogSafe({
      normalizedPath,
      rootDir: options.rootDir,
      job,
      baseName,
      preset: configs.preset,
      strictGateway: options.strictGateway,
    });
    outputs = processed.outputs;
    warnings.push(...processed.warnings);
    costCents += processed.costCents;

    job = await ledger.update(job.jobId, { status: "validating", warnings, costCents });
    const validation = await validateOutputs(outputs, configs.preset);
    warnings.push(...validation.warnings);

    const usedHeuristicQa = hasHeuristicQaWarning(warnings);
    if (usedHeuristicQa) warnings.push(HEURISTIC_QA_REVIEW_WARNING);
    const requiresReview =
      quality.requires_review ||
      processed.requiresReview ||
      validation.requiresReview ||
      usedHeuristicQa ||
      quality.confidence < configs.thresholds.quality_score_min_auto_approve;
    const status = requiresReview ? "needs_review" : "approved";
    const approvedAt = status === "approved" ? new Date().toISOString() : null;
    const approvedBy = status === "approved" ? options.operator : null;

    const manifest = buildManifest(job, {
      status,
      outputs,
      qualityScore: quality.confidence,
      labelFidelityScore: processed.labelFidelityScore,
      backgroundRemoval: processed.backgroundRemoval,
      processingMode: processed.processingMode,
      warnings: uniqueStrings(warnings),
      approvedBy,
      approvedAt,
    });
    const manifestPath = await writeManifest(options.rootDir, job.jobId, manifest);
    job = await ledger.update(job.jobId, {
      status,
      processingMode: processed.processingMode,
      qualityScore: quality.confidence,
      labelFidelityScore: processed.labelFidelityScore,
      warnings: manifest.warnings,
      manifest: { ...manifest, manifest_path: manifestPath },
      costCents,
      approvedBy,
      approvedAt: approvedAt ? new Date(approvedAt) : null,
    });
    await writeLog(options.rootDir, job.jobId, { startedAt, completedAt: new Date(), manifest, validation });
    return { job, manifestPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const manifest = buildManifest(job, {
      status: "failed",
      outputs,
      qualityScore: quality?.confidence ?? null,
      labelFidelityScore: null,
      warnings: uniqueStrings([...warnings, message]),
      approvedBy: null,
      approvedAt: null,
    });
    const manifestPath = await writeManifest(options.rootDir, job.jobId, manifest);
    job = await ledger.update(job.jobId, {
      status: "failed",
      warnings: manifest.warnings,
      manifest: { ...manifest, manifest_path: manifestPath },
      costCents,
    });
    await writeLog(options.rootDir, job.jobId, { startedAt, completedAt: new Date(), error: message, manifest });
    return { job, manifestPath };
  }
}

async function loadConfigs() {
  const [preset, thresholds] = await Promise.all([
    readJson(path.join(CONFIG_ROOT, "catalog_safe_preset.v1.json")),
    readJson(path.join(CONFIG_ROOT, "thresholds.json")),
  ]);
  return { preset, thresholds };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function ensureBlobDirs(rootDir) {
  await mkdir(rootDir, { recursive: true });
  await Promise.all(Object.values(PREFIXES).map((prefix) => mkdir(path.join(rootDir, prefix), { recursive: true })));
}

async function createLedger(options) {
  const mode = options.ledger ?? (process.env.DATABASE_URL ? "prisma" : "filesystem");
  if (mode === "prisma") {
    if (!prisma) prisma = new PrismaClient();
    return {
      async findByHash(hash) {
        return prisma.photoJob.findUnique({ where: { sourceContentHash: hash } });
      },
      async create(data) {
        return prisma.photoJob.create({ data });
      },
      async update(jobId, data) {
        return prisma.photoJob.update({ where: { jobId }, data });
      },
    };
  }
  if (mode !== "filesystem") throw new Error(`Unsupported ledger mode: ${mode}`);
  const ledgerPath = path.join(options.rootDir, "logs", "photo-job-ledger.json");
  const readLedger = async () => {
    if (!existsSync(ledgerPath)) return [];
    return JSON.parse(await readFile(ledgerPath, "utf8"));
  };
  const writeLedger = async (jobs) => {
    await writeFile(ledgerPath, `${JSON.stringify(jobs, null, 2)}\n`);
  };
  return {
    async findByHash(hash) {
      return (await readLedger()).find((item) => item.sourceContentHash === hash) ?? null;
    },
    async create(data) {
      const jobs = await readLedger();
      const now = new Date().toISOString();
      const job = { id: data.jobId, ...data, createdAt: now, updatedAt: now };
      jobs.push(job);
      await writeLedger(jobs);
      return job;
    },
    async update(jobId, data) {
      const jobs = await readLedger();
      const index = jobs.findIndex((item) => item.jobId === jobId);
      if (index < 0) throw new Error(`PhotoJob not found: ${jobId}`);
      jobs[index] = { ...jobs[index], ...data, updatedAt: new Date().toISOString() };
      await writeLedger(jobs);
      return jobs[index];
    },
  };
}

async function assessQuality(imagePath, thresholds) {
  const metadata = await sharp(imagePath).metadata();
  const stats = await sharp(imagePath).greyscale().stats();
  const { data, info } = await sharp(imagePath).greyscale().raw().toBuffer({ resolveWithObject: true });
  const mean = stats.channels[0]?.mean ?? 0;
  const stdev = stats.channels[0]?.stdev ?? 0;
  const longEdge = Math.max(metadata.width ?? 0, metadata.height ?? 0);
  let clippedHighlights = 0;
  let clippedShadows = 0;
  for (const value of data) {
    if (value >= 250) clippedHighlights += 1;
    if (value <= 5) clippedShadows += 1;
  }
  const pixels = Math.max(1, info.width * info.height);
  const issues = [];
  if (longEdge < thresholds.min_long_edge_px) issues.push("retake: source resolution is too low for catalog-safe export");
  if (stdev < 18) issues.push("retake: image appears too soft or low contrast to preserve label fidelity");
  if (mean < thresholds.exposure.underexposed_mean_max) issues.push("retake: image is underexposed");
  if (mean > thresholds.exposure.overexposed_mean_min && stdev < 25) issues.push("retake: image is overexposed");
  if (clippedHighlights / pixels > thresholds.exposure.clipped_highlight_frac_max && stdev < 25) {
    issues.push("retake: highlights are clipped across too much of the image");
  }
  if (clippedShadows / pixels > thresholds.exposure.clipped_shadow_frac_max) {
    issues.push("retake: shadows are clipped across too much of the image");
  }

  const claude = await assessQualityWithClaude(imagePath);
  issues.push(...claude.issues);
  const confidence = clamp(0.25 + Math.min(stdev / 80, 0.35) + Math.min(longEdge / 3000, 0.25) + (issues.length ? -0.08 * issues.length : 0.15), 0, 1);
  const usable = issues.length === 0 && claude.usable !== false;
  return {
    usable,
    confidence: Number(confidence.toFixed(3)),
    issues: uniqueStrings(issues),
    recommended_mode: "catalog_safe",
    requires_review: !usable || confidence < thresholds.quality_score_min_auto_approve,
    retake_reason: issues[0] ?? "retake: catalog-safe quality could not be confirmed",
    costCents: claude.costCents,
    warnings: claude.warnings,
  };
}

async function assessQualityWithClaude(imagePath) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { usable: null, issues: [], warnings: ["qa: Claude vision unavailable; heuristic quality gate used"], costCents: 0 };
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const image = await readFile(imagePath);
  const response = await client.messages.create({
    model: process.env.PHOTO_PIPELINE_CLAUDE_MODEL ?? "claude-sonnet-4-20250514",
    max_tokens: 500,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Assess this product photo for catalog-safe processing. Return compact JSON only with usable, confidence, issues, recommended_mode, requires_review, retake_reason. Reject if label text/logo/dosage/warnings are unreadable or clipped.",
          },
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: image.toString("base64") },
          },
        ],
      },
    ],
  });
  const text = response.content.find((part) => part.type === "text")?.text ?? "{}";
  try {
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
    return {
      usable: parsed.usable,
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
      warnings: [],
      costCents: 2,
    };
  } catch {
    return { usable: null, issues: [], warnings: ["qa: Claude vision response was not parseable; heuristic quality gate used"], costCents: 2 };
  }
}

async function processCatalogSafe({ normalizedPath, rootDir, job, baseName, preset, strictGateway }) {
  const warnings = [];
  const gatewayRemoval = await removeBackgroundWithGateway(normalizedPath, preset);
  const processingMode = gatewayRemoval.processingMode ?? "catalog_safe";
  const isGenerativeReview = processingMode === "premium";
  if (!gatewayRemoval.usedGateway) {
    warnings.push(BACKGROUND_FALLBACK_WARNING, BACKGROUND_FALLBACK_REVIEW_WARNING);
  }
  // --strict-gateway requires a genuine hosted removal. Both the deterministic
  // fallback (!usedGateway) AND the zero-cost local rembg fallback (usedGateway
  // via local rembg) mean the hosted service was unavailable, so a strict run
  // must still surface the hosted-removal-required warning (KEWL-2011 / Codex P2).
  const usedHostedRemoval = gatewayRemoval.usedGateway && !gatewayRemoval.localRembg;
  if (strictGateway && !usedHostedRemoval) {
    warnings.push("review: hosted background removal was required but unavailable");
  }
  if (gatewayRemoval.warnings?.length) warnings.push(...gatewayRemoval.warnings);
  if (isGenerativeReview) warnings.push(GENERATIVE_REVIEW_WARNING);

  const subject = gatewayRemoval.subjectBuffer
    ? await normalizeHostedSubject(gatewayRemoval.subjectBuffer)
    : await isolateSubject(normalizedPath, gatewayRemoval.maskBuffer);
  const composed = await composeMasters(subject, preset);
  const outputModeSlug = isGenerativeReview ? "ai-enhanced" : "catalog-safe";
  const outputBaseName = `${baseName}_${sanitizeField(job.jobId)}_${outputModeSlug}_v01`;
  const transparentPath = blobPath(rootDir, "transparent", `${outputBaseName}.png`);
  const whitePath = blobPath(rootDir, isGenerativeReview ? "premiumEnhanced" : "catalogSafe", `${outputBaseName}.png`);
  const webPath = blobPath(rootDir, "web", `${outputBaseName}.webp`);
  const thumbPath = blobPath(rootDir, "thumbnails", `${outputBaseName}.webp`);

  await writeFile(transparentPath, composed.transparentPng);
  await writeFile(whitePath, composed.whitePng);
  await sharp(composed.whitePng).resize(1200, 1200).webp({ quality: preset.outputs.web.quality }).toFile(webPath);
  await sharp(composed.whitePng).resize(600, 600).webp({ quality: preset.outputs.thumbnail.quality }).toFile(thumbPath);

  return {
    outputs: {
      transparent_master: relativeBlobPath(rootDir, transparentPath),
      white_master: relativeBlobPath(rootDir, whitePath),
      web: relativeBlobPath(rootDir, webPath),
      thumbnail: relativeBlobPath(rootDir, thumbPath),
    },
    warnings,
    requiresReview: !gatewayRemoval.usedGateway || isGenerativeReview || Boolean(gatewayRemoval.requiresReview),
    labelFidelityScore: gatewayRemoval.usedGateway && !isGenerativeReview ? 0.94 : 0.82,
    costCents: gatewayRemoval.usedGateway ? gatewayRemoval.costCents : 0,
    backgroundRemoval: gatewayRemoval.service,
    processingMode,
  };
}

async function removeBackgroundWithGateway(imagePath, preset) {
  const endpoint = process.env.VERCEL_AI_GATEWAY_BACKGROUND_REMOVAL_URL;
  const key = process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_AI_GATEWAY_API_KEY ?? process.env.VERCEL_TOKEN;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const warnings = [];
  if (openRouterKey) {
    const openRouterResult = await removeBackgroundWithOpenRouter(imagePath, openRouterKey);
    if (openRouterResult.usedGateway) return openRouterResult;
    warnings.push(...openRouterResult.warnings);
  }
  if (endpoint && key) {
    const image = await readFile(imagePath);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: image.toString("base64"), output: "alpha_mask_png" }),
      });
      if (response.ok) {
        const payload = await response.json();
        const classified = classifyHostedEndpointPayload(payload);
        if (classified) return { ...classified, warnings };
        warnings.push("background: hosted endpoint response did not include mask_base64 or cutout_base64");
      } else {
        warnings.push(`background: hosted endpoint returned HTTP ${response.status}`);
      }
    } catch (error) {
      warnings.push(`background: hosted endpoint failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (key) {
    const gatewayResult = await removeBackgroundWithGatewayChat(imagePath, key);
    if (gatewayResult.usedGateway) return gatewayResult;
    warnings.push(...gatewayResult.warnings);
  } else {
    warnings.push("background: AI_GATEWAY_API_KEY or VERCEL_AI_GATEWAY_API_KEY is not configured");
  }

  // Zero-cost, catalog-safe local isolation via rembg/u2net. Preferred over the
  // naive deterministic mask (which retains the lightbox rectangle) whenever a
  // local Python + rembg runtime is available. Produces a MASK only — the worker
  // joins it to the untouched original, so label pixels are never modified.
  const localRembg = await removeBackgroundWithLocalRembg(imagePath, preset);
  if (localRembg.usedGateway) {
    return { ...localRembg, warnings: uniqueStrings([...warnings, ...localRembg.warnings]) };
  }
  warnings.push(...localRembg.warnings);

  return {
    usedGateway: false,
    maskBuffer: null,
    subjectBuffer: null,
    costCents: 0,
    warnings: uniqueStrings(warnings),
    service: hostedService("local-fallback", "deterministic-sharp-mask", 0, null),
    processingMode: "catalog_safe",
  };
}

export function rembgEnabled() {
  const flag = (process.env.PHOTO_PIPELINE_REMBG ?? "auto").toLowerCase();
  return flag !== "0" && flag !== "off" && flag !== "false" && flag !== "no";
}

export function buildRembgArgs(preset, inputPath, outputPath) {
  const mask = preset?.mask ?? {};
  const args = [
    REMBG_SCRIPT,
    "--input",
    inputPath,
    "--output",
    outputPath,
    "--model",
    String(mask.model ?? "u2net"),
    "--fg-threshold",
    String(mask.fg_threshold ?? 240),
    "--bg-threshold",
    String(mask.bg_threshold ?? 10),
    "--erode",
    String(mask.erode ?? 5),
  ];
  if (mask.alpha_matting) args.push("--alpha-matting");
  return args;
}

async function removeBackgroundWithLocalRembg(imagePath, preset) {
  if (!rembgEnabled()) {
    return { usedGateway: false, warnings: [] };
  }
  const python = process.env.PHOTO_PIPELINE_PYTHON ?? "python3";
  const maskPath = path.join(tmpdir(), `tripdar-rembg-${randomUUID()}.png`);
  const args = buildRembgArgs(preset, imagePath, maskPath);
  try {
    const { code, stderr } = await runProcess(python, args);
    if (code !== 0) {
      const detail = stderr.trim().split("\n").pop() || `exit ${code}`;
      return { usedGateway: false, warnings: [`background: local rembg/u2net unavailable (${detail})`] };
    }
    const maskBuffer = await readFile(maskPath);
    return {
      usedGateway: true,
      // Zero-cost local fallback — NOT the hosted removal service. Strict-gateway
      // runs use this marker to still surface that the hosted requirement was
      // unmet (KEWL-2011 / Codex P2).
      localRembg: true,
      maskBuffer,
      subjectBuffer: null,
      costCents: 0,
      requiresReview: true,
      warnings: [REMBG_REVIEW_WARNING],
      service: hostedService("local-rembg", String(preset?.mask?.model ?? "u2net"), 0, null),
      processingMode: "catalog_safe",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { usedGateway: false, warnings: [`background: local rembg/u2net failed: ${message}`] };
  } finally {
    await rm(maskPath, { force: true }).catch(() => {});
  }
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
  });
}

export function classifyHostedEndpointPayload(payload) {
  if (payload.mask_base64) {
    return {
      usedGateway: true,
      maskBuffer: Buffer.from(payload.mask_base64, "base64"),
      subjectBuffer: null,
      costCents: 4,
      warnings: [],
      service: hostedService("vercel-custom", "custom-background-removal", 0.04, payload.usage),
      processingMode: "catalog_safe",
    };
  }
  if (payload.cutout_base64) {
    return {
      usedGateway: true,
      maskBuffer: null,
      subjectBuffer: Buffer.from(payload.cutout_base64, "base64"),
      costCents: 4,
      warnings: [],
      service: hostedService("vercel-custom", "custom-background-removal", 0.04, payload.usage),
      processingMode: "catalog_safe",
    };
  }
  if (payload.image_base64) {
    return {
      usedGateway: true,
      maskBuffer: null,
      subjectBuffer: Buffer.from(payload.image_base64, "base64"),
      costCents: 4,
      warnings: [],
      service: hostedService("vercel-custom", "custom-background-removal", 0.04, payload.usage, "generative_image"),
      processingMode: "premium",
    };
  }
  return null;
}

async function removeBackgroundWithOpenRouter(imagePath, key) {
  const model = process.env.OPENROUTER_BACKGROUND_MODEL ?? process.env.PHOTO_PIPELINE_BACKGROUND_MODEL ?? "google/gemini-3.1-flash-image-preview";
  return removeBackgroundWithChatProvider({
    imagePath,
    key,
    provider: "openrouter",
    model,
    url: "https://openrouter.ai/api/v1/chat/completions",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "https://tripdar.local",
      "X-Title": process.env.OPENROUTER_APP_TITLE ?? "Tripdar Photo Pipeline",
    },
  });
}

async function removeBackgroundWithGatewayChat(imagePath, key) {
  const model = process.env.PHOTO_PIPELINE_BACKGROUND_MODEL ?? "google/gemini-3.1-flash-image-preview";
  return removeBackgroundWithChatProvider({
    imagePath,
    key,
    provider: "vercel-ai-gateway",
    model,
    url: "https://ai-gateway.vercel.sh/v1/chat/completions",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  });
}

async function removeBackgroundWithChatProvider({ imagePath, provider, model, url, headers }) {
  const image = await readFile(imagePath);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Remove the background only and return one PNG image with transparent background. Preserve the product exactly, including label text, logo, dosage, warnings, cap, colors, edges, and proportions. Do not repaint, redraw, retouch, add shadows, or change product pixels.",
              },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${image.toString("base64")}` },
              },
            ],
          },
        ],
        stream: false,
      }),
    });
    const responseText = await response.text();
    if (!response.ok) {
      return {
        usedGateway: false,
        maskBuffer: null,
        subjectBuffer: null,
        costCents: 0,
        warnings: [`background: ${provider} ${model} returned HTTP ${response.status}: ${summarizeGatewayError(responseText)}`],
      };
    }
    const payload = JSON.parse(responseText);
    const imageUrl = extractImageUrl(payload);
    if (typeof imageUrl === "string" && imageUrl.startsWith("data:image/")) {
      const base64 = imageUrl.slice(imageUrl.indexOf(",") + 1);
      const costUsd = extractCostUsd(payload, provider);
      return {
        usedGateway: true,
        maskBuffer: null,
        subjectBuffer: Buffer.from(base64, "base64"),
        costCents: dollarsToCents(costUsd),
        warnings: [],
        service: hostedService(provider, model, costUsd, payload.usage, "generative_image"),
        processingMode: "premium",
      };
    }
    return {
      usedGateway: false,
      maskBuffer: null,
      subjectBuffer: null,
      costCents: 0,
      warnings: [`background: ${provider} ${model} did not return an image payload`],
    };
  } catch (error) {
    return {
      usedGateway: false,
      maskBuffer: null,
      subjectBuffer: null,
      costCents: 0,
      warnings: [`background: ${provider} ${model} failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

function extractImageUrl(payload) {
  const message = payload.choices?.[0]?.message;
  const fromImages = message?.images?.[0]?.image_url?.url;
  if (typeof fromImages === "string") return fromImages;
  if (Array.isArray(message?.content)) {
    for (const part of message.content) {
      const url = part?.image_url?.url ?? part?.image?.url;
      if (typeof url === "string") return url;
    }
  }
  if (typeof message?.content === "string") {
    const match = message.content.match(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/i);
    if (match) return match[0];
  }
  return null;
}

function extractCostUsd(payload, provider) {
  const usage = payload.usage ?? {};
  const value = usage.cost_usd ?? usage.total_cost_usd ?? usage.cost ?? payload.cost_usd ?? payload.total_cost_usd;
  const number = Number(value);
  if (Number.isFinite(number)) return provider === "openrouter" && number > 1 ? number / 1_000_000 : number;
  return provider === "openrouter" ? 0 : 0.04;
}

function dollarsToCents(costUsd) {
  return Math.max(0, Math.ceil(Number(costUsd || 0) * 100));
}

function hostedService(provider, model, costUsd, usage, outputKind = "mask_or_cutout") {
  return {
    provider,
    model,
    output_kind: outputKind,
    cost_usd: Number(costUsd || 0),
    usage: usage ?? null,
  };
}

function summarizeGatewayError(responseText) {
  try {
    const payload = JSON.parse(responseText);
    return payload.error?.message ?? payload.message ?? "unparseable gateway error";
  } catch {
    return responseText.slice(0, 240);
  }
}

export async function isolateSubject(imagePath, maskBuffer) {
  const source = sharp(imagePath).rotate().removeAlpha();
  const metadata = await source.metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;
  let alpha;
  if (maskBuffer) {
    alpha = await sharp(maskBuffer).resize(width, height, { fit: "fill" }).greyscale().blur(0.4).toBuffer();
  } else {
    alpha = await buildLocalMask(imagePath, width, height);
  }
  // sharp 0.34.5 silently drops a joined alpha when .removeAlpha() and .joinChannel()
  // share one pipeline (output stays 3ch/opaque). Materialize the rotated RGB to a
  // buffer first so joinChannel applies to a fresh 3ch source and yields real 4ch RGBA. (KEWL-2011)
  const baseRgb = await sharp(imagePath).rotate().removeAlpha().png().toBuffer();
  const rgba = await cleanAlphaBoundary(await sharp(baseRgb).joinChannel(alpha).png().toBuffer());
  const bbox = await findAlphaBoundingBox(rgba);
  const left = Math.max(0, bbox.left - 8);
  const top = Math.max(0, bbox.top - 8);
  const extractWidth = Math.min(width - left, bbox.width + 16);
  const extractHeight = Math.min(height - top, bbox.height + 16);
  return sharp(rgba).extract({ left, top, width: extractWidth, height: extractHeight }).png().toBuffer();
}

async function normalizeHostedSubject(subjectBuffer) {
  const normalized = await sharp(subjectBuffer).rotate().ensureAlpha().png().toBuffer();
  const cropped = await cropToAlpha(normalized, 8);
  const { data, info } = await sharp(cropped).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaque = 0;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > 8) opaque += 1;
  }
  const opaqueFraction = opaque / Math.max(1, info.width * info.height);
  const isolated = opaqueFraction < 0.42 ? cropped : await removeEdgeConnectedLightbox(cropped);
  return cropToAlpha(await cleanAlphaBoundary(isolated), 8);
}

export async function cleanAlphaBoundary(pngBuffer) {
  const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  removeSmallAlphaComponents(data, info.width, info.height);
  decontaminateAlphaFringe(data, info.width, info.height);
  removeSmallAlphaComponents(data, info.width, info.height);
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    if (data[offset + 3] <= 5) {
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 0;
    }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

function removeSmallAlphaComponents(data, width, height) {
  const pixels = width * height;
  const visited = new Uint8Array(pixels);
  const queue = [];
  const components = [];
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const index = y * width + x;
    if (visited[index] || data[index * 4 + 3] <= 8) return false;
    visited[index] = 1;
    queue.push(index);
    return true;
  };

  for (let index = 0; index < pixels; index += 1) {
    if (visited[index] || data[index * 4 + 3] <= 8) continue;
    const start = queue.length;
    const component = [];
    const x = index % width;
    const y = Math.floor(index / width);
    enqueue(x, y);
    for (let cursor = start; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      component.push(current);
      const cx = current % width;
      const cy = Math.floor(current / width);
      enqueue(cx + 1, cy);
      enqueue(cx - 1, cy);
      enqueue(cx, cy + 1);
      enqueue(cx, cy - 1);
    }
    components.push(component);
  }

  if (components.length <= 1) return;
  const largestArea = Math.max(...components.map((component) => component.length));
  const speckThreshold = Math.max(24, Math.min(900, Math.round(largestArea * 0.0015)));
  for (const component of components) {
    if (component.length === largestArea || component.length > speckThreshold) continue;
    for (const index of component) data[index * 4 + 3] = 0;
  }
}

function decontaminateAlphaFringe(data, width, height) {
  const source = Buffer.from(data);
  const findInnerNeighbor = (x, y) => {
    for (let radius = 1; radius <= 4; radius += 1) {
      let best = null;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const offset = (ny * width + nx) * 4;
          const alpha = source[offset + 3];
          if (alpha < 245) continue;
          best = offset;
          break;
        }
        if (best !== null) break;
      }
      if (best !== null) return best;
    }
    return null;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = source[offset + 3];
      if (alpha <= 0 || alpha >= 245) continue;
      const innerOffset = findInnerNeighbor(x, y);
      if (innerOffset === null) {
        data[offset + 3] = Math.min(alpha, 48);
        continue;
      }
      data[offset] = source[innerOffset];
      data[offset + 1] = source[innerOffset + 1];
      data[offset + 2] = source[innerOffset + 2];

      const sourceMax = Math.max(source[offset], source[offset + 1], source[offset + 2]);
      const sourceMin = Math.min(source[offset], source[offset + 1], source[offset + 2]);
      const innerMax = Math.max(data[offset], data[offset + 1], data[offset + 2]);
      const innerMin = Math.min(data[offset], data[offset + 1], data[offset + 2]);
      const looksLikeLightFringe =
        (sourceMin >= 170 && sourceMax - sourceMin <= 34) || (innerMin >= 170 && innerMax - innerMin <= 34);
      if (looksLikeLightFringe) data[offset + 3] = alpha < 160 ? 0 : Math.round(alpha * 0.35);
    }
  }
}

async function cropToAlpha(pngBuffer, padding) {
  const bbox = await findAlphaBoundingBox(pngBuffer);
  const meta = await sharp(pngBuffer).metadata();
  const width = meta.width ?? bbox.width;
  const height = meta.height ?? bbox.height;
  const left = Math.max(0, bbox.left - padding);
  const top = Math.max(0, bbox.top - padding);
  const extractWidth = Math.min(width - left, bbox.width + padding * 2);
  const extractHeight = Math.min(height - top, bbox.height + padding * 2);
  return sharp(pngBuffer).extract({ left, top, width: extractWidth, height: extractHeight }).png().toBuffer();
}

async function removeEdgeConnectedLightbox(pngBuffer) {
  const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  const visited = new Uint8Array(pixels);
  const queue = [];
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return;
    const index = y * info.width + x;
    if (visited[index]) return;
    const offset = index * 4;
    if (!isGeneratedLightboxPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])) return;
    visited[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < info.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, info.height - 1);
  }
  for (let y = 1; y < info.height - 1; y += 1) {
    enqueue(0, y);
    enqueue(info.width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % info.width;
    const y = Math.floor(index / info.width);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  for (let index = 0; index < pixels; index += 1) {
    if (visited[index]) data[index * 4 + 3] = 0;
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

function isGeneratedLightboxPixel(r, g, b, alpha) {
  if (alpha <= 8) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return min >= 182 && max - min <= 28;
}

async function buildLocalMask(imagePath, width, height) {
  const { data, info } = await sharp(imagePath).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = Buffer.alloc(width * height);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * info.channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const distanceFromWhite = 255 - Math.min(r, g, b);
    alpha[index] = distanceFromWhite > 18 || max - min > 24 ? 255 : 0;
  }
  return sharp(alpha, { raw: { width, height, channels: 1 } }).median(3).blur(0.8).png().toBuffer();
}

async function findAlphaBoundingBox(pngBuffer) {
  const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (minX > maxX || minY > maxY) return { left: 0, top: 0, width: info.width, height: info.height };
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function composeMasters(subjectBuffer, preset) {
  const canvas = preset.outputs.transparent_master.width;
  const targetHeight = Math.round(canvas * preset.composition.product_height_target_ratio);
  const subjectMeta = await sharp(subjectBuffer).metadata();
  const scale = Math.min(targetHeight / (subjectMeta.height ?? targetHeight), (canvas * 0.86) / (subjectMeta.width ?? canvas));
  const width = Math.max(1, Math.round((subjectMeta.width ?? 1) * scale));
  const height = Math.max(1, Math.round((subjectMeta.height ?? 1) * scale));
  const left = Math.round((canvas - width) / 2);
  const top = Math.round((canvas - height) / 2 - canvas * 0.015);
  const resizedSubject = await sharp(subjectBuffer)
    .resize(width, height, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();

  const transparentPng = await sharp({
    create: { width: canvas, height: canvas, channels: 4, background: "#00000000" },
  })
    .composite([{ input: resizedSubject, left, top }])
    .png()
    .toBuffer();

  const shadow = await buildShadow(resizedSubject, Math.round(width * 1.06), Math.round(canvas * 0.05), preset.shadow.opacity);
  const whitePng = await sharp({
    create: { width: canvas, height: canvas, channels: 4, background: preset.background_hex },
  })
    .composite([
      {
        input: shadow,
        left: Math.round((canvas - Math.round(width * 1.06)) / 2),
        top: Math.min(canvas - Math.round(canvas * 0.12), top + height - Math.round(canvas * 0.025)),
      },
      { input: resizedSubject, left, top },
    ])
    .png()
    .toBuffer();

  return { transparentPng, whitePng };
}

async function buildShadow(subjectBuffer, width, height, opacity) {
  const meta = await sharp(subjectBuffer).metadata();
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="${width / 2}" cy="${height / 2}" rx="${width * 0.42}" ry="${height * 0.22}" fill="rgba(0,0,0,${opacity})"/></svg>`;
  return sharp(Buffer.from(svg))
    .blur(Math.max(12, Math.round((meta.width ?? width) * 0.015)))
    .png()
    .toBuffer();
}

async function validateOutputs(outputs, preset) {
  const warnings = [];
  const checks = [
    ["transparent_master", preset.outputs.transparent_master],
    ["white_master", preset.outputs.white_master],
    ["web", preset.outputs.web],
    ["thumbnail", preset.outputs.thumbnail],
  ];
  for (const [key, expected] of checks) {
    const output = outputs[key];
    if (!output) {
      warnings.push(`validation: missing ${key}`);
      continue;
    }
    const meta = await sharp(path.join(REPO_ROOT, output)).metadata();
    if (meta.width !== expected.width || meta.height !== expected.height) {
      warnings.push(`validation: ${key} has ${meta.width}x${meta.height}, expected ${expected.width}x${expected.height}`);
    }
    if (key === "transparent_master") {
      const alpha = await inspectAlphaCoverage(path.join(REPO_ROOT, output));
      if (alpha.nonTransparentFraction > 0.35) {
        warnings.push("validation: transparent_master alpha coverage is too large; possible opaque lightbox rectangle");
      }
    }
  }
  return { warnings, requiresReview: warnings.length > 0 };
}

async function inspectAlphaCoverage(imagePath) {
  const { data, info } = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let nonTransparent = 0;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > 8) nonTransparent += 1;
  }
  return { nonTransparentFraction: nonTransparent / Math.max(1, info.width * info.height) };
}

async function writeReviewCopy(rootDir, job, normalizedPath, stage) {
  const reviewPath = blobPath(rootDir, stage, `${job.jobId}_review.png`);
  await copyFile(normalizedPath, reviewPath);
  return { ...emptyOutputs(), white_master: relativeBlobPath(rootDir, reviewPath) };
}

function buildManifest(job, data) {
  return {
    job_id: job.jobId,
    sku: job.sku,
    source_file: job.sourceFile,
    processing_mode: data.processingMode ?? job.processingMode ?? "catalog_safe",
    status: data.status,
    outputs: data.outputs,
    quality_score: data.qualityScore,
    label_fidelity_score: data.labelFidelityScore,
    background_removal: data.backgroundRemoval ?? null,
    warnings: data.warnings,
    approved_by: data.approvedBy,
    approved_at: data.approvedAt,
  };
}

async function writeManifest(rootDir, jobId, manifest) {
  const manifestPath = blobPath(rootDir, "manifests", `${sanitizeField(jobId)}.json`);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return relativeBlobPath(rootDir, manifestPath);
}

async function writeLog(rootDir, jobId, payload) {
  const logPath = blobPath(rootDir, "logs", `${sanitizeField(jobId)}.json`);
  await writeFile(logPath, `${JSON.stringify(payload, null, 2)}\n`);
}

export async function writeRunProof(filePath, results) {
  const proof = [];
  for (const result of results) {
    const manifest = result.manifestPath ? JSON.parse(await readFile(path.join(REPO_ROOT, result.manifestPath), "utf8")) : null;
    const outputStats = {};
    if (manifest) {
      for (const [key, output] of Object.entries(manifest.outputs)) {
        if (!output) continue;
        const meta = await sharp(path.join(REPO_ROOT, output)).metadata();
        const fileStat = await stat(path.join(REPO_ROOT, output));
        outputStats[key] = { width: meta.width, height: meta.height, format: meta.format, bytes: fileStat.size };
      }
    }
    proof.push({
      job_id: result.job.jobId,
      status: result.job.status,
      skipped: Boolean(result.skipped),
      quality_score: result.job.qualityScore,
      cost_cents: result.job.costCents,
      processing_mode: manifest?.processing_mode ?? result.job.processingMode,
      background_removal: manifest?.background_removal ?? null,
      manifest_path: result.manifestPath,
      outputs: outputStats,
      warnings: manifest?.warnings ?? result.job.warnings,
    });
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ generated_at: new Date().toISOString(), results: proof }, null, 2)}\n`);
}

function buildJobId(hash) {
  return `tripdar-${new Date().getUTCFullYear()}-${hash.slice(0, 10)}`;
}

function buildBaseName(parts) {
  return [
    parts.sku,
    parts.brand,
    parts.productName,
    parts.variant,
    parts.view,
  ].map(sanitizeField).join("_");
}

function sanitizeField(value) {
  const sanitized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  return sanitized || "unknown";
}

function normalOutputExt(ext) {
  if (ext === ".jpeg") return ".jpg";
  return ext;
}

function blobPath(rootDir, stage, filename) {
  return path.join(rootDir, PREFIXES[stage], filename);
}

function relativeBlobPath(rootDir, fullPath) {
  return path.relative(REPO_ROOT, fullPath).split(path.sep).join("/");
}

function emptyOutputs() {
  return { transparent_master: null, white_master: null, web: null, thumbnail: null };
}

function hasBackgroundFallbackWarning(job) {
  const warnings = jobWarnings(job);
  return warnings.includes(BACKGROUND_FALLBACK_WARNING) || warnings.includes(LEGACY_BACKGROUND_FALLBACK_WARNING);
}

function jobWarnings(job) {
  return [
    ...(Array.isArray(job.warnings) ? job.warnings : []),
    ...(Array.isArray(job.manifest?.warnings) ? job.manifest.warnings : []),
  ];
}

function hasHeuristicQaWarning(warnings) {
  return warnings.some((warning) => warning.startsWith("qa: Claude vision") && warning.includes("heuristic quality gate used"));
}

function hasGenerativeReviewWarning(warnings) {
  return warnings.some((warning) => warning === GENERATIVE_REVIEW_WARNING || warning.includes("AI-enhanced generative output"));
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
