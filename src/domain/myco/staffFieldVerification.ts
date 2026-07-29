/**
 * KEWL-2335 — staff-review counting rules.
 *
 * Extends (does not replace) `computeFieldVerificationState()` from KEWL-2332's
 * catalogProvenance.ts. That helper counts submissions; it has no concept of *who*
 * submitted, which Tier B requires ("2 confirmations from 2 DIFFERENT reviewers").
 *
 * The approved rules:
 *  - Only Confirm and Correct count. "I don't know" NEVER counts.
 *  - "Confirmed absent" is a real answer and DOES satisfy the gate.
 *  - Tier B needs two DISTINCT reviewers agreeing on the SAME value.
 *  - A Correct that changes an established value resets that field to 1 and
 *    supersedes prior agreement.
 *  - Conflicts surface, never last-write-wins. A disputed Tier-B field blocks listing.
 *  - Brand submissions never count toward the gate; an accepted brand change to a
 *    staff-confirmed field flips it to needs_re_review.
 */

import {
  CONFIRMED_ABSENT_VALUE,
  DONT_KNOW_VALUE,
} from "./catalogFieldSpec";
import type { CatalogActorType, CatalogFieldSource, CatalogFieldState } from "./catalogProvenance";

export interface StaffFieldSubmission {
  value: unknown;
  actorType: CatalogActorType;
  /** Reviewer identity — the MycoEmployee id for staff. Distinctness is measured on this. */
  actorIdentity: string;
  source: CatalogFieldSource;
  createdAt: Date;
}

export interface StaffFieldRule {
  requiredConfirmations: number;
  requiresDistinctReviewers: boolean;
}

export interface StaffFieldState {
  state: CatalogFieldState;
  /** Distinct reviewers backing the currently live value. */
  confirmationsCount: number;
  requiredConfirmations: number;
  confirmedValue: unknown;
  /**
   * The value currently on the table — the live candidate, whether or not it has reached
   * its confirmation threshold. This is what a reviewer sees and what "Confirm" agrees
   * with. Distinct from `confirmedValue`, which is null until the threshold is met.
   */
  liveValue: unknown;
  /** True once two different values have ever been submitted by staff. */
  everConflicted: boolean;
  /** All distinct competing values still on record — conflicts surface, we keep both. */
  competingValues: unknown[];
  /** Reviewer ids who answered "I don't know" — stop nagging them about this field. */
  dontKnowReviewers: string[];
  /** Reviewer ids who have answered this field at all, in any way. */
  answeredReviewers: string[];
}

export function isDontKnow(value: unknown): boolean {
  return value === DONT_KNOW_VALUE;
}

export function isConfirmedAbsent(value: unknown): boolean {
  return value === CONFIRMED_ABSENT_VALUE;
}

/** Empty / blank submissions are not answers. Confirmed-absent is how you say "nothing here". */
function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function valueKey(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) {
    // Ingredient/allergen lists are sets, not sequences — order must not create a false dispute.
    return JSON.stringify([...value].map((item) => valueKey(item)).sort());
  }
  if (value && typeof value === "object") {
    const sorted = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, valueKey(item)]);
    return JSON.stringify(sorted);
  }
  if (typeof value === "string") return JSON.stringify(value.trim().toLowerCase());
  return JSON.stringify(value);
}

/**
 * Once a field has held conflicting values, clearing the dispute takes real consensus:
 * at least two distinct reviewers on the surviving value, even for a Tier-A field whose
 * normal threshold is 1. Without this, a single Correct on a Tier-A field would
 * immediately re-confirm at count 1 — which is precisely the last-write-wins the spec
 * forbids.
 */
export function requiredAfterConflict(rule: StaffFieldRule): number {
  return Math.max(rule.requiredConfirmations, 2);
}

