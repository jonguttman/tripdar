import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  assertBrandScopedProduct,
  validateAndReencodeBrandImage,
  validateBrandUploadCount,
  type UploadLike,
} from "./catalogUploads";

function uploadLike(input: { bytes: Buffer; type: string; name?: string }): UploadLike {
  return {
    name: input.name ?? "upload.bin",
    type: input.type,
    size: input.bytes.byteLength,
    async arrayBuffer() {
      const copy = new Uint8Array(input.bytes.byteLength);
      copy.set(input.bytes);
      return copy.buffer;
    },
  };
}

describe("catalog upload validation", () => {
  it("re-encodes valid images to webp", async () => {
    const bytes = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 3,
        background: "#ffffff",
      },
    })
      .jpeg()
      .toBuffer();

    const validated = await validateAndReencodeBrandImage(uploadLike({ bytes, type: "image/jpeg" }));

    expect(validated.contentType).toBe("image/webp");
    expect(validated.width).toBe(400);
    expect(validated.height).toBe(400);
    await expect(sharp(validated.bytes).metadata()).resolves.toMatchObject({ format: "webp" });
  });

  it("rejects hostile uploads before blob storage", async () => {
    const fake = Buffer.from("not an image");

    await expect(
      validateAndReencodeBrandImage(uploadLike({ bytes: fake, type: "image/jpeg" }))
    ).rejects.toThrow();
    await expect(
      validateAndReencodeBrandImage(uploadLike({ bytes: fake, type: "application/pdf" }))
    ).rejects.toThrow("Invalid image type");
    expect(() => validateBrandUploadCount(7, 6)).toThrow("Too many images");
  });

  it("blocks cross-brand product ids before writes", () => {
    expect(() =>
      assertBrandScopedProduct({ tokenBrandId: "brand-a", productBrandId: "brand-b" })
    ).toThrow("Product is not available");
    expect(() =>
      assertBrandScopedProduct({ tokenBrandId: "brand-a", productBrandId: "brand-a" })
    ).not.toThrow();
  });
});
