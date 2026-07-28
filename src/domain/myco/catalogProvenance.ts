export type CatalogActorType = "staff" | "brand" | "admin" | "import";
export type CatalogFieldSource = "packaging" | "brand-provided" | "personal-knowledge" | "unsure";
export type CatalogChangeDisposition = "pending" | "accepted" | "rejected";
export type CatalogFieldState =
  | "unreviewed"
  | "confirmed"
  | "disputed"
  | "unknown"
  | "needs_re_review";

export interface CatalogFieldChangeInput {
  fieldName: string;
  previousValue: unknown;
  submittedValue: unknown;
  actorType: CatalogActorType;
  actorIdentity: string;
  source: CatalogFieldSource;
  disposition?: CatalogChangeDisposition;
}

export interface ExistingFieldState {
  state: CatalogFieldState;
  requiredConfirmations: number;
  confirmationsCount: number;
  confirmedValue: unknown;
}

export interface FieldVerificationRule {
  requiredConfirmations: number;
}

export interface FieldSubmission {
  value: unknown;
  actorType: CatalogActorType;
  actorIdentity: string;
  source: CatalogFieldSource;
}

export function normalizeRequiredConfirmations(rule: FieldVerificationRule | null | undefined): number {
  const value = rule?.requiredConfirmations ?? 1;
  return Number.isInteger(value) && value > 0 ? value : 1;
}

export function isKnownUnknownValue(value: unknown): boolean {
  return value === null || value === "unknown" || value === "UNKNOWN" || value === "__unknown__";
}

function stableValueKey(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => stableValueKey(item)));
  if (value && typeof value === "object") {
    const sorted = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValueKey(item)]);
    return JSON.stringify(sorted);
  }
  return JSON.stringify(value);
}

export function buildCatalogFieldChange(input: CatalogFieldChangeInput) {
  if (!input.fieldName.trim()) {
    throw new Error("fieldName is required");
  }
  if (!input.actorIdentity.trim()) {
    throw new Error("actorIdentity is required");
  }
  return {
    fieldName: input.fieldName.trim(),
    previousValue: input.previousValue === undefined ? null : input.previousValue,
    submittedValue: input.submittedValue === undefined ? null : input.submittedValue,
    actorType: input.actorType,
    actorIdentity: input.actorIdentity.trim(),
    source: input.source,
    disposition: input.disposition ?? "pending",
  };
}

export function computeFieldVerificationState(input: {
  current: ExistingFieldState | null;
  submissions: FieldSubmission[];
  rule?: FieldVerificationRule | null;
}): ExistingFieldState {
  const requiredConfirmations = normalizeRequiredConfirmations(input.rule);
  const submissions = input.submissions;
  if (submissions.length === 0) {
    return {
      state: input.current?.state ?? "unreviewed",
      requiredConfirmations,
      confirmationsCount: input.current?.confirmationsCount ?? 0,
      confirmedValue: input.current?.confirmedValue ?? null,
    };
  }

  if (submissions.every((submission) => isKnownUnknownValue(submission.value))) {
    return {
      state: "unknown",
      requiredConfirmations,
      confirmationsCount: submissions.length,
      confirmedValue: null,
    };
  }

  const known = submissions.filter((submission) => !isKnownUnknownValue(submission.value));
  const valueGroups = new Map<string, FieldSubmission[]>();
  for (const submission of known) {
    const key = stableValueKey(submission.value);
    valueGroups.set(key, [...(valueGroups.get(key) ?? []), submission]);
  }

  if (valueGroups.size > 1) {
    return {
      state: "disputed",
      requiredConfirmations,
      confirmationsCount: Math.max(...[...valueGroups.values()].map((group) => group.length)),
      confirmedValue: input.current?.confirmedValue ?? null,
    };
  }

  const agreed = known[0]?.value ?? null;
  const confirmationsCount = known.length;
  return {
    state: confirmationsCount >= requiredConfirmations ? "confirmed" : "unreviewed",
    requiredConfirmations,
    confirmationsCount,
    confirmedValue: confirmationsCount >= requiredConfirmations ? agreed : null,
  };
}

export function applyAcceptedChangeToFieldState(input: {
  current: ExistingFieldState;
  acceptedChange: { actorType: CatalogActorType; submittedValue: unknown };
}): ExistingFieldState {
  if (input.acceptedChange.actorType === "brand" && input.current.state === "confirmed") {
    return {
      ...input.current,
      state: "needs_re_review",
      confirmationsCount: 0,
      confirmedValue: input.acceptedChange.submittedValue,
    };
  }
  return {
    ...input.current,
    confirmedValue: input.acceptedChange.submittedValue,
  };
}
