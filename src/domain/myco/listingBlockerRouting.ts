/**
 * KEWL-2473 — where a listing blocker sends the reviewer, and how many we show.
 *
 * The blocker panel sits directly under the product photo, so every row in it is the
 * first thing a reviewer reaches for. That makes a dead tap target actively harmful:
 * the reviewer taps, nothing moves, and they believe they acted. So a blocker either
 * navigates to a control that is genuinely on the page, or it renders as plain text
 * with a reason. There is no third state.
 *
 * `blocker.fieldName` is NOT a destination. `evaluateListingGate` emits five kinds and
 * only `disputed_field` / `unverified_field` carry a field name that reliably matches a
 * rendered card; `readiness` carries `null` and hides its target in the label, and
 * `research_only` has no target at all. Hence one explicit resolver, resolved against
 * the fields the page actually rendered rather than against what the blocker claims.
 *
 * Kept free of React so it can be tested directly — this repo has no DOM test runner.
 */

/** Blockers as the staff client receives them (`ListingBlocker` over the wire). */
export interface RoutableBlocker {
  kind: string;
  fieldName: string | null;
  label: string;
}

/** The subset of a rendered detail field this module needs to resolve a destination. */
export interface RoutableField {
  fieldName: string;
  /** Present since KEWL-2473; absent on an older payload, which just makes keys unresolvable. */
  readinessKey?: string | null;
}

export interface BlockerTarget {
  /** The field whose card the reviewer is sent to. */
  fieldName: string;
  /** DOM id of that card's wrapper. */
  anchorId: string;
}

/** Blockers shown before the reviewer expands the panel. */
export const COLLAPSED_BLOCKER_LIMIT = 3;

export function fieldAnchorId(fieldName: string): string {
  return `staff-field-${fieldName}`;
}

/**
 * `readiness` blockers carry `fieldName: null` and encode their subject in the label as
 * `Missing ${key}` (listingGate.ts:105). Anything else is not a readiness label we
 * understand, and an unrecognised label must resolve to nothing rather than guess.
 */
export function readinessKeyFromLabel(label: string): string | null {
  const match = /^Missing (.+)$/.exec(label.trim());
  return match ? match[1].trim() : null;
}

/**
 * The one place a blocker becomes a destination.
 *
 * Returns null whenever the destination is not on the page — including for a blocker
 * whose `fieldName` names a real catalog column that this screen does not render.
 */
export function resolveBlockerTarget(
  blocker: RoutableBlocker,
  fields: readonly RoutableField[]
): BlockerTarget | null {
  // Nothing a reviewer can supply clears research-only, and no override clears it either.
  if (blocker.kind === "research_only") return null;

  const rendered =
    blocker.kind === "readiness"
      ? findByReadinessKey(fields, readinessKeyFromLabel(blocker.label))
      : findByFieldName(fields, blocker.fieldName);

  if (!rendered) return null;
  return { fieldName: rendered.fieldName, anchorId: fieldAnchorId(rendered.fieldName) };
}

function findByFieldName(
  fields: readonly RoutableField[],
  fieldName: string | null
): RoutableField | undefined {
  if (!fieldName) return undefined;
  return fields.find((field) => field.fieldName === fieldName);
}

function findByReadinessKey(
  fields: readonly RoutableField[],
  key: string | null
): RoutableField | undefined {
  if (!key) return undefined;
  return fields.find((field) => field.readinessKey === key);
}

/**
 * One line telling the reviewer why a row they cannot tap is still listed. Only ever
 * shown for blockers `resolveBlockerTarget` returned null for.
 */
export function blockerInertReason(blocker: RoutableBlocker): string {
  if (blocker.kind === "research_only") {
    return "Nothing to fix here — research-only products never enter the customer path.";
  }
  return "No field on this page covers this — an admin has to fix it in the catalog.";
}

export interface BlockerPanelModel {
  /** Blockers to render right now. */
  visible: RoutableBlocker[];
  /** How many are held back while collapsed. 0 once expanded, or when there is no toggle. */
  hiddenCount: number;
  /** Whether to render the expand/collapse control at all. */
  canExpand: boolean;
}

/**
 * 0 blockers is the caller's job to short-circuit (no panel at all); this still returns
 * an empty model rather than throwing, so a caller that forgets renders nothing tappable.
 */
export function blockerPanelModel(
  blockers: readonly RoutableBlocker[],
  expanded: boolean
): BlockerPanelModel {
  const canExpand = blockers.length > COLLAPSED_BLOCKER_LIMIT;
  const visible =
    canExpand && !expanded ? blockers.slice(0, COLLAPSED_BLOCKER_LIMIT) : [...blockers];
  return { visible, hiddenCount: blockers.length - visible.length, canExpand };
}

/** Stable list key. `fieldName` is null or duplicated across readiness blockers. */
export function blockerKey(blocker: RoutableBlocker, index: number): string {
  return `${blocker.kind}-${blocker.fieldName ?? index}`;
}
