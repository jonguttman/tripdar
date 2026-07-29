/**
 * Brand portal asset intake (KEWL-2331).
 *
 * `/b/<token>` accepts file uploads from strangers holding a link, so every byte
 * here is hostile input until proven otherwise.
 *
 * Two deliberate departures from the existing `catalogUploads` path:
 *
 * 1. **The original is preserved at full resolution.** The old path re-encodes to
 *    WebP and throws the original away — a workaround for Vercel's former 4.5 MB
 *    request-body cap, which is now 100 MB. This portal collects packaging photos
 *    *because labels are ground truth for dosing*, and a downscale destroys exactly
 *    the legibility we are collecting them for. We keep the original and generate a
 *    display derivative alongside it.
 * 2. **SVG is accepted** for logos, because that is what brands have. It is also a
 *    stored-XSS vector, so it is sanitised here, stored on the blob origin (not
 *    ours), and only ever rendered via `<img src>` — never inlined.
 */

import crypto from "crypto";
import sharp from "sharp";

/** Vercel Functions accept 100 MB bodies; 40 MB is generous for a phone photo. */
export const BRAND_ASSET_MAX_BYTES = 40 * 1024 * 1024;
export const BRAND_ASSET_MAX_FILES_PER_REQUEST = 10;
/** Longest edge of the generated display derivative. Originals are untouched. */
export const BRAND_ASSET_DERIVATIVE_MAX_EDGE = 2000;
export const BRAND_ASSET_MIN_DIMENSION = 200;

export const BRAND_ASSET_KINDS = ["product_photo", "brand_logo", "brand_artwork"] as const;
export type BrandAssetKind = (typeof BRAND_ASSET_KINDS)[number];

/**
 * Kinds a brand has exactly one of. A brand has one logo and one key visual, and
 * persistence only ever kept the first of each — so the input must not accept more
 * than one and quietly orphan the rest (KEWL-2390 gap 2). Product photos are
 * genuinely many-per-product and stay unbounded here.
 */
export const SINGLETON_BRAND_ASSET_KINDS = ["brand_logo", "brand_artwork"] as const;

export function isSingletonBrandAssetKind(kind: string): boolean {
  return (SINGLETON_BRAND_ASSET_KINDS as readonly string[]).includes(kind);
}

/** Human label for a kind, for error copy the submitter actually reads. */
export const BRAND_ASSET_KIND_LABELS: Record<BrandAssetKind, string> = {
  product_photo: "product photo",
  brand_logo: "brand logo",
  brand_artwork: "brand artwork",
};

/** Mirrors `ProductPhoto.tag`. */
export const PRODUCT_PHOTO_TAGS = [
  "stock",
  "package_front",
  "package_back",
  "lifestyle",
  "other",
] as const;
export type ProductPhotoTag = (typeof PRODUCT_PHOTO_TAGS)[number];

export class BrandAssetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrandAssetError";
  }
}

