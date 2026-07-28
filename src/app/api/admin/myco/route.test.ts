import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_COMPOUNDS,
  LADDER_COMPATIBLE_MATERIAL_BASES,
} from "@/domain/recommendation-engine/doseBasis";

const getServerSessionMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@/domain/auth/config", () => ({
  authOptions: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

let POST: typeof import("./route").POST;

beforeAll(async () => {
  ({ POST } = await import("./route"));
});

function postRequest(body: Record<string, unknown>) {
  return new Request("https://tripdar.test/api/admin/myco", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function post(body: Record<string, unknown>) {
  getServerSessionMock.mockResolvedValue({ user: { email: "admin@example.com" } });

  return POST(postRequest(body) as never);
}

describe("admin myco product API dose provenance validation", () => {
  it("rejects out-of-vocabulary activeCompound with accepted values", async () => {
    const response = await post({
      partnerId: "partner-1",
      productName: "Gummies",
      format: "edible",
      productUnitMg: 250,
      activeCompound: "amanita",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { message: `activeCompound must be one of: ${ACTIVE_COMPOUNDS.join(", ")}` },
    });
  });

  it("rejects out-of-vocabulary materialMassBasis with accepted values", async () => {
    const response = await post({
      partnerId: "partner-1",
      productName: "Gummies",
      format: "edible",
      productUnitMg: 250,
      materialMassBasis: "total mushroom material",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        message: `materialMassBasis must be one of: ${LADDER_COMPATIBLE_MATERIAL_BASES.join(", ")}`,
      },
    });
  });
});
