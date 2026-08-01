import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

const DEFAULT_THRESHOLDS = Object.freeze({
  minimumScore: 0.82,
  minimumStructuralSimilarity: 0.72,
  maximumContainerAspectDelta: 0.12,
  maximumCapShapeDelta: 0.18,
  minimumGeometrySimilarity: 0.8,
  minimumOcrSimilarity: 0.88,
});

const DOSE_UNITS = "mg|mcg|ug|µg|g|ml";
const QUANTITY_UNITS = "capsules?|caps?|tablets?|tabs?|gummies?|pieces?|pcs?|servings?|doses?|count|ct";

/**
 * Compare the label and package geometry in a source photo and a premium output.
 *
 * `sourceImage` and `premiumImage` may be paths or Buffers. Label regions use
 * normalized coordinates by default (`{ x, y, width, height }` in the 0..1
 * range); set `units: "pixels"` for pixel coordinates. If omitted, the central
 * label area is inferred from the detected product bounds.
 *
 * OCR is deliberately pluggable. Callers may supply `sourceOcr`/`premiumOcr`,
 * or `ocr({ role, image, region, labelImage })`. OCR contributes only 10% of
 * the score, but changes to critical label facts always force review.
 */
export async function validateLabelFidelity({
  sourceImage,
  premiumImage,
  sourcePath,
  candidatePath,
  sourceLabelRegion,
  premiumLabelRegion,
  sourceOcr,
  premiumOcr,
  ocr,
  expected = {},
  productName,
  variant,
  thresholds = {},
} = {}) {
  sourceImage ??= sourcePath;
  premiumImage ??= candidatePath;
  if (!sourceImage || !premiumImage) {
    throw new TypeError("sourceImage/sourcePath and premiumImage/candidatePath are required");
  }

  const policy = normalizeThresholds(thresholds);
  const configuredRegion = policy.labelRegion;
  const criticalExpected = {
    ...expected,
    productName: expected.productName ?? productName,
    dosage: expected.dosage ?? variant,
  };
  const [source, premium] = await Promise.all([
    inspectImage(sourceImage, sourceLabelRegion ?? configuredRegion),
    inspectImage(premiumImage, premiumLabelRegion ?? configuredRegion),
  ]);

  const extractor = typeof ocr === "function" ? ocr : defaultOcr;
  const [resolvedSourceOcr, resolvedPremiumOcr] = await Promise.all([
    resolveOcr({ supplied: sourceOcr, ocr: extractor, role: "source", image: sourceImage, inspected: source }),
    resolveOcr({ supplied: premiumOcr, ocr: extractor, role: "premium", image: premiumImage, inspected: premium }),
  ]);

  const structuralSimilarity = compareStructure(source.labelPixels, premium.labelPixels);
  const perceptualSimilarity = comparePerception(source.labelPixels, premium.labelPixels);
  const geometry = compareGeometry(source.geometry, premium.geometry, policy);
  const ocrComparison = compareOcr(resolvedSourceOcr, resolvedPremiumOcr);
  const criticalDeltas = findCriticalDeltas(resolvedSourceOcr.text, resolvedPremiumOcr.text, criticalExpected);

  const weightedSignals = [
    [structuralSimilarity, 0.5],
    [perceptualSimilarity, 0.25],
    [geometry.similarity, 0.15],
  ];
  if (ocrComparison.available) weightedSignals.push([ocrComparison.similarity, 0.1]);
  const totalWeight = weightedSignals.reduce((sum, [, weight]) => sum + weight, 0);
  const score = weightedSignals.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight;
  const hardFlagged = criticalDeltas.length > 0;
  const issues = [];

  if (hardFlagged) issues.push("critical label text changed");
  if (structuralSimilarity < policy.minimumStructuralSimilarity) issues.push("label structure changed beyond threshold");
  if (!geometry.containerProportionsPass) issues.push("container proportions changed beyond threshold");
  if (!geometry.capShapePass) issues.push("cap shape changed beyond threshold");
  if (geometry.similarity < policy.minimumGeometrySimilarity) issues.push("package geometry similarity is below threshold");
  if (!ocrComparison.available) issues.push("OCR comparison unavailable; label text was not verified");
  if (ocrComparison.available && ocrComparison.similarity < policy.minimumOcrSimilarity) {
    issues.push("OCR label similarity is below threshold");
  }
  if (score < policy.minimumScore) issues.push("label fidelity score is below threshold");

  const warnings = unique([
    ...resolvedSourceOcr.warnings,
    ...resolvedPremiumOcr.warnings,
    ...issues.map((issue) => `label fidelity: ${issue}`),
  ]);

  const roundedScore = round(score);
  return {
    score: roundedScore,
    passed: !hardFlagged && issues.length === 0,
    hardFlagged,
    requiresReview: hardFlagged || issues.length > 0,
    criticalDeltas,
    issues,
    warnings,
    signals: {
      structuralSimilarity: round(structuralSimilarity),
      perceptualSimilarity: round(perceptualSimilarity),
      ocrSimilarity: ocrComparison.available ? round(ocrComparison.similarity) : null,
      geometry,
    },
    regions: {
      source: source.region,
      premium: premium.region,
    },
  };
}

