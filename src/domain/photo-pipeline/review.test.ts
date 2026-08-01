import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  photoJob: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { decidePhotoJob, listPremiumPhotoJobs } from "./review";

const baseJob = {
  id: "photo-1",
  jobId: "job-1",
  sku: "SKU-1",
  brand: "Test Brand",
  productName: "Test Product",
  variant: null,
  view: "front",
  originalBlobUrl: "https://assets.test/original.png",
  sourceContentHash: "hash",
  processingMode: "premium",
  status: "needs_review",
  qualityScore: 0.91,
  labelFidelityScore: 0.96,
  warnings: ["human review required"],
  manifest: {
    outputs: { white_master: "https://assets.test/premium.png" },
    catalog_safe_outputs: { white_master: "https://assets.test/catalog.png" },
    background_removal: { output_kind: "generative_image" },
    label_fidelity_score: 0.96,
    label_validation: {
      score: 0.96,
      hardFlagged: true,
      warnings: ["OCR mismatch"],
      issues: ["critical label text changed"],
      criticalDeltas: [{ reason: "dosage changed" }],
      regions: {
        source: { left: 100, top: 200, width: 400, height: 300 },
        premium: { left: 900, top: 1000, width: 1200, height: 800 },
      },
    },
  },
  costCents: 7,
  approvedBy: null,
  approvedAt: null,
  createdAt: new Date("2026-08-01T12:00:00Z"),
  updatedAt: new Date("2026-08-01T12:01:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.photoJob.updateMany.mockResolvedValue({ count: 1 });
});

describe("premium photo review decisions", () => {
  it("persists reviewer identity and timestamp when a human approves a premium job", async () => {
    prismaMock.photoJob.findUnique
      .mockResolvedValueOnce(baseJob)
      .mockResolvedValueOnce({
        ...baseJob,
        status: "approved",
        approvedBy: "reviewer@test.dev",
        approvedAt: new Date("2026-08-01T13:00:00Z"),
      });

    const result = await decidePhotoJob({
      id: baseJob.id,
      action: "approve",
      reviewerEmail: "reviewer@test.dev",
    });

    expect(prismaMock.photoJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: baseJob.id,
          processingMode: "premium",
          status: "needs_review",
        },
        data: expect.objectContaining({
          status: "approved",
          approvedBy: "reviewer@test.dev",
          approvedAt: expect.any(Date),
        }),
      }),
    );
    expect(result.status).toBe("approved");
    expect(result.approvedBy).toBe("reviewer@test.dev");
  });

  it("fails closed instead of approving a catalog-safe job", async () => {
    prismaMock.photoJob.findUnique.mockResolvedValue({
      ...baseJob,
      processingMode: "catalog_safe",
    });

    await expect(
      decidePhotoJob({
        id: baseJob.id,
        action: "approve",
        reviewerEmail: "reviewer@test.dev",
      }),
    ).rejects.toMatchObject({ code: "premium_required" });
    expect(prismaMock.photoJob.updateMany).not.toHaveBeenCalled();
  });

  it("cannot approve a premium-mode row without a generated output and measured validation", async () => {
    prismaMock.photoJob.findUnique.mockResolvedValue({
      ...baseJob,
      labelFidelityScore: null,
      manifest: { outputs: { white_master: "needs-review/source.png" } },
    });

    await expect(
      decidePhotoJob({
        id: baseJob.id,
        action: "approve",
        reviewerEmail: "reviewer@test.dev",
      }),
    ).rejects.toMatchObject({ code: "invalid_transition" });
    expect(prismaMock.photoJob.updateMany).not.toHaveBeenCalled();
  });

  it("clears prior approval when rejecting", async () => {
    const approved = {
      ...baseJob,
      status: "approved",
      approvedBy: "first@test.dev",
      approvedAt: new Date("2026-08-01T13:00:00Z"),
    };
    prismaMock.photoJob.findUnique
      .mockResolvedValueOnce(approved)
      .mockResolvedValueOnce({
        ...approved,
        status: "rejected",
        approvedBy: null,
        approvedAt: null,
      });

    const result = await decidePhotoJob({
      id: baseJob.id,
      action: "reject",
      reviewerEmail: "reviewer@test.dev",
    });

    expect(prismaMock.photoJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "rejected", approvedBy: null, approvedAt: null },
      }),
    );
    expect(result).toMatchObject({ status: "rejected", approvedBy: null, approvedAt: null });
  });
});

describe("premium photo comparison listing", () => {
  it("returns source, catalog-safe and premium assets from the Phase 2 manifest", async () => {
    prismaMock.photoJob.findMany
      .mockResolvedValueOnce([baseJob])
      .mockResolvedValueOnce([]);
    prismaMock.photoJob.count.mockResolvedValue(1);

    const result = await listPremiumPhotoJobs({ limit: 25, offset: 0 });

    expect(result.jobs[0]).toMatchObject({
      sourceUrl: "https://assets.test/original.png",
      catalogSafeUrl: "https://assets.test/catalog.png",
      premiumUrl: "https://assets.test/premium.png",
      labelFidelityScore: 0.96,
      labelHardFlagged: true,
      labelRegions: {
        source: { left: 100, top: 200, width: 400, height: 300 },
        premium: { left: 900, top: 1000, width: 1200, height: 800 },
      },
    });
    expect(result.jobs[0].warnings).toEqual(
      expect.arrayContaining([
        "OCR mismatch",
        "label fidelity: critical label text changed",
        "label fidelity critical delta: dosage changed",
      ]),
    );
    expect(prismaMock.photoJob.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ take: 25, skip: 0, where: { processingMode: "premium" } }),
    );
  });
});
