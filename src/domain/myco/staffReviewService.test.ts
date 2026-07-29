/**
 * KEWL-2457 — a staff edit must not reach a customer before Jon has seen it.
 *
 * These tests exist because the obvious version of this fix is a no-op. Writing
 * `disposition: "pending"` at the submit route changes nothing on its own: the replay in
 * `computeFieldStates()` used to skip only `rejected`, so a pending change still counted
 * its confirmation, still reached `confirmed`, and was still written through to the live
 * `StoreProductCatalog` column by the same transaction. **The gate is the replay filter,
 * so that is what is pinned here** — a future refactor that "simplifies" the filter back
 * to `!== "rejected"` has to fail a test with a name that says why.
 *
 * Fixtures mirror live production per KEWL-2354: the six selector-reachable rows are all
 * `activeCompound: "unknown"` with zero `CatalogFieldVerificationState` rows, so the
 * interesting cases here start from an empty ledger and an empty cache, exactly as
 * production does. Nothing is seeded pre-confirmed except where a test needs the
 * already-accepted history that the 36 existing rows represent.
 */

import { describe, expect, it } from "vitest";
import {
  computeFieldStates,
  fieldsOwedBy,
  pendingStaffChangesByField,
  reviewerHasPendingAnswer,
  urgencyTierFor,
  type CatalogChangeRow,
  type FieldRuleRow,
} from "./staffReviewService";
import { CONFIRMED_ABSENT_VALUE } from "./catalogFieldSpec";

const CLAY = "employee-clay";
const AUDREY = "employee-audrey";

/** Tier A: one confirmation, writes through to a real catalog column. */
const TIER_A: FieldRuleRow = {
  fieldName: "productName",
  tier: "A",
  requiredConfirmations: 1,
  requiresDistinctReviewers: false,
  gateRequired: true,
  readinessKey: null,
  catalogColumn: "productName",
  label: "Product name",
  helpText: null,
  inputType: "text",
  allowsConfirmedAbsent: false,
  gateSatisfyingValues: [],
  sortOrder: 0,
};

/** Tier B: two DISTINCT reviewers. `activeCompound` is the live production value. */
const TIER_B: FieldRuleRow = {
  ...TIER_A,
  fieldName: "activeCompound",
  tier: "B",
  requiredConfirmations: 2,
  requiresDistinctReviewers: true,
  catalogColumn: "activeCompound",
  label: "Active compound",
  allowsConfirmedAbsent: true,
  sortOrder: 1,
};

const RULES = [TIER_A, TIER_B];

let clock = 0;
function change(overrides: Partial<CatalogChangeRow> & { id?: string }): CatalogChangeRow & { id: string } {
  clock += 1000;
  return {
    id: `change-${clock}`,
    fieldName: TIER_A.fieldName,
    submittedValue: "Blue Meanie 500mg",
    actorType: "staff",
    actorIdentity: CLAY,
    source: "packaging",
    disposition: "pending",
    createdAt: new Date(clock),
    ...overrides,
  };
}

describe("computeFieldStates — only accepted changes count (KEWL-2457)", () => {
  it("does not let a pending staff fill reach `confirmed` on a Tier-A field", () => {
    // Tier A needs ONE confirmation, so before this fix a single pending fill was
    // immediately confirmed and written to the live column.
    const states = computeFieldStates(RULES, [
      change({ disposition: "pending", submittedValue: "Blue Meanie 500mg" }),
    ]);

    expect(states.productName.state).toBe("unreviewed");
    expect(states.productName.confirmationsCount).toBe(0);
    expect(states.productName.confirmedValue).toBeNull();
  });

  it("keeps a pending change out of `liveValue`, so a teammate cannot Confirm it", () => {
    // `liveValue` is what the submit route resolves a "Confirm" against. If a pending
    // value leaked into it, one teammate pressing Confirm would launder an unreviewed
    // value into a second confirmation and straight past the gate.
    const states = computeFieldStates(RULES, [change({ disposition: "pending" })]);
    expect(states.productName.liveValue).toBeNull();
  });

  it("counts the same change once it is accepted", () => {
    const accepted = change({ disposition: "accepted", submittedValue: "Blue Meanie 500mg" });
    const states = computeFieldStates(RULES, [accepted]);

    expect(states.productName.state).toBe("confirmed");
    expect(states.productName.confirmedValue).toBe("Blue Meanie 500mg");
  });

  it("still ignores rejected changes", () => {
    const states = computeFieldStates(RULES, [change({ disposition: "rejected" })]);
    expect(states.productName.state).toBe("unreviewed");
  });

  it("holds a pending `confirmed_absent` back from clearing the column", () => {
    // "Not on the package" is the answer that reads like a non-answer and isn't: on
    // reaching `confirmed` the submit transaction writes NULL to the catalog column.
    // Pending, it must not reach `confirmed` at all.
    const pending = computeFieldStates(RULES, [
      change({ fieldName: TIER_B.fieldName, submittedValue: CONFIRMED_ABSENT_VALUE }),
      change({
        fieldName: TIER_B.fieldName,
        submittedValue: CONFIRMED_ABSENT_VALUE,
        actorIdentity: AUDREY,
      }),
    ]);
    expect(pending.activeCompound.state).not.toBe("confirmed");
    expect(pending.activeCompound.confirmedValue).toBeNull();
  });

  it("does not let two pending Tier-B answers satisfy the distinct-reviewer rule", () => {
    const states = computeFieldStates(RULES, [
      change({ fieldName: TIER_B.fieldName, submittedValue: "psilocybin" }),
      change({
        fieldName: TIER_B.fieldName,
        submittedValue: "psilocybin",
        actorIdentity: AUDREY,
      }),
    ]);
    expect(states.activeCompound.state).toBe("unreviewed");
    expect(states.activeCompound.confirmationsCount).toBe(0);
  });

  it("leaves the 36 already-accepted production rows counting exactly as before", () => {
    // No retro-flip: rows written `accepted` under the old behaviour keep their meaning.
    // If this ever fails, live confirmed data has silently un-confirmed itself.
    const states = computeFieldStates(RULES, [
      change({ fieldName: TIER_B.fieldName, submittedValue: "psilocybin", disposition: "accepted" }),
      change({
        fieldName: TIER_B.fieldName,
        submittedValue: "psilocybin",
        actorIdentity: AUDREY,
        disposition: "accepted",
      }),
    ]);
    expect(states.activeCompound.state).toBe("confirmed");
    expect(states.activeCompound.confirmedValue).toBe("psilocybin");
  });

  it("ignores a pending BRAND submission here, as it always did", () => {
    // Brand rows have always been written `pending` and have always been excluded by
    // actorType. This pins that the new filter did not change the brand path (KEWL-2331).
    const states = computeFieldStates(RULES, [
      change({ actorType: "brand", actorIdentity: "brand-acme", disposition: "pending" }),
    ]);
    expect(states.productName.state).toBe("unreviewed");
  });
});