export interface UploadLike {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type SniffedFormat = "jpeg" | "png" | "webp" | "heic" | "svg";

/**
 * Identify the format from the bytes themselves. The browser-supplied
 * `Content-Type` is a hint from the client and is never trusted.
 */
export function sniffImageFormat(bytes: Buffer): SniffedFormat | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }

  // WebP: "RIFF" .... "WEBP"
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }

  // HEIC/HEIF: "....ftyp" then a known brand.
  if (bytes.toString("ascii", 4, 8) === "ftyp") {
    const brand = bytes.toString("ascii", 8, 12);
    if (["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(brand)) return "heic";
  }

  // SVG is text. Allow a BOM, leading whitespace, XML prolog and comments.
  const head = bytes.toString("utf8", 0, Math.min(bytes.length, 2048)).replace(/^﻿/, "");
  if (/^\s*(?:<\?xml[^>]*\?>\s*|<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg[\s>]/i.test(head)) {
    return "svg";
  }

  return null;
}

/**
 * Conservative SVG scrubber. We have no DOMPurify in this project and adding a
 * dependency is out of scope, so this strips the known script-bearing constructs
 * rather than parsing. It is defence-in-depth, not the only defence: sanitised
 * SVGs are stored on the blob origin and rendered only through `<img src>`, which
 * does not execute script even if something slipped past.
 */
export function sanitizeSvg(source: string): string {
  let svg = source;

  // Entity declarations enable XXE / billion-laughs.
  if (/<!ENTITY/i.test(svg)) {
    throw new BrandAssetError("SVG contains entity declarations and cannot be accepted");
  }

  // Element-level removals, including unclosed variants.
  const bannedElements = [
    "script",
    "foreignObject",
    "iframe",
    "embed",
    "object",
    "audio",
    "video",
    "handler",
    "listener",
    "set",
    "animate",
    "animateTransform",
    "animateMotion",
  ];
  for (const el of bannedElements) {
    svg = svg.replace(new RegExp(`<${el}\\b[\\s\\S]*?</${el}\\s*>`, "gi"), "");
    svg = svg.replace(new RegExp(`<${el}\\b[^>]*/?>`, "gi"), "");
  }

  // Processing instructions (xml-stylesheet can pull in remote CSS).
  svg = svg.replace(/<\?(?!xml\b)[\s\S]*?\?>/gi, "");
  svg = svg.replace(/<\?xml-stylesheet[\s\S]*?\?>/gi, "");

  // Any on* event handler attribute, quoted or bare.
  svg = svg.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  svg = svg.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  svg = svg.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");

  // javascript: / vbscript: / data: in any URL-bearing attribute.
  svg = svg.replace(
    /\s(?:href|xlink:href|src|action|formaction|from|to|values|style)\s*=\s*"(?:[^"]*(?:javascript|vbscript|data)\s*:[^"]*)"/gi,
    "",
  );
  svg = svg.replace(
    /\s(?:href|xlink:href|src|action|formaction|from|to|values|style)\s*=\s*'(?:[^']*(?:javascript|vbscript|data)\s*:[^']*)'/gi,
    "",
  );

  // External references — keep same-document fragment refs (#id) only.
  svg = svg.replace(/\s(?:xlink:href|href)\s*=\s*"(?!#)[^"]*"/gi, "");
  svg = svg.replace(/\s(?:xlink:href|href)\s*=\s*'(?!#)[^']*'/gi, "");

  // CSS @import and url() pointing off-document.
  svg = svg.replace(/@import[^;]*;/gi, "");
  svg = svg.replace(/url\(\s*['"]?\s*(?:javascript|data|vbscript)\s*:[^)]*\)/gi, "none");

  if (!/<svg[\s>]/i.test(svg)) {
    throw new BrandAssetError("SVG could not be sanitised");
  }
  return svg;
}

export interface PreparedBrandAsset {
  /** Untouched bytes exactly as the brand supplied them. */
  original: { bytes: Buffer; contentType: string; extension: string };
  /** Web-friendly rendition for display. Absent when one isn't useful (SVG). */
  derivative: { bytes: Buffer; contentType: "image/webp"; extension: "webp" } | null;
  width: number | null;
  height: number | null;
  originalFilename: string;
  declaredContentType: string;
  originalSize: number;
  format: SniffedFormat;
}

const CONTENT_TYPE_BY_FORMAT: Record<SniffedFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  svg: "image/svg+xml",
};

const EXTENSION_BY_FORMAT: Record<SniffedFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  heic: "heic",
  svg: "svg",
};

/**
 * Validate one upload and produce what we intend to store.
 *
 * SVG is only permitted for brand marks — a product "photo" that is really an SVG
 * is either a mistake or an attack, and in neither case do we want it.
 */
export async function prepareBrandAsset(
  file: UploadLike,
  kind: BrandAssetKind,
): Promise<PreparedBrandAsset> {
  if (file.size > BRAND_ASSET_MAX_BYTES) {
    throw new BrandAssetError(
      `File too large. Maximum ${Math.floor(BRAND_ASSET_MAX_BYTES / (1024 * 1024))} MB`,
    );
  }
  if (file.size <= 0) throw new BrandAssetError("File is empty");

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength !== file.size) throw new BrandAssetError("Upload size mismatch");
  if (bytes.byteLength > BRAND_ASSET_MAX_BYTES) throw new BrandAssetError("File too large");

  const format = sniffImageFormat(bytes);
  if (!format) {
    throw new BrandAssetError(
      "Unsupported file. Upload a JPEG, PNG, WebP, HEIC, or (for logos) SVG",
    );
  }

  if (format === "svg") {
    if (kind === "product_photo") {
      throw new BrandAssetError("Product photos must be a real photo — JPEG, PNG, WebP or HEIC");
    }
    const sanitized = sanitizeSvg(bytes.toString("utf8"));
    return {
      original: {
        bytes: Buffer.from(sanitized, "utf8"),
        contentType: CONTENT_TYPE_BY_FORMAT.svg,
        extension: EXTENSION_BY_FORMAT.svg,
      },
      // A raster fallback keeps the review queue and any <img> consumer simple.
      derivative: await rasterizeToWebp(Buffer.from(sanitized, "utf8")),
      width: null,
      height: null,
      originalFilename: file.name,
      declaredContentType: file.type,
      originalSize: file.size,
      format,
    };
  }

  // Raster: verify it actually decodes, then derive a display copy.
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(bytes, { failOn: "error" }).metadata();
  } catch {
    throw new BrandAssetError("Uploaded file is not a readable image");
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) throw new BrandAssetError("Image dimensions could not be read");
  if (width < BRAND_ASSET_MIN_DIMENSION || height < BRAND_ASSET_MIN_DIMENSION) {
    throw new BrandAssetError(
      `Image is too small. Minimum ${BRAND_ASSET_MIN_DIMENSION}px on each side`,
    );
  }

  const derivativeBytes = await sharp(bytes, { failOn: "error" })
    .rotate()
    .resize({
      width: BRAND_ASSET_DERIVATIVE_MAX_EDGE,
      height: BRAND_ASSET_DERIVATIVE_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 86, effort: 4 })
    .toBuffer();

  return {
    original: {
      bytes,
      contentType: CONTENT_TYPE_BY_FORMAT[format],
      extension: EXTENSION_BY_FORMAT[format],
    },
    derivative: { bytes: derivativeBytes, contentType: "image/webp", extension: "webp" },
    width,
    height,
    originalFilename: file.name,
    declaredContentType: file.type,
    originalSize: file.size,
    format,
  };
}

async function rasterizeToWebp(
  svgBytes: Buffer,
): Promise<{ bytes: Buffer; contentType: "image/webp"; extension: "webp" } | null> {
  try {
    const bytes = await sharp(svgBytes, { density: 300 })
      .resize({
        width: BRAND_ASSET_DERIVATIVE_MAX_EDGE,
        height: BRAND_ASSET_DERIVATIVE_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90, effort: 4 })
      .toBuffer();
    return { bytes, contentType: "image/webp", extension: "webp" };
  } catch {
    // A logo we can't rasterise is still a logo we can store and show as SVG.
    return null;
  }
}

/**
 * Blob object key. Built entirely from server-side values — the brand id, the
 * asset kind and a random suffix — so a malicious filename cannot traverse or
 * collide. The submitted filename survives only as metadata.
 */
export function buildBrandAssetPath(input: {
  brandId: string;
  kind: BrandAssetKind;
  extension: string;
  variant: "original" | "display";
}): string {
  const safeBrand = input.brandId.replace(/[^a-zA-Z0-9_-]/g, "");
  const safeExt = input.extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const random = crypto.randomBytes(12).toString("hex");
  return `brand-portal/${safeBrand}/${input.kind}/${random}-${input.variant}.${safeExt}`;
}

// ---------------------------------------------------------------------------
// Signed upload handles
// ---------------------------------------------------------------------------

/**
 * Uploads happen before the submission exists, so the client holds a reference in
 * between. That reference is signed: the submit endpoint must be able to tell a
 * descriptor we issued from one a caller invented, otherwise anyone could attach
 * an arbitrary URL — or another brand's asset — to their own submission.
 */
export interface BrandAssetDescriptor {
  brandId: string;
  kind: BrandAssetKind;
  tag: ProductPhotoTag | null;
  catalogItemId: string | null;
  url: string;
  displayUrl: string | null;
  originalFilename: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  issuedAt: number;
}

/** Handles outlive a long form-fill but not a stale tab. */
export const BRAND_ASSET_HANDLE_TTL_MS = 24 * 60 * 60 * 1000;

function handleSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new BrandAssetError("Upload signing is not configured");
  return secret;
}

