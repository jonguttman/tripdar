import sharp from "sharp";

export const BRAND_UPLOAD_MAX_FILES = 6;
export const BRAND_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const BRAND_UPLOAD_MIN_DIMENSION = 320;
export const BRAND_UPLOAD_MAX_DIMENSION = 6000;

export type BrandUploadMime = "image/jpeg" | "image/png" | "image/webp";

export interface UploadLike {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ValidatedBrandImage {
  bytes: Buffer;
  contentType: "image/webp";
  width: number;
  height: number;
  originalFilename: string;
  originalContentType: string;
  originalSize: number;
}

export function validateBrandUploadCount(count: number, maxFiles = BRAND_UPLOAD_MAX_FILES) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("At least one image is required");
  }
  if (count > maxFiles) {
    throw new Error(`Too many images. Maximum ${maxFiles}`);
  }
}

function assertAllowedDeclaredType(type: string): asserts type is BrandUploadMime {
  if (type !== "image/jpeg" && type !== "image/png" && type !== "image/webp") {
    throw new Error("Invalid image type. Allowed: JPEG, PNG, WebP");
  }
}

function assertDimensions(width: number | undefined, height: number | undefined) {
  if (!width || !height) {
    throw new Error("Image dimensions could not be read");
  }
  if (width < BRAND_UPLOAD_MIN_DIMENSION || height < BRAND_UPLOAD_MIN_DIMENSION) {
    throw new Error(`Image is too small. Minimum ${BRAND_UPLOAD_MIN_DIMENSION}px per side`);
  }
  if (width > BRAND_UPLOAD_MAX_DIMENSION || height > BRAND_UPLOAD_MAX_DIMENSION) {
    throw new Error(`Image is too large. Maximum ${BRAND_UPLOAD_MAX_DIMENSION}px per side`);
  }
}

export async function validateAndReencodeBrandImage(file: UploadLike): Promise<ValidatedBrandImage> {
  assertAllowedDeclaredType(file.type);
  if (file.size > BRAND_UPLOAD_MAX_BYTES) {
    throw new Error("File too large. Maximum 5MB");
  }

  const input = Buffer.from(await file.arrayBuffer());
  if (input.byteLength !== file.size) {
    throw new Error("Upload size mismatch");
  }

  const image = sharp(input, { failOn: "warning" }).rotate();
  const metadata = await image.metadata();
  if (metadata.format !== "jpeg" && metadata.format !== "png" && metadata.format !== "webp") {
    throw new Error("Uploaded file is not a supported image");
  }
  assertDimensions(metadata.width, metadata.height);

  const bytes = await image.webp({ quality: 88, effort: 4 }).toBuffer();

  return {
    bytes,
    contentType: "image/webp",
    width: metadata.width,
    height: metadata.height,
    originalFilename: file.name,
    originalContentType: file.type,
    originalSize: file.size,
  };
}

export function assertBrandScopedProduct(input: {
  tokenBrandId: string | null | undefined;
  productBrandId: string | null | undefined;
}) {
  if (!input.tokenBrandId || !input.productBrandId || input.tokenBrandId !== input.productBrandId) {
    throw new Error("Product is not available for this brand token");
  }
}
