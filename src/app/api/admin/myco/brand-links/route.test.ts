/**
 * KEWL-2460 — the brand portal token lifecycle the PR #30 review found missing.
 *
 * These prove the operator can actually issue, rotate and kill a `/b/<token>`
 * link: that minting supersedes the brand's previous live link (so a forwarded
 * old URL dies), that the raw token is returned once and never listed, that the
 * partner is resolved from the brand's own catalog rather than caller input, and
 * that revoke only touches `brand_portal` rows.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  brand: { findUnique: vi.fn() },
  storeProductCatalog: { findMany: vi.fn() },
  catalogAccessToken: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(),
}));

const getServerSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@/domain/auth/config", () => ({ authOptions: {} }));

import { DELETE, GET, POST } from "./route";

const BRAND = { id: "brand-1", name: "Focus Labs", slug: "focus-labs" };
const ADMIN = "admin@test.dev";

function jsonRequest(body: unknown) {
  return new Request("http://localhost:3000/api/admin/myco/brand-links", {
    method: "POST",
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSessionMock.mockResolvedValue({ user: { email: ADMIN } });
  prismaMock.$transaction.mockImplementation(async (fn: never) =>
    (fn as unknown as (tx: typeof prismaMock) => unknown)(prismaMock)
  );
  prismaMock.catalogAccessToken.create.mockResolvedValue({
    id: "token-new",
    issuedAt: new Date("2026-07-29T00:00:00Z"),
    expiresAt: null,
    regeneratedFromId: "token-old",
  });
  prismaMock.catalogAccessToken.updateMany.mockResolvedValue({ count: 1 });
});

describe("brand portal link lifecycle — auth", () => {
  it.each([
    ["GET", () => GET()],
    ["POST", () => POST(jsonRequest({ brandId: BRAND.id }))],
    ["DELETE", () => DELETE(jsonRequest({ id: "token-1" }))],
  ])("%s refuses an unauthenticated caller", async (_method, call) => {
    getServerSessionMock.mockResolvedValue(null);

    const response = await call();

    expect(response.status).toBe(401);
  });
});

describe("minting a brand portal link", () => {
  beforeEach(() => {
    prismaMock.brand.findUnique.mockResolvedValue(BRAND);
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([{ partnerId: "partner-1" }]);
    prismaMock.catalogAccessToken.findFirst.mockResolvedValue({ id: "token-old" });
  });

  it("revokes the brand's previous live link before issuing a new one", async () => {
    await POST(jsonRequest({ brandId: BRAND.id }));

    expect(prismaMock.catalogAccessToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { purpose: "brand_portal", brandId: BRAND.id, status: "active" },
        data: expect.objectContaining({ status: "revoked", revokedBy: ADMIN }),
      })
    );
  });

  it("records the rotation so an operator can audit which link replaced which", async () => {
    await POST(jsonRequest({ brandId: BRAND.id }));

    const created = prismaMock.catalogAccessToken.create.mock.calls[0][0].data;
    expect(created.regeneratedFromId).toBe("token-old");
    expect(created.purpose).toBe("brand_portal");
    expect(created.status).toBe("active");
    expect(created.brandId).toBe(BRAND.id);
    expect(created.issuedToType).toBe("brand");
  });

  it("stores only the hash and returns the raw URL exactly once", async () => {
    const response = await POST(jsonRequest({ brandId: BRAND.id }));
    const payload = await response.json();

    const created = prismaMock.catalogAccessToken.create.mock.calls[0][0].data;
    const rawToken = payload.data.url.split("/b/")[1];

    expect(payload.data.url).toContain("/b/");
    expect(rawToken).toBeTruthy();
    // The stored value must be the digest, never the token itself.
    expect(created.tokenHash).not.toBe(rawToken);
    expect(created.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("has no predecessor to record on a brand's first link", async () => {
    prismaMock.catalogAccessToken.findFirst.mockResolvedValue(null);

    await POST(jsonRequest({ brandId: BRAND.id }));

    expect(prismaMock.catalogAccessToken.create.mock.calls[0][0].data.regeneratedFromId).toBeNull();
  });

  it("rejects an unknown brand", async () => {
    prismaMock.brand.findUnique.mockResolvedValue(null);

    const response = await POST(jsonRequest({ brandId: "nope" }));

    expect(response.status).toBe(404);
    expect(prismaMock.catalogAccessToken.create).not.toHaveBeenCalled();
  });
});

describe("brand portal link partner isolation", () => {
  beforeEach(() => {
    prismaMock.brand.findUnique.mockResolvedValue(BRAND);
    prismaMock.catalogAccessToken.findFirst.mockResolvedValue(null);
  });

  it("refuses a partner the brand has no products under", async () => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([{ partnerId: "partner-1" }]);

    const response = await POST(jsonRequest({ brandId: BRAND.id, partnerId: "partner-other" }));

    expect(response.status).toBe(400);
    expect(prismaMock.catalogAccessToken.create).not.toHaveBeenCalled();
  });

  it("refuses to guess when the brand spans several partners", async () => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([
      { partnerId: "partner-1" },
      { partnerId: "partner-2" },
    ]);

    const response = await POST(jsonRequest({ brandId: BRAND.id }));

    expect(response.status).toBe(400);
    expect(prismaMock.catalogAccessToken.create).not.toHaveBeenCalled();
  });

  it("refuses a brand with no catalog products", async () => {
    prismaMock.storeProductCatalog.findMany.mockResolvedValue([]);

    const response = await POST(jsonRequest({ brandId: BRAND.id }));

    expect(response.status).toBe(400);
  });
});

describe("listing and revoking brand portal links", () => {
  it("never exposes a usable token when listing", async () => {
    prismaMock.catalogAccessToken.findMany.mockResolvedValue([
      { id: "token-1", status: "active", brandId: BRAND.id, brand: BRAND },
    ]);

    const response = await GET();
    const payload = await response.json();

    const selected = prismaMock.catalogAccessToken.findMany.mock.calls[0][0].select;
    expect(selected.tokenHash).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
  });

  it("revokes a brand portal link with the admin and reason recorded", async () => {
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue({
      id: "token-1",
      purpose: "brand_portal",
    });

    const response = await DELETE(jsonRequest({ id: "token-1", reason: "brand asked us to stop" }));

    expect(response.status).toBe(200);
    expect(prismaMock.catalogAccessToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "token-1" },
        data: expect.objectContaining({
          status: "revoked",
          revokedBy: ADMIN,
          revocationReason: "brand asked us to stop",
        }),
      })
    );
  });

  it("will not revoke a staff link through the brand endpoint", async () => {
    prismaMock.catalogAccessToken.findUnique.mockResolvedValue({
      id: "staff-1",
      purpose: "staff_review",
    });

    const response = await DELETE(jsonRequest({ id: "staff-1" }));

    expect(response.status).toBe(404);
    expect(prismaMock.catalogAccessToken.update).not.toHaveBeenCalled();
  });
});