async function inspectImage(image, requestedRegion) {
  const base = sharp(image, { failOn: "error" }).rotate();
  const metadata = await base.metadata();
  if (!metadata.width || !metadata.height) throw new Error("could not determine image dimensions");

  const geometry = await inspectGeometry(image);
  const region = resolveRegion(requestedRegion, metadata, geometry.bounds);
  const labelImage = await sharp(image)
    .rotate()
    .extract(region)
    .resize(128, 128, { fit: "fill" })
    .png()
    .toBuffer();
  const labelPixels = await sharp(labelImage)
    .greyscale()
    .normalize()
    .raw()
    .toBuffer();

  return { geometry, region, labelImage, labelPixels: Uint8Array.from(labelPixels) };
}

function resolveRegion(requested, metadata, subjectBounds) {
  const width = metadata.width;
  const height = metadata.height;
  let raw;
  if (requested) {
    const relativeToSubject = requested.relativeTo === "subject";
    const base = relativeToSubject ? subjectBounds : { left: 0, top: 0, width, height };
    const normalized = requested.units !== "pixels";
    const x = requested.x ?? requested.left;
    const y = requested.y ?? requested.top;
    if (![x, y, requested.width, requested.height].every(Number.isFinite)) {
      throw new TypeError("label region requires finite x/left, y/top, width, and height values");
    }
    raw = {
      left: base.left + (normalized ? x * base.width : x),
      top: base.top + (normalized ? y * base.height : y),
      width: normalized ? requested.width * base.width : requested.width,
      height: normalized ? requested.height * base.height : requested.height,
    };
  } else {
    raw = {
      left: subjectBounds.left + subjectBounds.width * 0.12,
      top: subjectBounds.top + subjectBounds.height * 0.3,
      width: subjectBounds.width * 0.76,
      height: subjectBounds.height * 0.55,
    };
  }

  const left = clamp(Math.round(raw.left), 0, width - 1);
  const top = clamp(Math.round(raw.top), 0, height - 1);
  return {
    left,
    top,
    width: clamp(Math.round(raw.width), 1, width - left),
    height: clamp(Math.round(raw.height), 1, height - top),
  };
}

async function inspectGeometry(image) {
  const sampleSize = 192;
  const { data, info } = await sharp(image)
    .rotate()
    .resize(sampleSize, sampleSize, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const background = cornerMedian(data, info.width, info.height);
  const mask = new Uint8Array(info.width * info.height);
  let foregroundCount = 0;

  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const offset = pixel * 4;
    const alpha = data[offset + 3];
    const distance = Math.sqrt(
      (data[offset] - background[0]) ** 2 +
        (data[offset + 1] - background[1]) ** 2 +
        (data[offset + 2] - background[2]) ** 2,
    );
    const foreground = alpha > 16 && (alpha < 250 || distance > 30);
    mask[pixel] = foreground ? 1 : 0;
    if (foreground) foregroundCount += 1;
  }

  let bounds = maskBounds(mask, info.width, info.height);
  const fraction = foregroundCount / mask.length;
  if (!bounds || fraction < 0.01 || fraction > 0.9) {
    bounds = { left: 0, top: 0, width: info.width, height: info.height };
  }

  const profile = widthProfile(mask, info.width, info.height, bounds);
  const bodyWidths = profile.slice(Math.floor(profile.length * 0.35), Math.ceil(profile.length * 0.8));
  const capWidths = profile.slice(0, Math.max(2, Math.ceil(profile.length * 0.18)));
  const bodyWidth = Math.max(0.001, median(bodyWidths.filter((value) => value > 0)) || 1);
  const capWidth = median(capWidths.filter((value) => value > 0)) || bodyWidth;
  const originalMetadata = await sharp(image).rotate().metadata();
  const scaleX = (originalMetadata.width ?? info.width) / info.width;
  const scaleY = (originalMetadata.height ?? info.height) / info.height;

  return {
    bounds: {
      left: Math.round(bounds.left * scaleX),
      top: Math.round(bounds.top * scaleY),
      width: Math.max(1, Math.round(bounds.width * scaleX)),
      height: Math.max(1, Math.round(bounds.height * scaleY)),
    },
    containerAspectRatio: bounds.width / Math.max(1, bounds.height),
    capToBodyRatio: capWidth / bodyWidth,
    widthProfile: profile,
  };
}

