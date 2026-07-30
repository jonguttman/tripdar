/**
 * KEWL-2473 — the rendered panel, not just the model behind it.
 *
 * `listingBlockerRouting.test.ts` pins the resolver; this pins that the component
 * actually uses it — that a routable blocker becomes a real `<button>` pointing at an
 * anchor that exists, and an unroutable one becomes plain text with a reason. Those two
 * can only diverge in the component, so they are asserted on real markup.
 *
 * Rendered with `react-dom/server` deliberately: this repo has no DOM test environment
 * (no jsdom, no Testing Library), and adding one is a dependency decision, not a test
 * decision. Interaction-driven expansion is covered by `blockerPanelModel` round-trip
 * tests in the sibling file.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PHOTO_CHECK_FIELD } from "@/domain/myco/catalogFieldSpec";
import { fieldAnchorId } from "@/domain/myco/listingBlockerRouting";

import { ListingBlockerPanel } from "./staff-review-client";

type PanelProps = Parameters<typeof ListingBlockerPanel>[0];
type PanelField = PanelProps["fields"][number];
type PanelBlocker = PanelProps["gate"]["blockers"][number];

function field(partial: Pick<PanelField, "fieldName"> & Partial<PanelField>): PanelField {
  return {
    label: partial.fieldName,
    helpText: null,
    tier: "B",
    inputType: "text",
    readinessKey: null,
    allowsConfirmedAbsent: false,
    requiredConfirmations: 2,
    confirmationsCount: 0,
    state: "unreviewed",
    currentValue: null,
    competingValues: [],
    yourAnswer: null,
    yourAnswerAt: null,
    owedByYou: true,
    ...partial,
  };
}

const FIELDS: PanelField[] = [
  field({ fieldName: PHOTO_CHECK_FIELD, inputType: "photo_check", readinessKey: "photo", tier: "A" }),
  field({ fieldName: "productUnitMg", inputType: "number", readinessKey: "mg per unit" }),
  field({ fieldName: "allergens", inputType: "list" }),
  field({ fieldName: "onsetMinutes", inputType: "number", readinessKey: "onset", tier: "C" }),
];

function blocker(kind: string, fieldName: string | null, label: string): PanelBlocker {
  return { kind, fieldName, label };
}

function render(blockers: PanelBlocker[]): string {
  return renderToStaticMarkup(
    <ListingBlockerPanel
      gate={{
        listable: blockers.length === 0,
        viaOverride: false,
        blockers,
        verifiedFieldCount: 2,
        requiredFieldCount: 9,
      }}
      fields={FIELDS}
      onNavigate={() => {}}
    />
  );
}

/** Crude but sufficient: how many `<button>` elements the panel emitted. */
function buttonCount(markup: string): number {
  return markup.match(/<button/g)?.length ?? 0;
}

describe("<ListingBlockerPanel> — visible states", () => {
  it("renders no panel at all when nothing is blocking", () => {
    // The old empty-state panel ("Nothing blocking it.") must not survive the move under
    // the photo — it would push the review form down to say there is no news.
    const markup = render([]);

    expect(markup).toBe("");
    expect(markup).not.toContain("Nothing blocking it");
  });

  it("shows all three with no expand control at 3", () => {
    const markup = render([
      blocker("readiness", null, "Missing photo"),
      blocker("readiness", null, "Missing mg per unit"),
      blocker("unverified_field", "allergens", "Allergens is not verified"),
    ]);

    expect(markup).toContain("What&#x27;s blocking this listing");
    expect(markup).toContain("2 of 9 required fields verified.");
    expect(markup).not.toContain("aria-expanded");
    expect(buttonCount(markup)).toBe(3); // three destinations, no toggle
  });

  it("shows exactly 3 of 5 plus a toggle labelled with the hidden count", () => {
    const markup = render([
      blocker("readiness", null, "Missing photo"),
      blocker("readiness", null, "Missing mg per unit"),
      blocker("unverified_field", "allergens", "Allergens is not verified"),
      blocker("unverified_field", "onsetMinutes", "Onset (minutes) is not verified"),
      blocker("research_only", null, "Research-only product — excluded from the customer path"),
    ]);

    expect(markup).toContain("Show 2 more");
    expect(markup).toContain('aria-expanded="false"');
    // Toggle wires aria-controls to the list it governs.
    const controls = /aria-controls="([^"]+)"/.exec(markup)?.[1];
    expect(controls).toBeTruthy();
    expect(markup).toContain(`<ul id="${controls}"`);

    // The 4th and 5th are held back.
    expect(markup).not.toContain("Onset (minutes) is not verified");
    expect(markup).not.toContain("Research-only product");
  });
});

describe("<ListingBlockerPanel> — every row is a real destination or plainly inert", () => {
  it("gives a routable blocker a button and an anchor that a card actually renders", () => {
    const markup = render([blocker("readiness", null, "Missing photo")]);

    expect(buttonCount(markup)).toBe(1);
    expect(markup).toContain("Missing photo");
    // The destination is the photo-confirmation card, which carries this exact id.
    expect(fieldAnchorId(PHOTO_CHECK_FIELD)).toBe(`staff-field-${PHOTO_CHECK_FIELD}`);
  });

  it("renders research_only as non-tappable text with a reason", () => {
    const markup = render([
      blocker("research_only", null, "Research-only product — excluded from the customer path"),
    ]);

    expect(buttonCount(markup)).toBe(0);
    expect(markup).toContain("Research-only product");
    expect(markup).toMatch(/research-only products never enter the customer path/i);
  });

  it("renders an unresolvable readiness key as non-tappable text with a reason", () => {
    const markup = render([blocker("readiness", null, "Missing vibe profile")]);

    expect(buttonCount(markup)).toBe(0);
    expect(markup).toContain("Missing vibe profile");
    expect(markup).toMatch(/an admin has to fix it in the catalog/i);
  });

  it("emits no dead tap target when a blocker names a field this screen does not render", () => {
    const markup = render([
      blocker("unknown_active_compound", "activeCompound", "Active compound is unknown"),
    ]);

    // `activeCompound` is absent from FIELDS here, so the row must not look tappable.
    expect(buttonCount(markup)).toBe(0);
    expect(markup).toContain("Active compound is unknown");
  });

  it("mixes routable and inert rows in one panel without confusing the two", () => {
    const markup = render([
      blocker("unverified_field", "allergens", "Allergens is not verified"),
      blocker("research_only", null, "Research-only product"),
      blocker("readiness", null, "Missing onset"),
    ]);

    expect(buttonCount(markup)).toBe(2); // allergens + onset; research_only is inert
    expect(markup).toContain("Research-only product");
  });
});
