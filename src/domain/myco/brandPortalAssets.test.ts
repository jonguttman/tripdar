import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import {
  BRAND_ASSET_MAX_BYTES,
  BrandAssetError,
  buildBrandAssetPath,
  prepareBrandAsset,
  sanitizeSvg,
  signBrandAssetHandle,
  sniffImageFormat,
  verifyBrandAssetHandle,
  type BrandAssetDescriptor,
  type UploadLike,
} from "./brandPortalAssets";

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

async function jpeg(width = 900, height = 700): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: "#8b7355" } })
    .jpeg({ quality: 92 })
    .toBuffer();
}

beforeAll(() => {
  process.env.NEXTAUTH_SECRET ??= "test-secret-for-brand-portal-handles";
});

describe("format sniffing", () => {
  it("identifies real image bytes regardless of the declared type", async () => {
    expect(sniffImageFormat(await jpeg())).toBe("jpeg");
    expect(
      sniffImageFormat(
        await sharp({ create: { width: 400, height: 400, channels: 3, background: "#fff" } })
          .png()
          .toBuffer(),
      ),
    ).toBe("png");
    expect(
      sniffImageFormat(
        await sharp({ create: { width: 400, height: 400, channels: 3, background: "#fff" } })
          .webp()
          .toBuffer(),
      ),
    ).toBe("webp");
  });

  it("recognises SVG including with an XML prolog and comments", () => {
    expect(sniffImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe("svg");
    expect(
      sniffImageFormat(
        Buffer.from('<?xml version="1.0"?><!-- a comment --><svg xmlns="http://www.w3.org/2000/svg"/>'),
      ),
    ).toBe("svg");
  });

  it("rejects things that are not images", () => {
    expect(sniffImageFormat(Buffer.from("#!/bin/sh\nrm -rf /\n"))).toBeNull();
    expect(sniffImageFormat(Buffer.from("<html><body>hi</body></html>"))).toBeNull();
    expect(sniffImageFormat(Buffer.alloc(4))).toBeNull();
  });

  it("does not trust a renamed executable claiming to be a PNG", async () => {
    const file = uploadLike({
      bytes: Buffer.from("MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00"),
      type: "image/png",
      name: "logo.png",
    });
    await expect(prepareBrandAsset(file, "brand_logo")).rejects.toBeInstanceOf(BrandAssetError);
  });
});

describe("SVG sanitisation", () => {
  it("strips script elements", () => {
    const cleaned = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="5"/></svg>',
    );
    expect(cleaned).not.toMatch(/<script/i);
    expect(cleaned).not.toMatch(/alert\(1\)/);
    expect(cleaned).toMatch(/<circle/);
  });

  it("strips event handler attributes", () => {
    const cleaned = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect onload="alert(1)" onmouseover='x()' width="10"/></svg>`,
    );
    expect(cleaned).not.toMatch(/onload/i);
    expect(cleaned).not.toMatch(/onmouseover/i);
    expect(cleaned).toMatch(/width="10"/);
  });

  it("strips javascript: URLs and foreignObject", () => {
    const cleaned = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml">x</body></foreignObject><a href="javascript:alert(1)">t</a></svg>`,
    );
    expect(cleaned).not.toMatch(/foreignObject/i);
    expect(cleaned).not.toMatch(/javascript:/i);
  });

  it("strips external references but keeps in-document fragment refs", () => {
    const cleaned = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><use href="#icon"/><use href="https://evil.test/x.svg#y"/></svg>`,
    );
    expect(cleaned).toMatch(/href="#icon"/);
    expect(cleaned).not.toMatch(/evil\.test/);
  });

  it("refuses entity declarations outright (XXE / billion laughs)", () => {
    expect(() =>
      sanitizeSvg(
        `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg>&xxe;</svg>`,
      ),
    ).toThrow(BrandAssetError);
  });
});

describe("prepareBrandAsset", () => {
  it("preserves the original bytes untouched and adds a display derivative", async () => {
    const bytes = await jpeg(2600, 1800);
    const prepared = await prepareBrandAsset(uploadLike({ bytes, type: "image/jpeg" }), "product_photo");

    // The whole point of this ticket: packaging labels survive at full resolution.
    expect(prepared.original.bytes.equals(bytes)).toBe(true);
    expect(prepared.original.contentType).toBe("image/jpeg");
    expect(prepared.width).toBe(2600);
    expect(prepared.height).toBe(1800);

    expect(prepared.derivative).not.toBeNull();
    const derivativeMeta = await sharp(prepared.derivative!.bytes).metadata();
    expect(Math.max(derivativeMeta.width!, derivativeMeta.height!)).toBeLessThanOrEqual(2000);
  });

  it("does not enlarge a small-but-acceptable image", async () => {
    const bytes = await jpeg(400, 300);
    const prepared = await prepareBrandAsset(uploadLike({ bytes, type: "image/jpeg" }), "product_photo");
    const meta = await sharp(prepared.derivative!.bytes).metadata();
    expect(meta.width).toBe(400);
  });

  it("rejects images below the minimum dimension", async () => {
    const bytes = await jpeg(100, 100);
    await expect(
      prepareBrandAsset(uploadLike({ bytes, type: "image/jpeg" }), "product_photo"),
    ).rejects.toThrow(/too small/i);
  });

  it("accepts SVG for a logo and sanitises it", async () => {
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><script>alert(1)</script><rect width="200" height="200" fill="#d4a574"/></svg>`,
    );
    const prepared = await prepareBrandAsset(uploadLike({ bytes: svg, type: "image/svg+xml" }), "brand_logo");
    expect(prepared.format).toBe("svg");
    expect(prepared.original.bytes.toString("utf8")).not.toMatch(/<script/i);
  });

  it("refuses SVG masquerading as a product photo", async () => {
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"/>`);
    await expect(
      prepareBrandAsset(uploadLike({ bytes: svg, type: "image/jpeg" }), "product_photo"),
    ).rejects.toThrow(/real photo/i);
  });

  it("rejects a file over the size cap without reading it", async () => {
    const file: UploadLike = {
      name: "huge.jpg",
      type: "image/jpeg",
      size: BRAND_ASSET_MAX_BYTES + 1,
      async arrayBuffer() {
        throw new Error("should not be read");
      },
    };
    await expect(prepareBrandAsset(file, "product_photo")).rejects.toThrow(/too large/i);
  });

  it("rejects a lying size header", async () => {
    const bytes = await jpeg();
    const file: UploadLike = {
      name: "x.jpg",
      type: "image/jpeg",
      size: bytes.byteLength + 500,
      async arrayBuffer() {
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        return copy.buffer;
      },
    };
    await expect(prepareBrandAsset(file, "product_photo")).rejects.toThrow(/size mismatch/i);
  });
});