function cornerMedian(data, width, height) {
  const values = [[], [], []];
  const sample = Math.max(2, Math.floor(Math.min(width, height) * 0.08));
  const corners = [
    [0, 0],
    [width - sample, 0],
    [0, height - sample],
    [width - sample, height - sample],
  ];
  for (const [startX, startY] of corners) {
    for (let y = startY; y < startY + sample; y += 1) {
      for (let x = startX; x < startX + sample; x += 1) {
        const offset = (y * width + x) * 4;
        for (let channel = 0; channel < 3; channel += 1) values[channel].push(data[offset + channel]);
      }
    }
  }
  return values.map((channel) => median(channel));
}

function maskBounds(mask, width, height) {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function widthProfile(mask, imageWidth, imageHeight, bounds) {
  const bins = 24;
  const profile = [];
  for (let bin = 0; bin < bins; bin += 1) {
    const y = clamp(bounds.top + Math.floor(((bin + 0.5) / bins) * bounds.height), 0, imageHeight - 1);
    let first = imageWidth;
    let last = -1;
    for (let x = bounds.left; x < bounds.left + bounds.width; x += 1) {
      if (!mask[y * imageWidth + x]) continue;
      first = Math.min(first, x);
      last = Math.max(last, x);
    }
    profile.push(last >= first ? (last - first + 1) / bounds.width : 0);
  }
  return profile;
}

function compareStructure(source, premium) {
  const sourceEdges = sobel(source, 128, 128);
  const premiumEdges = sobel(premium, 128, 128);
  let edgeDifference = 0;
  let luminanceDifference = 0;
  for (let index = 0; index < source.length; index += 1) {
    edgeDifference += Math.abs(sourceEdges[index] - premiumEdges[index]);
    luminanceDifference += Math.abs(source[index] - premium[index]);
  }
  const edgeSimilarity = 1 - edgeDifference / (source.length * 255);
  const luminanceSimilarity = 1 - luminanceDifference / (source.length * 255);
  return clamp(edgeSimilarity * 0.72 + luminanceSimilarity * 0.28, 0, 1);
}

function comparePerception(source, premium) {
  const hashSimilarity = 1 - hamming(differenceHash(source), differenceHash(premium)) / 64;
  const sourceGrid = gridAverages(source, 128, 128, 16);
  const premiumGrid = gridAverages(premium, 128, 128, 16);
  let gridDifference = 0;
  for (let index = 0; index < sourceGrid.length; index += 1) {
    gridDifference += Math.abs(sourceGrid[index] - premiumGrid[index]);
  }
  const gridSimilarity = 1 - gridDifference / (sourceGrid.length * 255);
  return clamp(hashSimilarity * 0.55 + gridSimilarity * 0.45, 0, 1);
}

function sobel(pixels, width, height) {
  const result = new Uint8Array(pixels.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const gx =
        -pixels[index - width - 1] + pixels[index - width + 1] -
        2 * pixels[index - 1] + 2 * pixels[index + 1] -
        pixels[index + width - 1] + pixels[index + width + 1];
      const gy =
        -pixels[index - width - 1] - 2 * pixels[index - width] - pixels[index - width + 1] +
        pixels[index + width - 1] + 2 * pixels[index + width] + pixels[index + width + 1];
      result[index] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
    }
  }
  return result;
}

function differenceHash(pixels) {
  const horizontal = gridAverages(pixels, 128, 128, 9, 8);
  const bits = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) bits.push(horizontal[y * 9 + x] > horizontal[y * 9 + x + 1]);
  }
  return bits;
}

function gridAverages(pixels, width, height, columns, rows = columns) {
  const averages = [];
  for (let row = 0; row < rows; row += 1) {
    const yStart = Math.floor((row / rows) * height);
    const yEnd = Math.floor(((row + 1) / rows) * height);
    for (let column = 0; column < columns; column += 1) {
      const xStart = Math.floor((column / columns) * width);
      const xEnd = Math.floor(((column + 1) / columns) * width);
      let sum = 0;
      let count = 0;
      for (let y = yStart; y < yEnd; y += 1) {
        for (let x = xStart; x < xEnd; x += 1) {
          sum += pixels[y * width + x];
          count += 1;
        }
      }
      averages.push(sum / Math.max(1, count));
    }
  }
  return averages;
}

