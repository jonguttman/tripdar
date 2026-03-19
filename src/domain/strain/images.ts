/**
 * Strain Image Utilities
 *
 * Shared logic for matching strain names to image blobs in Vercel Blob storage.
 */

interface BlobObject {
  pathname: string;
  url: string;
}

/**
 * Find the image URL for a strain by fuzzy-matching its name against blob filenames.
 * Tries exact match first, then falls back to partial match.
 */
export function findStrainImageUrl(
  strainName: string,
  imageBlobs: BlobObject[]
): string | null {
  const normalizedStrainName = strainName.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Exact match first
  const exactMatch = imageBlobs.find((blob) => {
    const filename = blob.pathname
      .replace("Strain_Graphics/", "")
      .replace(/\.(png|jpg|jpeg|webp|gif)$/i, "");
    const normalizedFilename = filename.toLowerCase().replace(/[^a-z0-9]/g, "");
    return normalizedFilename === normalizedStrainName;
  });

  if (exactMatch) return exactMatch.url;

  // Fall back to partial match
  const partialMatch = imageBlobs.find((blob) => {
    const filename = blob.pathname
      .replace("Strain_Graphics/", "")
      .replace(/\.(png|jpg|jpeg|webp|gif)$/i, "");
    const normalizedFilename = filename.toLowerCase().replace(/[^a-z0-9]/g, "");
    return normalizedStrainName.includes(normalizedFilename);
  });

  return partialMatch?.url ?? null;
}

/**
 * Filter blob list to only actual image files under Strain_Graphics/
 */
export function filterImageBlobs(blobs: BlobObject[]): BlobObject[] {
  return blobs.filter(
    (blob) =>
      blob.pathname &&
      !blob.pathname.endsWith("/") &&
      /\.(png|jpg|jpeg|webp|gif)$/i.test(blob.pathname)
  );
}
