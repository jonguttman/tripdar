/**
 * KEWL-2473 — the blocker panel must never render a tap target that goes nowhere.
 *
 * The panel sits directly under the photo now, so a row that looks tappable and silently
 * does nothing convinces the reviewer they acted. These tests pin the resolver against
 * every kind `evaluateListingGate` can emit, using the real seeded field set rather than
 * hand-built fixtures — a rename in `catalogFieldSpec.ts` that breaks routing should fail
 * here, not in production.
 */

import { describe, expect, it } from "vitest";

import {
  CATALOG_FIELD_SPECS,
  PHOTO_CHECK_FIELD,
  REVIEWABLE_FIELD_SPECS,
} from "./catalogFieldSpec";
import { evaluateListingGate, type GateFieldRule } from "./listingGate";
import { type ReadinessInput } from "./readiness";
import {
  COLLAPSED_BLOCKER_LIMIT,
  blockerInertReason,
  blockerKey,
  blockerPanelModel,
  fieldAnchorId,
  readinessKeyFromLabel,
  resolveBlockerTarget,
  type RoutableBlocker,
  type RoutableField,
} from "./listingBlockerRouting";

/** Exactly what the detail route renders: every rule that is not Tier D. */
const RENDERED_FIELDS: RoutableField[] = REVIEWABLE_FIELD_SPECS.map((spec) => ({
  fieldName: spec.fieldName,
  readinessKey: spec.readinessKey,
}));

function blocker(partial: Partial<RoutableBlocker> & { kind: string }): RoutableBlocker {
  return { fieldName: null, label: "", ...partial };
}

describe("resolveBlockerTarget — the five kinds evaluateListingGate emits", () => {
  it("routes disputed_field to that field's card", () => {
    const target = resolveBlockerTarget(
      blocker({ kind: "disputed_field", fieldName: "productUnitMg", label: "Amount per unit (mg) is disputed" }),
      RENDERED_FIELDS
    );

    expect(target).toEqual({
      fieldName: "productUnitMg",
      anchorId: "staff-field-productUnitMg",
    });
  });

  it("routes unverified_field to that field's card", () => {
    const target = resolveBlockerTarget(
      blocker({ kind: "unverified_field", fieldName: "allergens", label: "Allergens is not verified" }),
      RENDERED_FIELDS
    );

    expect(target?.fieldName).toBe("allergens");
  });

  it("routes an unverified photo check to the photo-confirmation card, not a FieldCard", () => {
    const target = resolveBlockerTarget(
      blocker({
        kind: "unverified_field",
        fieldName: PHOTO_CHECK_FIELD,
        label: "Is this the correct photo for this product? — reviewers answered “no”",
      }),
      RENDERED_FIELDS
    );

    // Same resolver, and it lands on the photo_check field — the card rendered above the
    // rest of the form. This is the "including photo confirmation" case.
    expect(target).toEqual({
      fieldName: PHOTO_CHECK_FIELD,
      anchorId: fieldAnchorId(PHOTO_CHECK_FIELD),
    });
    expect(
      REVIEWABLE_FIELD_SPECS.find((spec) => spec.fieldName === PHOTO_CHECK_FIELD)?.inputType
    ).toBe("photo_check");
  });

  it("routes unknown_active_compound to the activeCompound card, because one is rendered", () => {
    // The gate names a catalog column here, but `activeCompound` is also a seeded Tier-B
    // rule, so the detail screen does render a card for it. Resolving against what is on
    // the page — not against the kind — is what makes this a live destination.
    const target = resolveBlockerTarget(
      blocker({
        kind: "unknown_active_compound",
        fieldName: "activeCompound",
        label: "Active compound is unknown — blocked and excluded from recommendations",
      }),
      RENDERED_FIELDS
    );

    expect(target?.fieldName).toBe("activeCompound");
  });

  it("makes unknown_active_compound inert if that card ever stops being rendered", () => {
    const withoutActiveCompound = RENDERED_FIELDS.filter(
      (field) => field.fieldName !== "activeCompound"
    );

    expect(
      resolveBlockerTarget(
        blocker({ kind: "unknown_active_compound", fieldName: "activeCompound", label: "…" }),
        withoutActiveCompound
      )
    ).toBeNull();
  });

  it("routes a readiness blocker via its label to the field supplying that key", () => {
    const target = resolveBlockerTarget(
      blocker({ kind: "readiness", fieldName: null, label: "Missing mg per unit" }),
      RENDERED_FIELDS
    );

    expect(target?.fieldName).toBe("productUnitMg");
  });

  it("routes the `photo` readiness key to the photo-confirmation card", () => {
    const target = resolveBlockerTarget(
      blocker({ kind: "readiness", fieldName: null, label: "Missing photo" }),
      RENDERED_FIELDS
    );

    expect(target?.fieldName).toBe(PHOTO_CHECK_FIELD);
  });

  it("leaves an unresolvable readiness key with no target", () => {
    // Tier-D keys have no rendered control at all — nothing on this screen supplies them.
    const target = resolveBlockerTarget(
      blocker({ kind: "readiness", fieldName: null, label: "Missing vibe profile" }),
      RENDERED_FIELDS
    );

    expect(target).toBeNull();
  });

  it("leaves research_only with no target even though other kinds would resolve", () => {
    const target = resolveBlockerTarget(
      blocker({
        kind: "research_only",
        fieldName: null,
        label: "Research-only product — excluded from the customer path",
      }),
      RENDERED_FIELDS
    );

    expect(target).toBeNull();
  });

  it("refuses a fieldName that names a real column but is not on this screen", () => {
    expect(
      resolveBlockerTarget(
        blocker({ kind: "unverified_field", fieldName: "vibeProfile", label: "Vibe profile is not verified" }),
        RENDERED_FIELDS
      )
    ).toBeNull();
  });

  it("resolves nothing when the payload predates readinessKey", () => {
    const legacyPayload: RoutableField[] = RENDERED_FIELDS.map(({ fieldName }) => ({ fieldName }));

    // Degrades to inert rather than to a wrong destination.
    expect(
      resolveBlockerTarget(
        blocker({ kind: "readiness", fieldName: null, label: "Missing photo" }),
        legacyPayload
      )
    ).toBeNull();
  });
});