describe("blob paths", () => {
  it("never lets a hostile filename escape the brand prefix", () => {
    const path = buildBrandAssetPath({
      brandId: "../../etc/passwd",
      kind: "product_photo",
      extension: "../sh",
      variant: "original",
    });
    expect(path).not.toMatch(/\.\./);
    expect(path.startsWith("brand-portal/etcpasswd/product_photo/")).toBe(true);
    expect(path.endsWith(".sh")).toBe(true);
  });

  it("is unique per call", () => {
    const args = {
      brandId: "brand1",
      kind: "product_photo" as const,
      extension: "jpg",
      variant: "original" as const,
    };
    expect(buildBrandAssetPath(args)).not.toBe(buildBrandAssetPath(args));
  });
});

describe("signed upload handles", () => {
  const descriptor: BrandAssetDescriptor = {
    brandId: "brand-a",
    kind: "product_photo",
    tag: "package_front",
    catalogItemId: "item-1",
    url: "https://blob.test/original.jpg",
    displayUrl: "https://blob.test/display.webp",
    originalFilename: "front.jpg",
    contentType: "image/jpeg",
    size: 1234,
    width: 900,
    height: 700,
    issuedAt: Date.now(),
  };

  it("round-trips a handle it issued", () => {
    const handle = signBrandAssetHandle(descriptor);
    expect(verifyBrandAssetHandle(handle, "brand-a")).toMatchObject({
      url: descriptor.url,
      catalogItemId: "item-1",
    });
  });

  it("rejects a handle minted for another brand", () => {
    const handle = signBrandAssetHandle(descriptor);
    expect(verifyBrandAssetHandle(handle, "brand-b")).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const handle = signBrandAssetHandle(descriptor);
    const [payload, signature] = handle.split(".");
    const forged = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    forged.url = "https://evil.test/x.jpg";
    const tampered = `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${signature}`;
    expect(verifyBrandAssetHandle(tampered, "brand-a")).toBeNull();
  });

  it("rejects an unsigned, caller-invented handle", () => {
    const invented = Buffer.from(JSON.stringify(descriptor)).toString("base64url");
    expect(verifyBrandAssetHandle(`${invented}.notasignature`, "brand-a")).toBeNull();
    expect(verifyBrandAssetHandle("garbage", "brand-a")).toBeNull();
    expect(verifyBrandAssetHandle("", "brand-a")).toBeNull();
  });

  it("expires an old handle", () => {
    const handle = signBrandAssetHandle({ ...descriptor, issuedAt: Date.now() });
    const wayLater = Date.now() + 25 * 60 * 60 * 1000;
    expect(verifyBrandAssetHandle(handle, "brand-a", wayLater)).toBeNull();
  });
});
