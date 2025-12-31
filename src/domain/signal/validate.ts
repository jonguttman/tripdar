/**
 * Meaning Layer v1.0 — Application Guards
 *
 * Validation is explicit and strict to prevent meaning drift:
 * - Allow-list fields only (reject any extra keys, including forbidden fields)
 * - Require every field in the Signal Table Definition (including nulls)
 * - Validate enum membership against prisma/schema.prisma enums
 * - Enforce conditional referenceFrame rules
 */

import {
  ALLOWED_SIGNAL_FIELDS,
  DIMENSION_IDS,
  DIRECTIONS,
  DOSE_CATEGORIES,
  EXPERIENCE_SCALES,
  REFERENCE_FRAMES,
  type Direction,
  type DoseCategory,
  type ExperienceScale,
  type ReferenceFrame,
  type DimensionId,
} from "./constants";
import { SignalValidationError, type SignalValidationIssue } from "./errors";
import type { SignalRecord } from "./types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function assertEnumValue<T extends readonly string[]>(
  issues: SignalValidationIssue[],
  field: string,
  value: unknown,
  allowed: T
): value is T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    issues.push({
      kind: "invalid_enum",
      field,
      message: `Invalid enum value for ${field}: ${String(value)}. Allowed: ${allowed.join(", ")}`,
    });
    return false;
  }
  return true;
}

/**
 * Validates and narrows an unknown input into a SignalRecord.
 * Throws SignalValidationError with all issues found.
 */
