/**
 * Meaning Layer v1.0 — Application Guards
 *
 * Error types are structured so callers can distinguish:
 * - Missing fields
 * - Invalid enum values
 * - Conditional rule violations
 * - Forbidden field presence (via allow-list rejection)
 */

export type SignalValidationIssueKind =
  | "missing_field"
  | "invalid_enum"
  | "invalid_type"
  | "conditional_violation"
  | "forbidden_field"
  | "invalid_dimension";

export interface SignalValidationIssue {
  readonly kind: SignalValidationIssueKind;
  readonly field: string;
  readonly message: string;
}

export class SignalValidationError extends Error {
  readonly name = "SignalValidationError";
  readonly issues: readonly SignalValidationIssue[];

  constructor(issues: readonly SignalValidationIssue[]) {
    super(`Signal validation failed (${issues.length} issue${issues.length === 1 ? "" : "s"})`);
    this.issues = issues;
  }
}

export class SignalImmutabilityError extends Error {
  readonly name = "SignalImmutabilityError";
  constructor(message: string) {
    super(message);
  }
}