describe("pendingStaffChangesByField — visible, never counted", () => {
  it("surfaces the queued edit that computeFieldStates deliberately drops", () => {
    const rows = [change({ disposition: "pending", submittedValue: "Blue Meanie 500mg" })];
    const pending = pendingStaffChangesByField(rows);

    expect(pending.productName).toHaveLength(1);
    expect(pending.productName[0].submittedValue).toBe("Blue Meanie 500mg");
    expect(pending.productName[0].actorIdentity).toBe(CLAY);
  });

  it("excludes accepted, rejected, brand rows and reviewer notes", () => {
    const pending = pendingStaffChangesByField([
      change({ disposition: "accepted" }),
      change({ disposition: "rejected" }),
      change({ disposition: "pending", actorType: "brand" }),
      change({ disposition: "pending", fieldName: "__reviewer_note", submittedValue: "hi" }),
    ]);
    expect(Object.keys(pending)).toHaveLength(0);
  });

  it("orders a field's queue oldest-first so a replay keeps submission order", () => {
    const first = change({ submittedValue: "first" });
    const second = change({ submittedValue: "second", actorIdentity: AUDREY });
    // Deliberately handed over newest-first: ordering must come from createdAt, not
    // from however the caller's query happened to sort.
    const pending = pendingStaffChangesByField([second, first]);
    expect(pending.productName.map((row) => row.submittedValue)).toEqual(["first", "second"]);
  });
});

describe("a queued answer stops the re-ask (KEWL-2457 requirement 4)", () => {
  it("marks the field owed when nobody has answered", () => {
    const states = computeFieldStates(RULES, []);
    expect(fieldsOwedBy({ rules: RULES, fieldStates: states, reviewerId: CLAY })).toContain(
      "productName"
    );
  });

  it("stops owing the field once YOUR answer is in the queue", () => {
    // Without this the pending row is invisible to the state replay, the field reads as
    // untouched, and the reviewer is nagged to retype what they just submitted.
    const rows = [change({ disposition: "pending" })];
    const states = computeFieldStates(RULES, rows);
    const pendingByField = pendingStaffChangesByField(rows);

    expect(
      fieldsOwedBy({ rules: RULES, fieldStates: states, reviewerId: CLAY, pendingByField })
    ).not.toContain("productName");
  });

  it("still owes the field for a teammate who has NOT answered", () => {
    // A queued answer silences the person who wrote it, not the whole store — peer
    // review is the only check that survives while the change waits on Jon.
    const rows = [change({ disposition: "pending" })];
    const states = computeFieldStates(RULES, rows);
    const pendingByField = pendingStaffChangesByField(rows);

    expect(
      fieldsOwedBy({ rules: RULES, fieldStates: states, reviewerId: AUDREY, pendingByField })
    ).toContain("productName");
  });

  it("reads a queued answer as 'you have reviewed this' for urgency ordering", () => {
    const rows = [
      change({ disposition: "pending" }),
      change({ fieldName: TIER_B.fieldName, disposition: "pending" }),
    ];
    const states = computeFieldStates(RULES, rows);
    const pendingByField = pendingStaffChangesByField(rows);

    // 4 = "You're done here"; without the pending input this product would read as
    // tier 1, "Nobody has reviewed this", and be pushed back to the top of the list.
    expect(
      urgencyTierFor({ fieldStates: states, rules: RULES, reviewerId: CLAY, pendingByField })
    ).toBe(4);
    // ...and to a teammate it is still tier 2, "You haven't reviewed this".
    expect(
      urgencyTierFor({ fieldStates: states, rules: RULES, reviewerId: AUDREY, pendingByField })
    ).toBe(2);
  });

  it("reviewerHasPendingAnswer copes with a field nobody has queued", () => {
    expect(reviewerHasPendingAnswer(undefined, CLAY)).toBe(false);
  });
});