describe("readinessKeyFromLabel", () => {
  it("reads every key computeReadiness can emit out of its label", () => {
    const keys = [
      "photo",
      "brand",
      "format",
      "mg per unit",
      "units per pack",
      "onset",
      "duration",
      "vibe profile",
      "brand dose guidance",
      "strength offset confirmation",
    ];

    for (const key of keys) {
      expect(readinessKeyFromLabel(`Missing ${key}`)).toBe(key);
    }
  });

  it("returns null for a label that is not a readiness label", () => {
    expect(readinessKeyFromLabel("Allergens is not verified")).toBeNull();
    expect(readinessKeyFromLabel("Missing")).toBeNull();
  });
});

describe("blockerPanelModel — 0 / 1–3 / 4+", () => {
  const make = (count: number): RoutableBlocker[] =>
    Array.from({ length: count }, (_, index) =>
      blocker({ kind: "readiness", label: `Missing thing ${index}` })
    );

  it("shows nothing and offers no toggle at 0", () => {
    const model = blockerPanelModel([], false);

    expect(model.visible).toHaveLength(0);
    expect(model.canExpand).toBe(false);
    expect(model.hiddenCount).toBe(0);
  });

  it.each([1, 2, 3])("shows all %i with no expand control", (count) => {
    const model = blockerPanelModel(make(count), false);

    expect(model.visible).toHaveLength(count);
    expect(model.canExpand).toBe(false);
    expect(model.hiddenCount).toBe(0);
  });

  it("shows exactly 3 of 4 and offers the toggle", () => {
    const model = blockerPanelModel(make(4), false);

    expect(model.visible).toHaveLength(COLLAPSED_BLOCKER_LIMIT);
    expect(model.canExpand).toBe(true);
    expect(model.hiddenCount).toBe(1);
  });

  it("survives the expand → collapse round trip", () => {
    const blockers = make(7);

    const collapsed = blockerPanelModel(blockers, false);
    expect(collapsed.visible).toHaveLength(3);
    expect(collapsed.hiddenCount).toBe(4);

    const expanded = blockerPanelModel(blockers, true);
    expect(expanded.visible).toHaveLength(7);
    expect(expanded.hiddenCount).toBe(0);
    expect(expanded.canExpand).toBe(true);

    const recollapsed = blockerPanelModel(blockers, false);
    expect(recollapsed.visible).toEqual(collapsed.visible);
    expect(recollapsed.hiddenCount).toBe(4);
  });

  it("keeps the first 3 stable across the round trip so keys do not churn", () => {
    const blockers = make(6);
    const collapsedKeys = blockerPanelModel(blockers, false).visible.map(blockerKey);
    const expandedKeys = blockerPanelModel(blockers, true).visible.map(blockerKey);

    expect(expandedKeys.slice(0, 3)).toEqual(collapsedKeys);
    expect(new Set(expandedKeys).size).toBe(6);
  });
});

