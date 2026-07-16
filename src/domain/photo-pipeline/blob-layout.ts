import { buildDeterministicPhotoFilename, type PhotoNameParts } from "./naming";

export const PHOTO_BLOB_ROOT = "tripdar-product-images" as const;

export const PHOTO_BLOB_PREFIXES = {
  incoming: `${PHOTO_BLOB_ROOT}/incoming/`,
  originals: `${PHOTO_BLOB_ROOT}/originals/`,
  working: `${PHOTO_BLOB_ROOT}/working/`,
  catalogSafe: `${PHOTO_BLOB_ROOT}/catalog-safe/`,
  transparent: `${PHOTO_BLOB_ROOT}/transparent/`,
  web: `${PHOTO_BLOB_ROOT}/web/`,
  thumbnails: `${PHOTO_BLOB_ROOT}/thumbnails/`,
  needsReview: `${PHOTO_BLOB_ROOT}/needs-review/`,
  rejected: `${PHOTO_BLOB_ROOT}/rejected/`,
  manifests: `${PHOTO_BLOB_ROOT}/manifests/`,
  logs: `${PHOTO_BLOB_ROOT}/logs/`,
} as const;

export type PhotoBlobStage = keyof typeof PHOTO_BLOB_PREFIXES;

export function buildPhotoBlobPath(stage: PhotoBlobStage, filename: string): string {
  if (filename.includes("/") || filename.includes("\\")) {
    throw new Error("Photo blob filename must not contain path separators.");
  }

  return `${PHOTO_BLOB_PREFIXES[stage]}${filename}`;
}

export function buildOriginalBlobPath(parts: PhotoNameParts): string {
  return buildPhotoBlobPath("originals", buildDeterministicPhotoFilename(parts));
}

export function buildManifestBlobPath(jobId: string): string {
  const safeJobId = jobId.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!safeJobId) throw new Error("Manifest job id is required.");
  return buildPhotoBlobPath("manifests", `${safeJobId}.json`);
}

export function assertOriginalBlobIsNew(
  pathname: string,
  existingOriginalPathnames: Iterable<string>,
): void {
  for (const existing of existingOriginalPathnames) {
    if (existing === pathname) {
      throw new Error(`Original blob already exists and must not be overwritten: ${pathname}`);
    }
  }
}
