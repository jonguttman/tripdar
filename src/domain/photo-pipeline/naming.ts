export const PHOTO_FILENAME_TEMPLATE =
  "{sku}_{brand}_{product}_{variant}_{view}_{mode}_v{NN}.{ext}";

const UNSAFE_CHARS = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;
const REPEATED_HYPHENS = /-+/g;

export type PhotoProcessingMode = "catalog_safe" | "premium";

export interface PhotoNameParts {
  sku: string;
  brand?: string | null;
  product: string;
  variant?: string | null;
  view: string;
  mode: PhotoProcessingMode;
  version?: number;
  ext: string;
}

export function sanitizePhotoNameField(value: string | null | undefined): string {
  const sanitized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(UNSAFE_CHARS, "-")
    .replace(REPEATED_HYPHENS, "-")
    .replace(EDGE_HYPHENS, "")
    .slice(0, 60)
    .replace(EDGE_HYPHENS, "");

  return sanitized || "unknown";
}

export function normalizePhotoExtension(ext: string): string {
  const normalized = ext.trim().toLowerCase().replace(/^\./, "");
  return sanitizedExtension(normalized);
}

export function buildDeterministicPhotoFilename(parts: PhotoNameParts): string {
  const version = parts.version ?? 1;
  if (!Number.isInteger(version) || version < 1 || version > 99) {
    throw new Error("Photo filename version must be an integer from 1 to 99.");
  }

  const fields = [
    parts.sku,
    parts.brand,
    parts.product,
    parts.variant,
    parts.view,
    parts.mode,
  ].map(sanitizePhotoNameField);

  return `${fields.join("_")}_v${String(version).padStart(2, "0")}.${normalizePhotoExtension(parts.ext)}`;
}

function sanitizedExtension(ext: string): string {
  const safe = ext.replace(/[^a-z0-9]/g, "");
  if (!safe) throw new Error("Photo filename extension is required.");
  return safe;
}