describe("blockerInertReason", () => {
  it("explains research-only as terminal, not as work to do", () => {
    const reason = blockerInertReason(blocker({ kind: "research_only" }));

    expect(reason).toMatch(/research-only/i);
    expect(reason).toMatch(/nothing to fix/i);
  });

  it("points every other dead end at an admin", () => {
    expect(blockerInertReason(blocker({ kind: "readiness", label: "Missing vibe profile" }))).toMatch(
      /admin/i
    );
  });

  it("gives a reason for every blocker the resolver refuses", () => {
    const unresolvable = [
      blocker({ kind: "research_only", label: "Research-only product" }),
      blocker({ kind: "readiness", label: "Missing strength offset confirmation" }),
      blocker({ kind: "unverified_field", fieldName: "vibeProfile", label: "Vibe profile" }),
    ];

    for (const entry of unresolvable) {
      expect(resolveBlockerTarget(entry, RENDERED_FIELDS)).toBeNull();
      expect(blockerInertReason(entry).length).toBeGreaterThan(0);
    }
  });
});

/**
 * The coupling guard.
 *
 * `readinessKeyFromLabel` parses `Missing ${key}` — a template that lives in
 * `listingGate.ts`, in USER-VISIBLE copy that will get reworded. Every other readiness
 * test in this file hand-writes that string, so all of them keep passing after a
 * rewording while the resolver silently stops resolving anything: all 8 reachable
 * readiness blockers turn inert and tell the reviewer "an admin has to fix it in the
 * catalog" about a field they are looking straight at. Green CI, wrong screen.
 *
 * So this drives the REAL gate and asserts each blocker it emits still finds its card.
 * Reword the label, rename a `readinessKey`, or drop a rule from the rendered set, and
 * this fails here instead of in front of a reviewer.
 */
describe("readiness labels stay routable against the real gate", () => {
  /** Nothing supplied — so `computeReadiness` reports every key missing. */
  const EMPTY_READINESS: ReadinessInput = {
    format: "",
    brand: null,
    brandId: null,
    productUnitMg: null,
    unitsPerPack: null,
    totalDoseMg: null,
    onsetMinutes: null,
    durationMinutes: null,
    brandMicroUnits: null,
    brandMiniUnits: null,
    brandMacroUnits: null,
    brandDoseTiers: null,
    photoUrl: null,
    photoCount: 0,
    vibeScores: null,
    strengthOffset: null,
  };

  /** The full seeded rule set, Tier D included — that is what drives gate exclusion. */
  const GATE_RULES: GateFieldRule[] = CATALOG_FIELD_SPECS.map((spec) => ({
    fieldName: spec.fieldName,
    tier: spec.tier,
    gateRequired: spec.gateRequired,
    readinessKey: spec.readinessKey,
    label: spec.label,
    gateSatisfyingValues: spec.gateSatisfyingValues,
  }));

  const readinessBlockers = evaluateListingGate({
    readiness: EMPTY_READINESS,
    rules: GATE_RULES,
    fieldStates: {},
    activeCompound: "psilocybin",
    researchOnly: false,
    override: null,
  }).blockers.filter((entry) => entry.kind === "readiness");

  it("emits the 8 gate-relevant readiness keys and no Tier-D ones", () => {
    expect(readinessBlockers).toHaveLength(8);
  });

  it("routes every readiness blocker the gate actually emits to a rendered card", () => {
    const unroutable = readinessBlockers.filter(
      (entry) => resolveBlockerTarget(entry, RENDERED_FIELDS) === null
    );

    // Named rather than counted so a failure says WHICH label stopped parsing.
    expect(unroutable.map((entry) => entry.label)).toEqual([]);
  });

  it("sends the photo readiness blocker to the photo-confirmation card", () => {
    const photo = readinessBlockers.find((entry) => entry.label.includes("photo"));

    expect(resolveBlockerTarget(photo!, RENDERED_FIELDS)?.fieldName).toBe(PHOTO_CHECK_FIELD);
  });
});