export function computeStaffFieldState(input: {
  submissions: StaffFieldSubmission[];
  rule: StaffFieldRule;
}): StaffFieldState {
  const { rule } = input;
  const requiredConfirmations = Math.max(1, rule.requiredConfirmations);

  // Brand and import submissions never count toward the gate.
  const staffSubmissions = input.submissions
    .filter((s) => s.actorType === "staff")
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const answeredReviewers: string[] = [];
  const dontKnowReviewers: string[] = [];
  const seenValueKeys = new Set<string>();
  const competingValues: unknown[] = [];

  // The live value and the distinct reviewers backing it.
  let liveKey: string | null = null;
  let liveValue: unknown = null;
  let liveReviewers = new Set<string>();
  let everConflicted = false;
  let sawCountingAnswer = false;

  for (const submission of staffSubmissions) {
    if (!answeredReviewers.includes(submission.actorIdentity)) {
      answeredReviewers.push(submission.actorIdentity);
    }

    if (isDontKnow(submission.value)) {
      // Reviewed, unknown. Does not satisfy the gate, but must stop nagging THIS
      // reviewer about THIS field.
      if (!dontKnowReviewers.includes(submission.actorIdentity)) {
        dontKnowReviewers.push(submission.actorIdentity);
      }
      continue;
    }
    if (isBlank(submission.value)) continue;

    sawCountingAnswer = true;
    const key = valueKey(submission.value);
    if (!seenValueKeys.has(key)) {
      seenValueKeys.add(key);
      competingValues.push(submission.value);
    }

    if (liveKey === null) {
      liveKey = key;
      liveValue = submission.value;
      liveReviewers = new Set([submission.actorIdentity]);
      continue;
    }

    if (key === liveKey) {
      // Agreement. A repeat from the same reviewer does not add a second confirmation.
      liveReviewers.add(submission.actorIdentity);
      continue;
    }

    // A Correct that changes an established value: resets to 1 and supersedes prior
    // agreement — but the conflict is on record permanently.
    everConflicted = true;
    liveKey = key;
    liveValue = submission.value;
    liveReviewers = new Set([submission.actorIdentity]);
  }

  const effectiveRequired = everConflicted ? requiredAfterConflict(rule) : requiredConfirmations;
  const confirmationsCount = rule.requiresDistinctReviewers || everConflicted
    ? liveReviewers.size
    : Math.min(liveReviewers.size, effectiveRequired);

  let state: CatalogFieldState;
  if (!sawCountingAnswer) {
    state = dontKnowReviewers.length > 0 ? "unknown" : "unreviewed";
  } else if (confirmationsCount >= effectiveRequired) {
    state = "confirmed";
  } else if (everConflicted) {
    state = "disputed";
  } else {
    state = "unreviewed";
  }

  return {
    state,
    confirmationsCount,
    requiredConfirmations: effectiveRequired,
    confirmedValue: state === "confirmed" ? liveValue : null,
    liveValue,
    everConflicted,
    competingValues,
    dontKnowReviewers,
    answeredReviewers,
  };
}

/**
 * Does this field's state satisfy the listing gate?
 *
 * "Confirmed absent" reaches `confirmed` like any other value — seven products are
 * legitimately strainless and must be able to list.
 *
 * `gateSatisfyingValues` narrows which confirmed answers count. The photo check uses
 * ["yes"], so a product everyone agrees carries the WRONG photo is fully reviewed and
 * still blocked — which is the entire reason for asking the question.
 */
export function fieldSatisfiesGate(
  state: StaffFieldState,
  gateSatisfyingValues: string[] = []
): boolean {
  if (state.state !== "confirmed") return false;
  if (gateSatisfyingValues.length === 0) return true;
  return gateSatisfyingValues.some((allowed) => valueKey(allowed) === valueKey(state.confirmedValue));
}

/** True when this reviewer should still be prompted about this field. */
export function reviewerStillOwesField(state: StaffFieldState, reviewerId: string): boolean {
  if (state.state === "disputed") return true; // disputes need everyone's eyes
  if (state.dontKnowReviewers.includes(reviewerId)) return false;
  if (state.state === "confirmed" && !state.everConflicted) {
    // Already settled and this reviewer has weighed in — nothing owed.
    return !state.answeredReviewers.includes(reviewerId) && state.confirmationsCount < state.requiredConfirmations;
  }
  return !state.answeredReviewers.includes(reviewerId) || state.confirmationsCount < state.requiredConfirmations;
}
