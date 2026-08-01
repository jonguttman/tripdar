import type { PhotoProcessingMode } from "./naming";

export type PhotoJobStatus =
  | "uploaded"
  | "analyzing"
  | "processing"
  | "validating"
  | "needs_review"
  | "approved"
  | "rejected"
  | "failed";

export interface PhotoManifestOutputs {
  transparent_master: string | null;
  white_master: string | null;
  web: string | null;
  thumbnail: string | null;
}

export interface PhotoManifest {
  job_id: string;
  sku: string;
  source_file: string;
  processing_mode: PhotoProcessingMode;
  status: PhotoJobStatus;
  outputs: PhotoManifestOutputs;
  quality_score: number | null;
  label_fidelity_score: number | null;
  background_removal: {
    provider: string;
    model: string;
    output_kind?: "mask_or_cutout" | "generative_image";
    cost_usd: number;
    usage: unknown;
  } | null;
  warnings: string[];
  approved_by: string | null;
  approved_at: string | null;
  requires_review?: boolean;
  catalog_safe_outputs?: PhotoManifestOutputs;
  label_validation?: {
    score: number;
    passed: boolean;
    hardFlagged: boolean;
    requiresReview: boolean;
    criticalDeltas: Array<{
      category: string;
      source: string[];
      premium: string[];
      reason: string;
    }>;
    issues: string[];
    warnings?: string[];
    signals: Record<string, unknown>;
    regions: Record<string, unknown>;
  };
}