export function validateCreateSignalInput(input: unknown): SignalRecord {
  const issues: SignalValidationIssue[] = [];

  if (!isPlainObject(input)) {
    throw new SignalValidationError([
      {
        kind: "invalid_type",
        field: "input",
        message: "Signal input must be an object",
      },
    ]);
  }

  // ---------------------------------------------------------------------------
  // Allow-list enforcement: reject ANY extra fields (forbidden fields included)
  // ---------------------------------------------------------------------------
  const allowed = new Set<string>(ALLOWED_SIGNAL_FIELDS);
  const keys = Object.keys(input);
  const forbiddenKeys = keys.filter((k) => !allowed.has(k));
  for (const k of forbiddenKeys) {
    issues.push({
      kind: "forbidden_field",
      field: k,
      message: `Forbidden field present: ${k}. Meaning Layer v1.0 Signal records contain exactly: ${ALLOWED_SIGNAL_FIELDS.join(", ")}`,
    });
  }

  // ---------------------------------------------------------------------------
  // Required fields: Signal Table Definition requires every field to be present
  // (including conditional fields which may be null)
  // ---------------------------------------------------------------------------
  for (const field of ALLOWED_SIGNAL_FIELDS) {
    if (!(field in input)) {
      issues.push({
        kind: "missing_field",
        field,
        message: `Missing required field: ${field}`,
      });
    }
  }

  // If required field presence is already broken, we still continue to collect
  // other issues, but must guard reads below.
  const get = (k: string): unknown => input[k];

  // ---------------------------------------------------------------------------
  // Primitive type checks
  // ---------------------------------------------------------------------------
  if ("id" in input && !isNonEmptyString(get("id"))) {
    issues.push({ kind: "invalid_type", field: "id", message: "id must be a non-empty string" });
  }
  if ("strainId" in input && !isNonEmptyString(get("strainId"))) {
    issues.push({ kind: "invalid_type", field: "strainId", message: "strainId must be a non-empty string" });
  }
  if ("sessionId" in input && !isNonEmptyString(get("sessionId"))) {
    issues.push({ kind: "invalid_type", field: "sessionId", message: "sessionId must be a non-empty string" });
  }
  if ("reportId" in input && !isNonEmptyString(get("reportId"))) {
    issues.push({ kind: "invalid_type", field: "reportId", message: "reportId must be a non-empty string" });
  }

  // dimensionId: enforce canonical 27-dimension vocabulary (Meaning Layer v1.0)
  if ("dimensionId" in input) {
    const dim = get("dimensionId");
    if (typeof dim !== "string" || !(DIMENSION_IDS as readonly string[]).includes(dim)) {
      issues.push({
        kind: "invalid_dimension",
        field: "dimensionId",
        message: `Invalid dimensionId: ${String(dim)}. Must be one of the 27 Meaning Layer dimensions.`,
      });
    }
  }

  // createdAt must be provided (no defaults) and must be a valid Date
  if ("createdAt" in input && !isDate(get("createdAt"))) {
    issues.push({
      kind: "invalid_type",
      field: "createdAt",
      message: "createdAt must be a valid Date",
    });
  }

  // ---------------------------------------------------------------------------
  // Enum validation (per prisma/schema.prisma)
  // ---------------------------------------------------------------------------
  const doseCategoryOk = "doseCategory" in input
    ? assertEnumValue(issues, "doseCategory", get("doseCategory"), DOSE_CATEGORIES)
    : false;
  const scaleOk = "scale" in input
    ? assertEnumValue(issues, "scale", get("scale"), EXPERIENCE_SCALES)
    : false;
  const referenceOk = "referenceFrame" in input
    ? assertEnumValue(issues, "referenceFrame", get("referenceFrame"), REFERENCE_FRAMES)
    : false;
  const directionOk = "direction" in input
    ? assertEnumValue(issues, "direction", get("direction"), DIRECTIONS)
    : false;

  // ---------------------------------------------------------------------------
  // Conditional referenceFrame rules (Signal Table Definition v1.0)
  // ---------------------------------------------------------------------------
  const comparisonDose = get("comparisonDose");
  const comparisonStrainId = get("comparisonStrainId");

  // Validate nullability types for comparison fields first
  if ("comparisonDose" in input) {
    if (comparisonDose !== null && typeof comparisonDose !== "string") {
      issues.push({
        kind: "invalid_type",
        field: "comparisonDose",
        message: "comparisonDose must be null or a DoseCategory enum value",
      });
    } else if (typeof comparisonDose === "string") {
      assertEnumValue(issues, "comparisonDose", comparisonDose, DOSE_CATEGORIES);
    }
  }

  if ("comparisonStrainId" in input) {
    if (comparisonStrainId !== null && !isNonEmptyString(comparisonStrainId)) {
      issues.push({
        kind: "invalid_type",
        field: "comparisonStrainId",
        message: "comparisonStrainId must be null or a non-empty string",
      });
    }
  }

  if (referenceOk && doseCategoryOk) {
    const referenceFrame = get("referenceFrame") as ReferenceFrame;
    const doseCategory = get("doseCategory") as DoseCategory;

    if (referenceFrame === "BASELINE") {
      if (comparisonDose !== null) {
        issues.push({
          kind: "conditional_violation",
          field: "comparisonDose",
          message: "comparisonDose must be null when referenceFrame = BASELINE",
        });
      }
      if (comparisonStrainId !== null) {
        issues.push({
          kind: "conditional_violation",
          field: "comparisonStrainId",
          message: "comparisonStrainId must be null when referenceFrame = BASELINE",
        });
      }
    }

    if (referenceFrame === "WITHIN_STRAIN") {
      if (comparisonDose === null) {
        issues.push({
          kind: "conditional_violation",
          field: "comparisonDose",
          message: "comparisonDose is required when referenceFrame = WITHIN_STRAIN",
        });
      } else if (typeof comparisonDose === "string" && comparisonDose === doseCategory) {
        issues.push({
          kind: "conditional_violation",
          field: "comparisonDose",
          message: "comparisonDose must differ from doseCategory when referenceFrame = WITHIN_STRAIN",
        });
      }
      if (comparisonStrainId !== null) {
        issues.push({
          kind: "conditional_violation",
          field: "comparisonStrainId",
          message: "comparisonStrainId must be null when referenceFrame = WITHIN_STRAIN",
        });
      }
    }
  }

  if (referenceOk) {
    const referenceFrame = get("referenceFrame") as ReferenceFrame;
    const strainId = get("strainId");

    if (referenceFrame === "CROSS_STRAIN") {
      if (!isNonEmptyString(strainId)) {
        // strainId type error is reported above; avoid cascading comparisons.
      } else {
        if (comparisonStrainId === null) {
          issues.push({
            kind: "conditional_violation",
            field: "comparisonStrainId",
            message: "comparisonStrainId is required when referenceFrame = CROSS_STRAIN",
          });
        } else if (typeof comparisonStrainId === "string" && comparisonStrainId === strainId) {
          issues.push({
            kind: "conditional_violation",
            field: "comparisonStrainId",
            message: "comparisonStrainId must differ from strainId when referenceFrame = CROSS_STRAIN",
          });
        }
      }
      if (comparisonDose !== null) {
        issues.push({
          kind: "conditional_violation",
          field: "comparisonDose",
          message: "comparisonDose must be null when referenceFrame = CROSS_STRAIN",
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Final: if any issues, throw
  // ---------------------------------------------------------------------------
  if (issues.length > 0 || !doseCategoryOk || !scaleOk || !referenceOk || !directionOk) {
    throw new SignalValidationError(issues);
  }

  // Safe cast now that we've validated
  const record: SignalRecord = {
    id: get("id") as string,
    strainId: get("strainId") as string,
    doseCategory: get("doseCategory") as DoseCategory,
    scale: get("scale") as ExperienceScale,
    dimensionId: get("dimensionId") as DimensionId,
    referenceFrame: get("referenceFrame") as ReferenceFrame,
    comparisonDose: get("comparisonDose") as DoseCategory | null,
    comparisonStrainId: get("comparisonStrainId") as string | null,
    direction: get("direction") as Direction,
    sessionId: get("sessionId") as string,
    reportId: get("reportId") as string,
    createdAt: get("createdAt") as Date,
  };

  return record;
}