export function signBrandAssetHandle(descriptor: BrandAssetDescriptor): string {
  const payload = Buffer.from(JSON.stringify(descriptor), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", handleSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

/**
 * Verify and decode. Returns null on any failure — tampering, expiry, or a handle
 * minted for a different brand — so callers cannot accidentally treat a bad handle
 * as merely empty.
 */
export function verifyBrandAssetHandle(
  handle: string,
  expectedBrandId: string,
  now = Date.now(),
): BrandAssetDescriptor | null {
  if (typeof handle !== "string" || !handle.includes(".")) return null;
  const separator = handle.lastIndexOf(".");
  const payload = handle.slice(0, separator);
  const signature = handle.slice(separator + 1);
  if (!payload || !signature) return null;

  let expected: string;
  try {
    expected = crypto.createHmac("sha256", handleSecret()).update(payload).digest("base64url");
  } catch {
    return null;
  }

  const provided = Buffer.from(signature);
  const computed = Buffer.from(expected);
  if (provided.length !== computed.length) return null;
  if (!crypto.timingSafeEqual(provided, computed)) return null;

  let descriptor: BrandAssetDescriptor;
  try {
    descriptor = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (descriptor.brandId !== expectedBrandId) return null;
  if (!descriptor.issuedAt || now - descriptor.issuedAt > BRAND_ASSET_HANDLE_TTL_MS) return null;
  return descriptor;
}
