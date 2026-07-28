import {
  ACTIVE_COMPOUNDS,
  LADDER_COMPATIBLE_MATERIAL_BASES,
} from "@/domain/recommendation-engine/doseBasis";

export const DOSE_PROVENANCE_FIELDS = [
  "packageMaterialMassMg",
  "unitMaterialMassMg",
  "materialMassBasis",
  "materialMassSource",
  "activeCompound",
  "activeCompoundSource",
] as const;

export type DoseProvenanceData = {
  packageMaterialMassMg?: number | null;
  unitMaterialMassMg?: number | null;
  materialMassBasis?: string | null;
  materialMassSource?: string | null;
  activeCompound?: string;
  activeCompoundSource?: string | null;
};

export type DoseProvenanceValidationResult =
  | { ok: true; data: DoseProvenanceData }
  | { ok: false; message: string };

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePositiveIntForField(
  field: "packageMaterialMassMg" | "unitMaterialMassMg",
  value: unknown,
): { ok: true; value: number | null | undefined } | { ok: false; message: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || value === "") return { ok: true, value: null };

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return { ok: false, message: `${field} must be a positive integer or null` };
  }

  return { ok: true, value: parsed };
}

function acceptedValuesMessage(field: "activeCompound" | "materialMassBasis", values: readonly string[]): string {
  return `${field} must be one of: ${values.join(", ")}`;
}

function isActiveCompound(value: string): value is (typeof ACTIVE_COMPOUNDS)[number] {
  return ACTIVE_COMPOUNDS.includes(value as (typeof ACTIVE_COMPOUNDS)[number]);
}

export function sanitizeDoseProvenanceInput(
  body: Record<string, unknown>,
  options: { includeAbsentFields?: boolean } = {},
): DoseProvenanceValidationResult {
  const data: DoseProvenanceData = {};
  const includeAbsentFields = options.includeAbsentFields ?? false;

  for (const field of ["packageMaterialMassMg", "unitMaterialMassMg"] as const) {
    if (!(field in body) && !includeAbsentFields) continue;
    const parsed = parsePositiveIntForField(field, body[field]);
    if (!parsed.ok) return parsed;
    if (parsed.value !== undefined || includeAbsentFields) data[field] = parsed.value ?? null;
  }

  if ("materialMassBasis" in body || includeAbsentFields) {
    const materialMassBasis = cleanText(body.materialMassBasis);
    if (!materialMassBasis) {
      data.materialMassBasis = null;
    } else if (!LADDER_COMPATIBLE_MATERIAL_BASES.includes(materialMassBasis)) {
      return {
        ok: false,
        message: acceptedValuesMessage("materialMassBasis", LADDER_COMPATIBLE_MATERIAL_BASES),
      };
    } else {
      data.materialMassBasis = materialMassBasis;
    }
  }

  if ("activeCompound" in body || includeAbsentFields) {
    const activeCompound = cleanText(body.activeCompound) ?? "unknown";
    if (!isActiveCompound(activeCompound)) {
      return {
        ok: false,
        message: acceptedValuesMessage("activeCompound", ACTIVE_COMPOUNDS),
      };
    }
    data.activeCompound = activeCompound;
  }

  if ("materialMassSource" in body || includeAbsentFields) {
    data.materialMassSource = cleanText(body.materialMassSource) ?? null;
  }

  if ("activeCompoundSource" in body || includeAbsentFields) {
    data.activeCompoundSource = cleanText(body.activeCompoundSource) ?? null;
  }

  return { ok: true, data };
}
