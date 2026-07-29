import { beforeAll, describe, expect, it, vi, beforeEach } from "vitest";

import { createPrismaMock } from "@/test/prismaMock";

const prismaMock = vi.hoisted(() => ({
  mycoEmployeeReviewAssignment: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  mycoEmployeeProductReview: {
    create: vi.fn(),
  },
  mycoEmployee: {
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

const checkPublicWriteRateLimitMock = vi.hoisted(() => vi.fn());

// Strict view (KEWL-2467): the route sees a Proxy that throws by name on any un-stubbed
// prisma access, so a signature change the mock has not kept up with fails as
// "not stubbed" instead of falling into the route's catch-all as a 500.
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock(prismaMock) };
});

vi.mock("@/domain/myco/publicWriteRateLimit", () => ({
  checkPublicWriteRateLimit: checkPublicWriteRateLimitMock,
}));

let POST: typeof import("./route").POST;

beforeAll(async () => {
  ({ POST } = await import("./route"));
});

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: "assignment-1",
    status: "opened",
    expiresAt: null,
    openedAt: new Date("2026-07-16T12:00:00Z"),
    catalogItemId: "catalog-1",
    employeeId: "employee-1",
    employee: { id: "employee-1", name: "Avery", email: "avery@example.com", optedOut: false },
    response: null,
    // The route validates `assignment.accessToken` when present (catalog access
    // tokens, KEWL-2353). Default to none so these cases exercise the legacy
    // review-token path; override to cover token expiry/revocation.
    accessToken: null,
    catalogItem: { id: "catalog-1" },
    ...overrides,
  };
}

function postRequest(body: Record<string, unknown>) {
  return new Request("https://tripdar.test/api/myco/product-review/token-1", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "vitest" },
    body: JSON.stringify(body),
  });
}

async function post(body: Record<string, unknown>) {
  return POST(postRequest(body) as never, { params: Promise.resolve({ token: "token-1" }) });
}

describe("product review token API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.mycoEmployeeReviewAssignment.findFirst.mockResolvedValue(assignment());
    // The interactive-transaction client is hand-built too, so it gets the same strict
    // treatment — an un-stubbed `tx.<model>.<method>` would otherwise fail exactly the
    // way the top-level client used to.
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(
        createPrismaMock(
          {
            mycoEmployeeProductReview: prismaMock.mycoEmployeeProductReview,
            mycoEmployeeReviewAssignment: prismaMock.mycoEmployeeReviewAssignment,
            mycoEmployee: prismaMock.mycoEmployee,
          },
          "tx"
        )
      )
    );
    prismaMock.mycoEmployeeProductReview.create.mockResolvedValue({ id: "response-1" });
    prismaMock.mycoEmployeeReviewAssignment.update.mockResolvedValue({});
    prismaMock.mycoEmployee.update.mockResolvedValue({});
    checkPublicWriteRateLimitMock.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  });

  it("rate-limits public submissions before loading the assignment", async () => {
    checkPublicWriteRateLimitMock.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 42,
      reason: "token",
    });

    const response = await post({
      knowsProduct: false,
      notes: "too many",
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(prismaMock.mycoEmployeeReviewAssignment.findFirst).not.toHaveBeenCalled();
  });

  it("fails closed when the public write rate-limit store is unavailable", async () => {
    checkPublicWriteRateLimitMock.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 60,
      reason: "store_error",
    });

    const response = await post({
      knowsProduct: false,
      notes: "store outage",
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(prismaMock.mycoEmployeeReviewAssignment.findFirst).not.toHaveBeenCalled();
  });

  it("rejects known-product submissions missing required effect axes", async () => {
    const response = await post({
      knowsProduct: true,
      clarityCognition: 70,
      moodSocial: 65,
      visualPattern: 50,
      somatic: 40,
      energyDirection: 75,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { message: expect.stringContaining("six effect axes") },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.mycoEmployeeProductReview.create).not.toHaveBeenCalled();
  });

  it("rejects known-product submissions with invalid effect axes", async () => {
    const response = await post({
      knowsProduct: true,
      clarityCognition: 70,
      moodSocial: 65,
      visualPattern: 50,
      somatic: 40,
      energyDirection: 75,
      depthDirection: 101,
    });

    expect(response.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  // KEWL-2467: pin the QUERY, not just the status. The strict mock catches a rename
  // (`findFirst` -> something else); this catches the subtler regression where the method
  // stays but the lookup stops matching one of the two token paths. Both token shapes have
  // to stay in the OR — catalog access tokens (KEWL-2353) and legacy review tokens — and a
  // change that drops either would silently 404 half the live links.
  it("looks the assignment up by both the legacy review token and the catalog access token", async () => {
    await post({ knowsProduct: false, notes: "I have not tried this one." });

    expect(prismaMock.mycoEmployeeReviewAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { tokenHash: expect.any(String) },
            { accessToken: { tokenHash: expect.any(String) } },
          ],
        },
        include: expect.objectContaining({ accessToken: true, response: true }),
      })
    );
  });

  it("stores not-familiar submissions without requiring effect axes", async () => {
    const response = await post({
      knowsProduct: false,
      notes: "I have not tried this one.",
    });

    expect(response.status).toBe(201);
    expect(prismaMock.mycoEmployeeProductReview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        knowsProduct: false,
        clarityCognition: null,
        moodSocial: null,
        visualPattern: null,
        somatic: null,
        energyDirection: null,
        depthDirection: null,
        notes: "I have not tried this one.",
      }),
    });
    expect(prismaMock.mycoEmployeeReviewAssignment.update).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      data: expect.objectContaining({ status: "not_familiar" }),
    });
  });

  it("rejects duplicate submissions for completed assignments", async () => {
    prismaMock.mycoEmployeeReviewAssignment.findFirst.mockResolvedValue(
      assignment({ status: "submitted", response: { id: "response-1" } })
    );

    const response = await post({
      knowsProduct: true,
      clarityCognition: 70,
      moodSocial: 65,
      visualPattern: 50,
      somatic: 40,
      energyDirection: 75,
      depthDirection: 55,
    });

    expect(response.status).toBe(409);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