function hamming(left, right) {
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) distance += 1;
  return distance;
}

function compareGeometry(source, premium, thresholds) {
  const containerAspectDelta = relativeDelta(source.containerAspectRatio, premium.containerAspectRatio);
  const capShapeDelta = relativeDelta(source.capToBodyRatio, premium.capToBodyRatio);
  const count = Math.min(source.widthProfile.length, premium.widthProfile.length);
  let profileDelta = 0;
  for (let index = 0; index < count; index += 1) {
    profileDelta += Math.abs(source.widthProfile[index] - premium.widthProfile[index]);
  }
  profileDelta /= Math.max(1, count);
  const similarity = clamp(1 - containerAspectDelta * 1.8 - capShapeDelta * 1.2 - profileDelta * 0.7, 0, 1);
  return {
    similarity: round(similarity),
    containerAspectDelta: round(containerAspectDelta),
    capShapeDelta: round(capShapeDelta),
    widthProfileDelta: round(profileDelta),
    containerProportionsPass: containerAspectDelta <= thresholds.maximumContainerAspectDelta,
    capShapePass: capShapeDelta <= thresholds.maximumCapShapeDelta,
  };
}

async function resolveOcr({ supplied, ocr, role, image, inspected }) {
  try {
    let payload = supplied;
    if (payload == null && typeof ocr === "function") {
      payload = await ocr({ role, image, region: inspected.region, labelImage: inspected.labelImage });
    }
    return normalizeOcr(payload);
  } catch (error) {
    return {
      available: false,
      text: "",
      tokens: [],
      warnings: [`label fidelity: ${role} OCR failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

function normalizeOcr(payload) {
  if (payload == null) return { available: false, text: "", tokens: [], warnings: [] };
  const rawText = Array.isArray(payload)
    ? payload.map((item) => (typeof item === "string" ? item : item?.text ?? "")).join(" ")
    : typeof payload === "object"
      ? payload.text ?? payload.lines?.join("\n") ?? payload.tokens?.map((item) => item.text ?? item).join(" ") ?? ""
      : String(payload);
  const text = String(rawText).split(/\r?\n/u).map(normalizeText).filter(Boolean).join("\n");
  const tokenText = normalizeText(text);
  const payloadWarnings = typeof payload === "object" ? list(payload.warnings ?? payload.warning) : [];
  return { available: tokenText.length > 0, text, tokens: tokenText.split(" ").filter(Boolean), warnings: payloadWarnings };
}

async function defaultOcr({ role, labelImage }) {
  const endpoint = process.env.PHOTO_PIPELINE_OCR_URL;
  const endpointKey = process.env.PHOTO_PIPELINE_OCR_API_KEY ?? process.env.AI_GATEWAY_API_KEY;
  if (endpoint && endpointKey) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${endpointKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: labelImage.toString("base64"), role }),
    });
    if (!response.ok) throw new Error(`hosted OCR returned HTTP ${response.status}`);
    const payload = await response.json();
    return { text: payload.text ?? payload.ocr_text ?? payload.result?.text ?? "" };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: process.env.PHOTO_PIPELINE_OCR_MODEL ?? "claude-sonnet-4-20250514",
      max_tokens: 800,
      temperature: 0,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: "Transcribe every visible product-label character exactly. Preserve line breaks. Do not explain, correct, infer, or format the text.",
          },
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: labelImage.toString("base64") },
          },
        ],
      }],
    });
    return { text: response.content.filter((part) => part.type === "text").map((part) => part.text).join("\n") };
  }

  return {
    text: "",
    warning: `label fidelity: ${role} OCR unavailable; configure PHOTO_PIPELINE_OCR_URL or ANTHROPIC_API_KEY`,
  };
}

function compareOcr(source, premium) {
  if (!source.available || !premium.available) return { available: false, similarity: null };
  const sourceCounts = tokenCounts(source.tokens);
  const premiumCounts = tokenCounts(premium.tokens);
  const tokens = new Set([...sourceCounts.keys(), ...premiumCounts.keys()]);
  let intersection = 0;
  let union = 0;
  for (const token of tokens) {
    intersection += Math.min(sourceCounts.get(token) ?? 0, premiumCounts.get(token) ?? 0);
    union += Math.max(sourceCounts.get(token) ?? 0, premiumCounts.get(token) ?? 0);
  }
  return { available: true, similarity: union ? intersection / union : 1 };
}

function tokenCounts(tokens) {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

function findCriticalDeltas(sourceText, premiumText, expected) {
  if (!sourceText || !premiumText) return [];
  const deltas = [];
  compareFactSets("dosage", extractMatches(sourceText, new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s*(?:${DOSE_UNITS})\\b`, "giu")), extractMatches(premiumText, new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s*(?:${DOSE_UNITS})\\b`, "giu")), deltas);
  compareFactSets("quantity", extractMatches(sourceText, new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s*(?:${QUANTITY_UNITS})\\b`, "giu")), extractMatches(premiumText, new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s*(?:${QUANTITY_UNITS})\\b`, "giu")), deltas);
  compareFactSets("number", extractMatches(sourceText, /\b\d+(?:[.,]\d+)?\b/gu), extractMatches(premiumText, /\b\d+(?:[.,]\d+)?\b/gu), deltas);
  compareCriticalLines("ingredients", sourceText, premiumText, /\bingredients?\b/iu, deltas);
  compareCriticalLines("warning", sourceText, premiumText, /\b(?:warning|warnings|caution|danger|keep out|do not)\b/iu, deltas);

  const productNames = list(expected.productNames ?? expected.productName);
  const dosages = list(expected.dosages ?? expected.dosage);
  const quantities = list(expected.quantities ?? expected.quantity);
  const ingredients = list(expected.ingredients);
  const warnings = list(expected.warnings ?? expected.warning);
  compareExpected("product_name", productNames, sourceText, premiumText, deltas);
  compareExpected("dosage", dosages, sourceText, premiumText, deltas);
  compareExpected("quantity", quantities, sourceText, premiumText, deltas);
  compareExpected("ingredients", ingredients, sourceText, premiumText, deltas);
  compareExpected("warning", warnings, sourceText, premiumText, deltas);

  return dedupeDeltas(deltas);
}

function compareFactSets(category, sourceValues, premiumValues, deltas) {
  if (sameSet(sourceValues, premiumValues)) return;
  deltas.push({ category, source: sourceValues, premium: premiumValues, reason: `${category} value changed` });
}

function compareCriticalLines(category, source, premium, matcher, deltas) {
  const sourceLines = source.split("\n").filter((line) => matcher.test(line));
  const premiumLines = premium.split("\n").filter((line) => matcher.test(line));
  if (!sourceLines.length && !premiumLines.length) return;
  if (!sameSet(sourceLines, premiumLines)) {
    deltas.push({ category, source: sourceLines, premium: premiumLines, reason: `${category} text changed` });
  }
}

function compareExpected(category, values, source, premium, deltas) {
  for (const value of values.map(normalizeText).filter(Boolean)) {
    if (source.includes(value) && !premium.includes(value)) {
      deltas.push({ category, source: [value], premium: [], reason: `expected ${category} changed or disappeared` });
    }
  }
}

function extractMatches(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => normalizeText(match[0])).sort();
}

function normalizeText(value) {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}.µ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function dedupeDeltas(deltas) {
  const seen = new Set();
  return deltas.filter((delta) => {
    const key = `${delta.category}:${JSON.stringify(delta.source)}:${JSON.stringify(delta.premium)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function list(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function normalizeThresholds(thresholds) {
  return {
    ...DEFAULT_THRESHOLDS,
    ...thresholds,
    minimumScore: thresholds.minimumScore ?? thresholds.score_min_review ?? DEFAULT_THRESHOLDS.minimumScore,
    minimumStructuralSimilarity:
      thresholds.minimumStructuralSimilarity ??
      thresholds.structural_similarity_min ??
      DEFAULT_THRESHOLDS.minimumStructuralSimilarity,
    minimumGeometrySimilarity:
      thresholds.minimumGeometrySimilarity ??
      thresholds.geometry_similarity_min ??
      DEFAULT_THRESHOLDS.minimumGeometrySimilarity,
    minimumOcrSimilarity:
      thresholds.minimumOcrSimilarity ?? thresholds.ocr_similarity_min ?? DEFAULT_THRESHOLDS.minimumOcrSimilarity,
    labelRegion: thresholds.labelRegion ?? thresholds.label_region,
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function relativeDelta(left, right) {
  return Math.abs(left - right) / Math.max(0.001, Math.abs(left), Math.abs(right));
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value) {
  return Number(value.toFixed(4));
}
