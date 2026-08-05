import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSessionMock = vi.hoisted(() => vi.fn());
const getUserRoleMock = vi.hoisted(() => vi.fn());
const decidePhotoJobMock = vi.hoisted(() => vi.fn());
const getPhotoJobAssetReferenceMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@/domain/auth/config", () => ({ authOptions: {} }));
vi.mock("@/domain/auth/role", () => ({ getUserRole: getUserRoleMock }));
vi.mock("@/domain/photo-pipeline/review", () => ({
  decidePhotoJob: decidePhotoJobMock,
  getPhotoJobAssetReference: getPhotoJobAssetReferenceMock,
  PhotoReviewError: class PhotoReviewError extends Error {
    constructor(message: string, readonly code: string) {
      super(message);
    }
  },
}));

import { GET as GET_IMAGE } from "./image/route";
import { PATCH } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/admin/photo-jobs/photo-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

const context = { params: Promise.resolve({ id: "photo-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PHOTO_PIPELINE_ROOT;
  getServerSessionMock.mockResolvedValue({ user: { email: "admin@test.dev" } });
  getUserRoleMock.mockResolvedValue("super_admin");
  decidePhotoJobMock.mockResolvedValue({ id: "photo-1", status: "approved" });
  getPhotoJobAssetReferenceMock.mockResolvedValue("https://assets.test/source-preview.png");
});

describe("photo job review route", () => {
  it("requires authentication", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const response = await PATCH(request({ action: "approve" }), context);

    expect(response.status).toBe(401);
    expect(decidePhotoJobMock).not.toHaveBeenCalled();
  });

  it("requires the super-admin role", async () => {
    getUserRoleMock.mockResolvedValue("partner_admin");

    const response = await PATCH(request({ action: "approve" }), context);

    expect(response.status).toBe(403);
    expect(decidePhotoJobMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown action before touching persistence", async () => {
    const response = await PATCH(request({ action: "promote" }), context);

    expect(response.status).toBe(400);
    expect(decidePhotoJobMock).not.toHaveBeenCalled();
  });

  it("passes the authenticated reviewer identity to the domain service", async () => {
    const response = await PATCH(request({ action: "approve" }), context);

    expect(response.status).toBe(200);
    expect(decidePhotoJobMock).toHaveBeenCalledWith({
      id: "photo-1",
      action: "approve",
      reviewerEmail: "admin@test.dev",
    });
  });
});

describe("photo job image route", () => {
  it("requires authentication before resolving a source image", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const response = await GET_IMAGE(imageRequest("source"), context);

    expect(response.status).toBe(401);
    expect(getPhotoJobAssetReferenceMock).not.toHaveBeenCalled();
  });

  it("requires the super-admin role before resolving a source image", async () => {
    getUserRoleMock.mockResolvedValue("partner_admin");

    const response = await GET_IMAGE(imageRequest("source"), context);

    expect(response.status).toBe(403);
    expect(getPhotoJobAssetReferenceMock).not.toHaveBeenCalled();
  });

  it("redirects remote source-preview references without changing the asset URL", async () => {
    getPhotoJobAssetReferenceMock.mockResolvedValue("https://assets.test/source-preview.png");

    const response = await GET_IMAGE(imageRequest("source"), context);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://assets.test/source-preview.png");
    expect(getPhotoJobAssetReferenceMock).toHaveBeenCalledWith("photo-1", "source");
  });

  it("serves local source-preview derivatives as image/png", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "tripdar-photo-route-"));
    const rootDir = path.join(workDir, "tripdar-product-images");
    const previewPath = path.join(rootDir, "source-previews", "photo-1.png");
    await mkdir(path.dirname(previewPath), { recursive: true });
    await writeFile(previewPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    process.env.PHOTO_PIPELINE_ROOT = rootDir;
    getPhotoJobAssetReferenceMock.mockResolvedValue("tripdar-product-images/source-previews/photo-1.png");

    const response = await GET_IMAGE(imageRequest("source"), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    await expect(response.arrayBuffer()).resolves.toHaveProperty("byteLength", 4);
  });

  it("keeps invalid and missing source assets on the existing 4xx paths", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "tripdar-photo-route-"));
    const rootDir = path.join(workDir, "tripdar-product-images");
    process.env.PHOTO_PIPELINE_ROOT = rootDir;
    getPhotoJobAssetReferenceMock.mockResolvedValue("../secret.png");

    const invalid = await GET_IMAGE(imageRequest("source"), context);
    expect(invalid.status).toBe(400);

    getPhotoJobAssetReferenceMock.mockResolvedValue("tripdar-product-images/source-previews/missing.png");
    const missing = await GET_IMAGE(imageRequest("source"), context);
    expect(missing.status).toBe(404);
  });
});

function imageRequest(kind: string) {
  return {
    nextUrl: new URL(`http://localhost/api/admin/photo-jobs/photo-1/image?kind=${kind}`),
  } as never;
}
