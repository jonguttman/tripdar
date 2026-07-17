import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "./route";

const prismaMock = vi.hoisted(() => ({
  mycoEmployeeReviewAssignment: {
    findUnique: vi.fn(),
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

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

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
    prismaMock.mycoEmployeeReviewAssignment.findUnique.mockResolvedValue(assignment());
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback({
        mycoEmployeeProductReview: prismaMock.mycoEmployeeProductReview,
        mycoEmployeeReviewAssignment: prismaMock.mycoEmployeeReviewAssignment,
        mycoEmployee: prismaMock.mycoEmployee,
      })
    );
    prismaMock.mycoEmployeeProductReview.create.mockResolvedValue({ id: "response-1" });
    prismaMock.mycoEmployeeReviewAssignment.update.mockResolvedValue({});
    prismaMock.mycoEmployee.update.mockResolvedValue({});
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
    prismaMock.mycoEmployeeReviewAssignment.findUnique.mockResolvedValue(
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
