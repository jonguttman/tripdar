import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

const SUPPORTED_IMAGE = /\.(jpe?g|png|heic|heif|dng|tiff?)$/i;
const DEFAULT_MODEL = "claude-sonnet-4-6";
const MIN_AUTO_CONFIDENCE = 0.85;

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function slug(value, fallback) {
  const result = clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return result || fallback;
}

function identityFamily(identity) {
  return [clean(identity.brand), clean(identity.product)].map((part) => part.toLowerCase()).join("::");
}

function parseJsonResponse(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(candidate);
}

export async function listImageFiles(inputDir) {
  const entries = await readdir(inputDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && SUPPORTED_IMAGE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export function normalizeGroupingAnalysis(raw, inputNames) {
  if (!raw || !Array.isArray(raw.groups) || !Array.isArray(raw.unassigned)) {
    throw new Error("Grouping analysis must contain groups and unassigned arrays");
  }
  const allowed = new Set(inputNames);
  const seen = new Map(inputNames.map((name) => [name, 0]));

  const groupIds = new Set();
  const groups = raw.groups.map((group, index) => {
    const identity = {
      brand: clean(group.identity?.brand) || null,
      product: clean(group.identity?.product) || null,
      variant: clean(group.identity?.variant) || null,
    };
    const fallbackId = `group-${String(index + 1).padStart(2, "0")}`;
    const id = slug(clean(group.id) || [identity.brand, identity.product, identity.variant].filter(Boolean).join("-"), fallbackId);
    if (groupIds.has(id)) throw new Error(`Grouping analysis contains duplicate group id: ${id}`);
    groupIds.add(id);
    if (!Array.isArray(group.files) || group.files.length === 0) {
      throw new Error(`Group ${id} has no files`);
    }
    const files = group.files.map((file) => {
      const name = clean(file.name);
      if (!allowed.has(name) || path.basename(name) !== name) throw new Error(`Unknown or unsafe source file: ${name}`);
      seen.set(name, (seen.get(name) ?? 0) + 1);
      return { name, view: clean(file.view) || "unknown" };
    });
    return {
      id,
      identity,
      confidence: Number.isFinite(Number(group.confidence)) ? Number(group.confidence) : 0,
      files,
      evidence: Array.isArray(group.evidence) ? group.evidence.map(clean).filter(Boolean) : [],
    };
  });

  const unassigned = raw.unassigned.map((item) => {
    const name = clean(item.name);
    if (!allowed.has(name) || path.basename(name) !== name) throw new Error(`Unknown or unsafe source file: ${name}`);
    seen.set(name, (seen.get(name) ?? 0) + 1);
    return {
      name,
      reason: clean(item.reason) || "Package identity needs human confirmation",
      confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0,
    };
  });

  const badCoverage = [...seen.entries()].filter(([, count]) => count !== 1);
  if (badCoverage.length) {
    throw new Error(`Every input image must appear exactly once; invalid coverage: ${badCoverage.map(([name, count]) => `${name}=${count}`).join(", ")}`);
  }

  const confirmations = [];
  const families = new Map();
  for (const group of groups) {
    const family = identityFamily(group.identity);
    if (family !== "::") families.set(family, [...(families.get(family) ?? []), group]);
    if (group.confidence < MIN_AUTO_CONFIDENCE || !group.identity.product) {
      confirmations.push({
        reason: "low_identity_confidence",
        groupIds: [group.id],
        message: `Confirm package identity for ${group.id} before running the worker.`,
      });
    }
  }
  for (const familyGroups of families.values()) {
    if (familyGroups.length < 2) continue;
    const variants = new Set(familyGroups.map((group) => group.identity.variant ?? "unknown"));
    if (variants.size > 1) {
      confirmations.push({
        reason: "near_identical_variant",
        groupIds: familyGroups.map((group) => group.id).sort(),
        message: "Confirm these look-alike packages are separate variants; do not merge by color or artwork alone.",
      });
    }
  }

  return {
    version: 1,
    groups: groups.sort((a, b) => a.id.localeCompare(b.id)),
    unassigned: unassigned.sort((a, b) => a.name.localeCompare(b.name)),
    confirmations,
  };
}

export async function analyzeMixedFolder({ inputDir, model = DEFAULT_MODEL }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required for visible-package auto-grouping");
  }
  const names = await listImageFiles(inputDir);
  if (!names.length) throw new Error(`No supported images found in ${inputDir}`);
  if (names.length > 20) {
    throw new Error("Auto-group accepts at most 20 images per review batch so every package can be compared together");
  }

  const content = [{
    type: "text",
    text: `Group these product-package photos by exact visible package identity. Multiple angles of the same exact package belong together. Keep different flavor, dose, weight, count, recipe, UPC, or printed variant in separate groups. Never merge on color/artwork alone. If identity is unreadable or ambiguous, put the file in unassigned. Return JSON only with this schema: {"groups":[{"id":"slug","identity":{"brand":"","product":"","variant":"printed differentiators or empty"},"confidence":0.0,"files":[{"name":"exact filename","view":"front|back|side|top|unknown"}],"evidence":["visible text"]}],"unassigned":[{"name":"exact filename","reason":"","confidence":0.0}]}. Every filename must appear exactly once.`,
  }];

  for (const name of names) {
    const jpeg = await sharp(path.join(inputDir, name)).rotate().resize({ width: 1400, height: 1400, fit: "inside" }).jpeg({ quality: 82 }).toBuffer();
    content.push({ type: "text", text: `FILE: ${name}` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model,
    max_tokens: 2500,
    temperature: 0,
    messages: [{ role: "user", content }],
  });
  const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
  return normalizeGroupingAnalysis(parseJsonResponse(text), names);
}

async function ensureEmptyOutput(outputDir) {
  try {
    const entries = await readdir(outputDir);
    if (entries.length) throw new Error(`Output directory must be empty: ${outputDir}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(outputDir, { recursive: true });
}

export async function materializeGrouping({ inputDir, outputDir, analysis }) {
  const resolvedInput = path.resolve(inputDir);
  const resolvedOutput = path.resolve(outputDir);
  if (resolvedOutput === resolvedInput || resolvedOutput.startsWith(`${resolvedInput}${path.sep}`)) {
    throw new Error("Output directory must be outside the immutable raw input directory");
  }
  const names = await listImageFiles(resolvedInput);
  const normalized = normalizeGroupingAnalysis(analysis, names);
  await ensureEmptyOutput(resolvedOutput);

  const sourceFiles = [];
  for (const name of names) {
    const sourcePath = path.join(resolvedInput, name);
    const bytes = await readFile(sourcePath);
    sourceFiles.push({ name, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: (await stat(sourcePath)).size });
  }

  for (const group of normalized.groups) {
    const groupDir = path.join(resolvedOutput, "groups", group.id);
    await mkdir(groupDir, { recursive: true });
    for (const file of group.files) {
      await copyFile(path.join(resolvedInput, file.name), path.join(groupDir, file.name), fsConstants.COPYFILE_EXCL);
    }
  }
  const reviewDir = path.join(resolvedOutput, "needs-confirmation");
  await mkdir(reviewDir, { recursive: true });
  for (const item of normalized.unassigned) {
    await copyFile(path.join(resolvedInput, item.name), path.join(reviewDir, item.name), fsConstants.COPYFILE_EXCL);
  }

  const manifest = {
    created_at: new Date().toISOString(),
    source_dir: resolvedInput,
    source_immutable: true,
    source_files: sourceFiles,
    groups: normalized.groups,
    unassigned: normalized.unassigned,
    confirmations: normalized.confirmations,
    ready_for_worker: normalized.unassigned.length === 0 && normalized.confirmations.length === 0,
    next_step: "Confirm every flagged group, then run photo:pipeline batch once per confirmed group with explicit --sku and --product metadata.",
  };
  const manifestPath = path.join(resolvedOutput, "grouping-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return { manifestPath, manifest };
}

export async function groupMixedFolder({ inputDir, outputDir, analysisFile, model }) {
  const analysis = analysisFile
    ? normalizeGroupingAnalysis(JSON.parse(await readFile(analysisFile, "utf8")), await listImageFiles(inputDir))
    : await analyzeMixedFolder({ inputDir, model });
  return materializeGrouping({ inputDir, outputDir, analysis });
}
