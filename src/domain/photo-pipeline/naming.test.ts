import { describe, expect, it } from "vitest";

import {
  assertOriginalBlobIsNew,
  buildDeterministicPhotoFilename,
  buildPhotoBlobPath,
  buildManifestBlobPath,
  buildOriginalBlobPath,
  sanitizePhotoNameField,
} from ".";

describe("photo pipeline naming", () => {
  it("sanitizes product metadata into deterministic filename fields", () => {
    expect(sanitizePhotoNameField("  Crème Brûlée / 10mg! ")).toBe("creme-brulee-10mg");
    expect(sanitizePhotoNameField("")).toBe("unknown");
  });

  it("builds catalog-safe filenames without random suffixes", () => {
    expect(
      buildDeterministicPhotoFilename({
        sku: "SKU 001",
        brand: "Tripdar Labs",
        product: "Golden Teacher Gummies",
        variant: "Mango 10mg",
        view: "Front",
        mode: "catalog_safe",
        version: 1,
        ext: ".webp",
      }),
    ).toBe("sku-001_tripdar-labs_golden-teacher-gummies_mango-10mg_front_catalog-safe_v01.webp");
  });

  it("places originals and manifests under the locked Blob prefixes", () => {
    expect(
      buildOriginalBlobPath({
        sku: "SKU 001",
        brand: "Tripdar Labs",
        product: "Golden Teacher Gummies",
        variant: "Mango 10mg",
        view: "Front",
        mode: "catalog_safe",
        ext: "png",
      }),
    ).toBe(
      "tripdar-product-images/originals/sku-001_tripdar-labs_golden-teacher-gummies_mango-10mg_front_catalog-safe_v01.png",
    );

    expect(buildManifestBlobPath("tripdar-2026-000124")).toBe(
      "tripdar-product-images/manifests/tripdar-2026-000124.json",
    );
  });

  it("fails closed when an original pathname already exists", () => {
    const pathname =
      "tripdar-product-images/originals/sku-001_tripdar-labs_golden-teacher-gummies_mango-10mg_front_catalog-safe_v01.png";

    expect(() => assertOriginalBlobIsNew(pathname, [pathname])).toThrow("must not be overwritten");
  });

  it("rejects blob filenames with path separators", () => {
    expect(() => buildPhotoBlobPath("web", "../escape.webp")).toThrow("path separators");
    expect(() => buildPhotoBlobPath("web", "nested/name.webp")).toThrow("path separators");
  });
});
