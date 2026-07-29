/**
 * Brand portal upload endpoint (KEWL-2390 gaps 2 and 3).
 *
 * Two things are proven here and nothing else: we do not take custody of an image
 * without the written display grant, and a slot that holds one file refuses two
 * rather than accepting both and keeping one.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const loadBrandPortalContextMock = vi.hoisted(() => vi.fn());
const putMock = vi.hoisted(() => vi.fn());
const prepareBrandAssetMock = vi.hoisted(() => vi.fn());

vi.mock("@vercel/blob", () => ({ put: putMock }));
vi.mock("@/domain/myco/brandPortalData", () => ({
  loadBrandPortalContext: loadBrandPortalContextMock,
  markTokenOpened: vi.fn(),
}));
vi.mock("@/domain/myco/brandPortalAssets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/domain/myco/brandPortalAssets")>()),
  prepareBrandAsset: prepareBrandAssetMock,
}));

let POST: typeof import("./route").POST;

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET ??= "test-brand-portal-secret";
  ({ POST } = await import("./route"));
});

function file(name: string) {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: "image/png" });
}

async function upload(fields: Record<string, string>, files: File[]) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  for (const entry of files) form.append("files", entry);

  const request = new Request("https://tripdar.test/api/myco/brand-portal/token-1/upload", {
    method: "POST",
    body: form,
  });
  return POST(request as never, { params: Promise.resolve({ token: "token-1" }) });
}

describe("brand portal upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadBrandPortalContextMock.mockResolvedValue({
      ok: true,
      context: {
        tokenId: "token-1",
        partnerId: "partner-1",
        brand: { id: "brand-1", name: "Micro Mind" },
        products: [{ id: "item-1" }],
        lastSubmissionAt: null,
      },
    });
    prepareBrandAssetMock.mockResolvedValue({
      original: { bytes: Buffer.from([1, 2, 3, 4]), contentType: "image/png", extension: "png" },
      derivative: null,
      originalFilename: "logo.png",
      originalSize: 4,
      width: 800,
      height: 800,
    });
    putMock.mockResolvedValue({ url: "https://blob.test/logo.png" });
  });

  it("refuses to store an image without the display grant", async () => {
    const response = await upload({ kind: "brand_logo", imageUsageGrant: "false" }, [
      file("logo.png"),
    ]);

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error.field).toBe("imageUsageGrant");
    // The point of enforcing here: the bytes never reach storage.
    expect(putMock).not.toHaveBeenCalled();
    expect(prepareBrandAssetMock).not.toHaveBeenCalled();
  });

  it("refuses when the grant is absent rather than defaulting it on", async () => {
    const response = await upload({ kind: "product_photo", catalogItemId: "item-1" }, [
      file("front.jpg"),
    ]);

    expect(response.status).toBe(403);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("stores the file once the grant is given", async () => {
    const response = await upload({ kind: "brand_logo", imageUsageGrant: "true" }, [
      file("logo.png"),
    ]);

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.data.uploads).toHaveLength(1);
    expect(json.data.uploads[0].handle).toBeTruthy();
    expect(putMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a second file in a one-per-brand slot instead of discarding it", async () => {
    const response = await upload({ kind: "brand_artwork", imageUsageGrant: "true" }, [
      file("a.png"),
      file("b.png"),
    ]);

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/one brand artwork at a time/i);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("still accepts several product photos at once", async () => {
    const response = await upload(
      { kind: "product_photo", catalogItemId: "item-1", tag: "package_front", imageUsageGrant: "true" },
      [file("front.jpg"), file("back.jpg")],
    );

    expect(response.status).toBe(201);
    expect((await response.json()).data.uploads).toHaveLength(2);
  });
});
