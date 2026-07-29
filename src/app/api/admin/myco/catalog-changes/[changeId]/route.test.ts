/**
 * KEWL-2457 — Jon's accept/reject on one staff catalog edit.
 *
 * The behaviours worth pinning are the ones that would let a change reach a customer by
 * a route other than a decision:
 *
 *  - accept applies through `recomputeCatalogItemProjection()`, never a direct column
 *    write, so an accepted value can only ever be what a full ledger replay supports;
 *  - reject is recorded, never deleted — the ticket is explicit that a rejected change
 *    stays on the record;
 *  - a second decision on the same row is refused rather than silently re-applied;
 *  - ownership is checked against the product the change points at, not against a
 *    caller-supplied partner.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const ADMIN_EMAIL = "jon@tripdar.test";
const CHANGE_ID = "change-1";
const PRODUCT_ID = "catalog-item-1";
const PARTNER_ID = "partner-mushroom-top";

const prismaMock = vi.hoisted(() => ({
  catalogFieldChange: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const sessionMock = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => sessionMock);
vi.mock("@/domain/auth/config", () => ({ authOptions: {} }));

const accessMock = vi.hoisted(() => ({ resolveProductForAdmin: vi.fn() }));
vi.mock("@/domain/myco/adminAccess", () => accessMock);

const serviceMock = vi.hoisted(() => ({ recomputeCatalogItemProjection: vi.fn() }));
vi.mock("@/domain/myco/staffReviewService", () => serviceMock);

function pendingChange(overrides: Record<string, unknown> = {}) {
  return {
    id: CHANGE_ID,
    catalogItemId: PRODUCT_ID,
    fieldName: "onsetMinutes",
    actorType: "staff",
    disposition: "pending",
    ...overrides,
  };
}

async function decide(body: Record<string, unknown>) {
  const { POST } = await import("./route");
  const request = new NextRequest(
    `https://tripdar.test/api/admin/myco/catalog-changes/${CHANGE_ID}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const response = await POST(request as never, {
    params: Promise.resolve({ changeId: CHANGE_ID }),
  });
  return { response, body: await response.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.getServerSession.mockResolvedValue({ user: { email: ADMIN_EMAIL } });
  accessMock.resolveProductForAdmin.mockResolvedValue({
    ok: true,
    productId: PRODUCT_ID,
    partnerId: PARTNER_ID,
  });
  prismaMock.catalogFieldChange.findUnique.mockResolvedValue(pendingChange());
  prismaMock.catalogFieldChange.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: CHANGE_ID,
      disposition: data.disposition,
      dispositionAt: data.dispositionAt,
    })
  );
  serviceMock.recomputeCatalogItemProjection.mockResolvedValue({
    catalogItemId: PRODUCT_ID,
    fieldsRecomputed: 1,
    cacheRowsChanged: ["onsetMinutes"],
    columnsChanged: ["onsetMinutes"],
  });
});

describe("POST accept", () => {
  it("flips the ledger row to accepted and stamps who decided it", async () => {
    const { response } = await decide({ decision: "accept" });

    expect(response.status).toBe(200);
    expect(prismaMock.catalogFieldChange.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CHANGE_ID },
        data: expect.objectContaining({
          disposition: "accepted",
          dispositionBy: ADMIN_EMAIL,
        }),
      })
    );
  });

  it("applies via the projection rebuild, not a bespoke column write", async () => {
    // If this ever becomes a direct `storeProductCatalog.update`, an accept could write
    // a value the append-only ledger does not support — the exact divergence
    // KEWL-2364 built the repair path to prevent.
    await decide({ decision: "accept" });
    expect(serviceMock.recomputeCatalogItemProjection).toHaveBeenCalledWith(PRODUCT_ID);
  });
});

describe("POST reject", () => {
  it("records the rejection and its reason instead of deleting the row", async () => {
    await decide({ decision: "reject", reason: "Wrong product, that's the 250mg" });

    expect(prismaMock.catalogFieldChange.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          disposition: "rejected",
          dispositionReason: "Wrong product, that's the 250mg",
        }),
      })
    );
  });

  it("stores no reason rather than an empty string when none is given", async () => {
    await decide({ decision: "reject" });
    expect(prismaMock.catalogFieldChange.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dispositionReason: null }),
      })
    );
  });
});

describe("refusals", () => {
  it("401s an unauthenticated caller before touching anything", async () => {
    sessionMock.getServerSession.mockResolvedValue(null);
    const { response } = await decide({ decision: "accept" });

    expect(response.status).toBe(401);
    expect(prismaMock.catalogFieldChange.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an unknown decision verb", async () => {
    const { response } = await decide({ decision: "approve" });
    expect(response.status).toBe(400);
    expect(prismaMock.catalogFieldChange.update).not.toHaveBeenCalled();
  });

  it("404s a change on another partner's product", async () => {
    // resolveProductForAdmin returns 404 rather than 403 on purpose: don't confirm to
    // another partner that this product exists.
    accessMock.resolveProductForAdmin.mockResolvedValue({
      ok: false,
      status: 404,
      message: "Product not found",
    });
    const { response } = await decide({ decision: "accept" });

    expect(response.status).toBe(404);
    expect(prismaMock.catalogFieldChange.update).not.toHaveBeenCalled();
  });

  it("409s a change that was already decided", async () => {
    // Two admins on the same queue, or a double-tap. Re-applying would re-run the
    // projection for a decision already made.
    prismaMock.catalogFieldChange.findUnique.mockResolvedValue(
      pendingChange({ disposition: "accepted" })
    );
    const { response } = await decide({ decision: "reject" });

    expect(response.status).toBe(409);
    expect(prismaMock.catalogFieldChange.update).not.toHaveBeenCalled();
  });

  it("refuses a brand submission — that queue has different rules", async () => {
    // An accepted BRAND change flips a staff-confirmed field to needs_re_review
    // (KEWL-2331). Deciding it here would skip that entirely.
    prismaMock.catalogFieldChange.findUnique.mockResolvedValue(
      pendingChange({ actorType: "brand" })
    );
    const { response } = await decide({ decision: "accept" });

    expect(response.status).toBe(400);
    expect(prismaMock.catalogFieldChange.update).not.toHaveBeenCalled();
  });

  it("404s a change id that does not exist", async () => {
    prismaMock.catalogFieldChange.findUnique.mockResolvedValue(null);
    const { response } = await decide({ decision: "accept" });
    expect(response.status).toBe(404);
  });
});
