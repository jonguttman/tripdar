/**
 * KEWL-2335 — the listing gate.
 *
 * There was no gate before this: `active` was a free boolean and nothing checked
 * `intakeStatus`, which is how two under-verified products went live (KEWL-2327).
 * This is a binding constraint on activation, not an advisory dashboard filter.
 *
 * Listable = readiness satisfied (minus config-excluded Tier-D keys)
 *          AND every gate-required field verified
 *          AND activeCompound known
 *          AND not research-only.
 *
 * `computeReadiness()` itself is deliberately untouched — it remains the admin
 * completeness view. This gate consumes its output and subtracts the readiness keys
 * whose rule rows carry `gateRequired = false`.
 */

import { computeReadiness, type ReadinessInput } from "./readiness";
import { readinessKeysExcludedFromGate } from "./catalogFieldSpec";
import { fieldSatisfiesGate, type StaffFieldState } from "./staffFieldVerification";

export interface GateFieldRule {
  fieldName: string;
  tier: string;
  gateRequired: boolean;
  readinessKey: string | null;
  label: string | null;
  /** Empty = any confirmed value satisfies. Photo check uses ["yes"]. */
  gateSatisfyingValues: string[];
}

export interface ListingGateInput {
  readiness: ReadinessInput;
  rules: GateFieldRule[];
  /** fieldName -> computed staff verification state. */
  fieldStates: Record<string, StaffFieldState>;
  activeCompound: string;
  researchOnly: boolean;
  override: { at: Date | null; by: string | null; reason: string | null } | null;
}

export type ListingBlockerKind =
  | "readiness"
  | "unverified_field"
  | "disputed_field"
  | "unknown_active_compound"
  | "research_only";

export interface ListingBlocker {
  kind: ListingBlockerKind;
  fieldName: string | null;
  label: string;
}

export interface ListingGateResult {
  listable: boolean;
  /** True when listable only because Jon force-listed it. */
  viaOverride: boolean;
  blockers: ListingBlocker[];
  /** Blockers that remain even under an override — research-only is never overridable. */
  hardBlockers: ListingBlocker[];
  verifiedFieldCount: number;
  requiredFieldCount: number;
}

export function isValidOverride(
  override: ListingGateInput["override"]
): override is { at: Date; by: string; reason: string } {
  return Boolean(
    override && override.at && override.by && override.reason && override.reason.trim().length > 0
  );
}

export function evaluateListingGate(input: ListingGateInput): ListingGateResult {
  const blockers: ListingBlocker[] = [];
  const hardBlockers: ListingBlocker[] = [];

  // Research-only products are excluded outright, not parked forever failing a gate.
  // G23 (Lady Hyphae isolated solution) must never enter the customer path, and no
  // override may put it there.
  if (input.researchOnly) {
    const blocker: ListingBlocker = {
      kind: "research_only",
      fieldName: null,
      label: "Research-only product — excluded from the customer path",
    };
    blockers.push(blocker);
    hardBlockers.push(blocker);
  }

  // `activeCompound = unknown` fails closed regardless of whitespace/casing.
  if (!input.activeCompound || input.activeCompound.trim().toLowerCase() === "unknown") {
    blockers.push({
      kind: "unknown_active_compound",
      fieldName: "activeCompound",
      label: "Active compound is unknown — blocked and excluded from recommendations",
    });
  }

  // Readiness, minus the Tier-D keys excluded by config data.
  const excluded = readinessKeysExcludedFromGate(input.rules);
  const readiness = computeReadiness(input.readiness);
  for (const missing of readiness.missing) {
    if (excluded.has(missing)) continue;
    blockers.push({ kind: "readiness", fieldName: null, label: `Missing ${missing}` });
  }

  // Field verification.
  const gateRules = input.rules.filter((rule) => rule.gateRequired);
  let verifiedFieldCount = 0;
  for (const rule of gateRules) {
    const state = input.fieldStates[rule.fieldName];
    const label = rule.label ?? rule.fieldName;
    if (state && fieldSatisfiesGate(state, rule.gateSatisfyingValues)) {
      verifiedFieldCount += 1;
      continue;
    }
    if (state?.state === "disputed") {
      blockers.push({ kind: "disputed_field", fieldName: rule.fieldName, label: `${label} is disputed` });
      continue;
    }
    if (state?.state === "confirmed") {
      // Reviewed and agreed, but the agreed answer is not one the gate accepts —
      // e.g. "no, that is the wrong photo".
      blockers.push({
        kind: "unverified_field",
        fieldName: rule.fieldName,
        label: `${label} — reviewers answered “${String(state.confirmedValue)}”`,
      });
      continue;
    }
    blockers.push({
      kind: "unverified_field",
      fieldName: rule.fieldName,
      label: `${label} is not verified`,
    });
  }

  const cleanlyListable = blockers.length === 0;
  const overridden = !cleanlyListable && hardBlockers.length === 0 && isValidOverride(input.override);

  return {
    listable: cleanlyListable || overridden,
    viaOverride: overridden,
    blockers,
    hardBlockers,
    verifiedFieldCount,
    requiredFieldCount: gateRules.length,
  };
}

/**
 * The one question activation must ask. Kept separate from `evaluateListingGate` so a
 * caller cannot accidentally treat a rich result object as truthy.
 */
export function canActivate(result: ListingGateResult): boolean {
  return result.listable;
}
