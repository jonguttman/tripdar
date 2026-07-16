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
  warnings: string[];
  approved_by: string | null;
  approved_at: string | null;
}
