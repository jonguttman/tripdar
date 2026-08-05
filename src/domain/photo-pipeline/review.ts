import { prisma } from "@/lib/prisma";

export type PhotoReviewAction = "approve" | "reject";
export type PhotoReviewAssetKind = "source" | "catalog_safe" | "premium";

export interface PhotoLabelRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PhotoReviewJob {
  id: string;
  jobId: string;
  sku: string;
  brand: string | null;
  productName: string;
  variant: string | null;
  view: string;
  status: string;
  processingMode: string;
  sourceUrl: string;
  catalogSafeUrl: string | null;
  premiumUrl: string | null;
  qualityScore: number | null;
  labelFidelityScore: number | null;
  labelHardFlagged: boolean;
  labelRegions: {
    source: PhotoLabelRegion | null;
    premium: PhotoLabelRegion | null;
  };
  warnings: string[];
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class PhotoReviewError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "invalid_transition" | "premium_required",
  ) {
    super(message);
    this.name = "PhotoReviewError";
  }
}

const jobSelect = {
  id: true,
  jobId: true,
  sku: true,
  brand: true,
  productName: true,
  variant: true,
  view: true,
  originalBlobUrl: true,
  processingMode: true,
  status: true,
  qualityScore: true,
  labelFidelityScore: true,
  warnings: true,
  manifest: true,
  approvedBy: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type SelectedPhotoJob = Awaited<ReturnType<typeof findSelectedPhotoJob>>;

async function findSelectedPhotoJob(id: string) {
  return prisma.photoJob.findUnique({ where: { id }, select: jobSelect });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOutputs(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function preferredOutput(outputs: Record<string, unknown> | null): string | null {
  if (!outputs) return null;
  for (const key of ["white_master", "web", "transparent_master", "thumbnail"]) {
    const value = outputs[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function manifestOutput(manifest: unknown, key: string): string | null {
  if (!isRecord(manifest)) return null;
  return preferredOutput(readOutputs(manifest[key]));
}

function manifestString(manifest: unknown, key: string): string | null {
  if (!isRecord(manifest)) return null;
  const value = manifest[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function sourceReference(job: NonNullable<SelectedPhotoJob>): string {
  return manifestString(job.manifest, "source_preview") ?? job.originalBlobUrl;
}

function parseWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((warning): warning is string => typeof warning === "string");
}

function parseLabelRegion(value: unknown): PhotoLabelRegion | null {
  if (!isRecord(value)) return null;
  const { left, top, width, height } = value;
  if (
    typeof left !== "number" ||
    typeof top !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    ![left, top, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return { left, top, width, height };
}

function labelValidation(manifest: unknown) {
  const validation = isRecord(manifest) && isRecord(manifest.label_validation)
    ? manifest.label_validation
    : null;
  const regions = validation && isRecord(validation.regions) ? validation.regions : null;
  const criticalDeltas = validation && Array.isArray(validation.criticalDeltas)
    ? validation.criticalDeltas
    : [];
  const criticalWarnings = criticalDeltas.flatMap((delta) =>
    isRecord(delta) && typeof delta.reason === "string"
      ? [`label fidelity critical delta: ${delta.reason}`]
      : [],
  );
  return {
    hardFlagged: validation?.hardFlagged === true,
    warnings: [
      ...(validation ? parseWarnings(validation.warnings) : []),
      ...(validation ? parseWarnings(validation.issues).map((issue) => `label fidelity: ${issue}`) : []),
      ...criticalWarnings,
    ],
    regions: {
      source: parseLabelRegion(regions?.source),
      premium: parseLabelRegion(regions?.premium),
    },
  };
}

function isValidatedPremiumManifest(manifest: unknown): boolean {
  if (!isRecord(manifest)) return false;
  const provider = isRecord(manifest.background_removal) ? manifest.background_removal : null;
  const validation = isRecord(manifest.label_validation) ? manifest.label_validation : null;
  return (
    provider?.output_kind === "generative_image" &&
    typeof validation?.score === "number" &&
    Number.isFinite(validation.score) &&
    typeof manifest.label_fidelity_score === "number"
  );
}

function serializeJob(
  job: NonNullable<SelectedPhotoJob>,
  catalogSafeFallback: NonNullable<SelectedPhotoJob> | null,
): PhotoReviewJob {
  const validation = labelValidation(job.manifest);
  const catalogSafeUrl =
    manifestOutput(job.manifest, "catalog_safe_outputs") ??
    manifestOutput(job.manifest, "catalogSafeOutputs") ??
    (catalogSafeFallback ? manifestOutput(catalogSafeFallback.manifest, "outputs") : null);

  return {
    id: job.id,
    jobId: job.jobId,
    sku: job.sku,
    brand: job.brand,
    productName: job.productName,
    variant: job.variant,
    view: job.view,
    status: job.status,
    processingMode: job.processingMode,
    sourceUrl: sourceReference(job),
    catalogSafeUrl,
    premiumUrl: manifestOutput(job.manifest, "outputs"),
    qualityScore: job.qualityScore,
    labelFidelityScore: job.labelFidelityScore,
    labelHardFlagged: validation.hardFlagged,
    labelRegions: validation.regions,
    warnings: [...new Set([...parseWarnings(job.warnings), ...validation.warnings])],
    approvedBy: job.approvedBy,
    approvedAt: job.approvedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export async function getPhotoJobAssetReference(
  id: string,
  kind: PhotoReviewAssetKind,
): Promise<string | null> {
  const job = await findSelectedPhotoJob(id);
  if (!job) throw new PhotoReviewError("Photo job not found", "not_found");
  if (job.processingMode !== "premium") {
    throw new PhotoReviewError("Photo job is not a premium review candidate", "premium_required");
  }
  if (kind === "source") return sourceReference(job);
  if (kind === "premium") return manifestOutput(job.manifest, "outputs");
  return (
    manifestOutput(job.manifest, "catalog_safe_outputs") ??
    manifestOutput(job.manifest, "catalogSafeOutputs")
  );
}

export async function listPremiumPhotoJobs(input: { limit: number; offset: number }) {
  const where = { processingMode: "premium" as const };
  const [jobs, total] = await Promise.all([
    prisma.photoJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: input.limit,
      skip: input.offset,
      select: jobSelect,
    }),
    prisma.photoJob.count({ where }),
  ]);

  const skus = [...new Set(jobs.map((job) => job.sku))];
  const catalogSafeJobs = skus.length
    ? await prisma.photoJob.findMany({
        where: { processingMode: "catalog_safe", sku: { in: skus } },
        orderBy: { createdAt: "desc" },
        take: Math.min(input.limit * 4, 100),
        select: jobSelect,
      })
    : [];

  return {
    jobs: jobs.map((job) => {
      const fallback =
        catalogSafeJobs.find(
          (candidate) => candidate.sku === job.sku && candidate.view === job.view,
        ) ?? null;
      return serializeJob(job, fallback);
    }),
    total,
    limit: input.limit,
    offset: input.offset,
  };
}

const reviewableStatuses = new Set(["needs_review", "approved", "rejected"]);

export async function decidePhotoJob(input: {
  id: string;
  action: PhotoReviewAction;
  reviewerEmail: string;
}): Promise<PhotoReviewJob> {
  const existing = await findSelectedPhotoJob(input.id);
  if (!existing) {
    throw new PhotoReviewError("Photo job not found", "not_found");
  }
  if (!reviewableStatuses.has(existing.status)) {
    throw new PhotoReviewError(
      `A ${existing.status} photo job is not ready for a review decision`,
      "invalid_transition",
    );
  }
  if (existing.processingMode !== "premium") {
    throw new PhotoReviewError(
      "Only premium photo jobs can be decided in the premium review queue",
      "premium_required",
    );
  }
  if (input.action === "approve" && !isValidatedPremiumManifest(existing.manifest)) {
    throw new PhotoReviewError(
      "Premium output and measured label validation are required before approval",
      "invalid_transition",
    );
  }

  const targetStatus = input.action === "approve" ? "approved" : "rejected";
  if (existing.status === targetStatus) {
    return serializeJob(existing, null);
  }

  const reviewedAt = new Date();
  const result = await prisma.photoJob.updateMany({
    where: {
      id: existing.id,
      processingMode: "premium",
      status: existing.status,
    },
    data:
      input.action === "approve"
        ? {
            status: "approved",
            approvedBy: input.reviewerEmail,
            approvedAt: reviewedAt,
          }
        : {
            status: "rejected",
            approvedBy: null,
            approvedAt: null,
          },
  });
  if (result.count !== 1) {
    throw new PhotoReviewError(
      "The photo job changed while it was being reviewed; reload before deciding",
      "invalid_transition",
    );
  }

  const updated = await findSelectedPhotoJob(existing.id);
  if (!updated) {
    throw new PhotoReviewError("Photo job not found after review", "not_found");
  }

  return serializeJob(updated, null);
}
