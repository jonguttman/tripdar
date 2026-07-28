/**
 * KEWL-2335 — the approved required-field set for the staff catalog audit.
 *
 * Jon approved this set on KEWL-2330 (2026-07-28). It is settled: do not re-derive it.
 *
 * IMPORTANT: this file is the *seed*, not the source of truth. The live required set
 * lives in `CatalogFieldVerificationRule` rows so KEWL-2033's dose-field rename is a
 * row update, not a code change. Read rules from the DB (`loadFieldRules`); use this
 * module only to seed and to supply defaults when a row is missing.
 */

export type CatalogFieldTier = "A" | "B" | "C" | "D";
export type CatalogFieldInputType = "text" | "number" | "list" | "strain" | "photo_check";

export interface CatalogFieldSpec {
  fieldName: string;
  tier: CatalogFieldTier;
  requiredConfirmations: number;
  requiresDistinctReviewers: boolean;
  /** Tier D rows are false — excluded from the listing gate, still shown in admin completeness. */
  gateRequired: boolean;
  /** Matches a `computeReadiness().missing[]` entry, so Tier-D exclusion is data-driven. */
  readinessKey: string | null;
  /** StoreProductCatalog column this field writes to. null = lives in the change log only. */
  catalogColumn: string | null;
  label: string;
  helpText: string | null;
  inputType: CatalogFieldInputType;
  allowsConfirmedAbsent: boolean;
  /**
   * Which confirmed answers satisfy the gate. Empty means any confirmed value does.
   * The photo check uses ["yes"] — a product two reviewers agree has the WRONG photo is
   * fully reviewed and still not listable, which is the whole point of asking.
   */
  gateSatisfyingValues: string[];
  sortOrder: number;
}

/**
 * Reserved non-field answers that ride the same append-only log.
 * Prefixed so they can never collide with a real catalog column.
 */
export const PHOTO_CHECK_FIELD = "__photo_is_correct";
export const REVIEWER_NOTE_FIELD = "__reviewer_note";
export const LISTING_OVERRIDE_FIELD = "__listing_override";
export const RESEARCH_ONLY_FIELD = "__research_only";

/** Sentinel stored as the submitted value for "I don't know". Never counts toward the gate. */
export const DONT_KNOW_VALUE = "__unknown__";
/** Sentinel for "confirmed absent" — a real answer that DOES satisfy the gate. */
export const CONFIRMED_ABSENT_VALUE = "__confirmed_absent__";

export const CATALOG_FIELD_SPECS: CatalogFieldSpec[] = [
  // ---- Tier A — 1 confirmation ----
  {
    fieldName: "productName",
    tier: "A",
    requiredConfirmations: 1,
    requiresDistinctReviewers: false,
    gateRequired: true,
    readinessKey: null,
    catalogColumn: "productName",
    label: "Product name",
    helpText: "Exactly as it reads on the package.",
    inputType: "text",
    allowsConfirmedAbsent: false,
    gateSatisfyingValues: [],
    sortOrder: 10,
  },
  {
    fieldName: "brand",
    tier: "A",
    requiredConfirmations: 1,
    requiresDistinctReviewers: false,
    gateRequired: true,
    readinessKey: "brand",
    catalogColumn: "brand",
    label: "Brand",
    helpText: "Who makes it.",
    inputType: "text",
    allowsConfirmedAbsent: false,
    gateSatisfyingValues: [],
    sortOrder: 20,
  },
  {
    fieldName: "format",
    tier: "A",
    requiredConfirmations: 1,
    requiresDistinctReviewers: false,
    gateRequired: true,
    readinessKey: "format",
    catalogColumn: "format",
    label: "Format",
    helpText: "Capsule, edible, dried, tincture, other.",
    inputType: "text",
    allowsConfirmedAbsent: false,
    gateSatisfyingValues: [],
    sortOrder: 30,
  },
  {
    fieldName: PHOTO_CHECK_FIELD,
    tier: "A",
    requiredConfirmations: 1,
    requiresDistinctReviewers: false,
    gateRequired: true,
    readinessKey: "photo",
    catalogColumn: null,
    label: "Is this the correct photo for this product?",
    helpText: "The bulk import is exactly where a photo/product swap hides. Look carefully.",
    inputType: "photo_check",
    allowsConfirmedAbsent: false,
    gateSatisfyingValues: ["yes"],
    sortOrder: 5,
  },

  // ---- Tier B — 2 confirmations from 2 DIFFERENT reviewers ----
  {
    fieldName: "activeCompound",
    tier: "B",
    requiredConfirmations: 2,
    requiresDistinctReviewers: true,
    gateRequired: true,
    readinessKey: null,
    catalogColumn: "activeCompound",
    label: "Active compound",
    helpText: "What actually makes it work. If unknown, the product cannot list — that is intended.",
    inputType: "text",
    allowsConfirmedAbsent: false,
    gateSatisfyingValues: [],
    sortOrder: 40,
  },
  {
    fieldName: "doseBasis",
    tier: "B",
    requiredConfirmations: 2,
    requiresDistinctReviewers: true,
    gateRequired: true,
    readinessKey: null,
    catalogColumn: "materialMassBasis",
    label: "Dose basis",
    helpText: "Is the mg figure the active compound, or total mushroom material?",
    inputType: "text",
    allowsConfirmedAbsent: false,
    gateSatisfyingValues: [],
    sortOrder: 50,
  },
  {
    fieldName: "productUnitMg",
    tier: "B",
    requiredConfirmations: 2,
    requiresDistinctReviewers: true,
    gateRequired: true,
    readinessKey: "mg per unit",
    catalogColumn: "productUnitMg",
    label: "Amount per unit (mg)",
    helpText: "Per single capsule / gummy / piece.",
    inputType: "number",
    allowsConfirmedAbsent: false,
    gateSatisfyingValues: [],
    sortOrder: 60,
  },
  {
    fieldName: "unitsPerPack",
    tier: "B",
    requiredConfirmations: 2,
    requiresDistinctReviewers: true,
    gateRequired: true,
    readinessKey: "units per pack",
    catalogColumn: "unitsPerPack",
    label: "Units per pack",
    helpText: "How many pieces in the package.",
    inputType: "number",
    allowsConfirmedAbsent: false,
    gateSatisfyingValues: [],
    sortOrder: 70,
  },
  {
    fieldName: "totalDoseMg",
    tier: "B",
    requiredConfirmations: 2,
    requiresDistinctReviewers: true,
    gateRequired: true,
    readinessKey: null,
    catalogColumn: "totalDoseMg",
    label: "Package total (mg)",
    helpText: "Total for the whole package.",
    inputType: "number",
    allowsConfirmedAbsent: false,
    gateSatisfyingValues: [],
    sortOrder: 80,
  },
  {
    fieldName: "ingredients",
    tier: "B",
    requiredConfirmations: 2,
    requiresDistinctReviewers: true,
    gateRequired: true,
    readinessKey: null,
    catalogColumn: "ingredients",
    label: "Ingredients",
    helpText: "Everything on the ingredient panel.",
    inputType: "list",
    allowsConfirmedAbsent: true,
    gateSatisfyingValues: [],
    sortOrder: 90,
  },
  {
    fieldName: "allergens",
    tier: "B",
    requiredConfirmations: 2,
    requiresDistinctReviewers: true,
    gateRequired: true,
    readinessKey: null,
    catalogColumn: null,
    label: "Allergens",
    helpText: "If the package states none, choose “confirmed absent” rather than leaving it blank.",
    inputType: "list",
    allowsConfirmedAbsent: true,
    gateSatisfyingValues: [],
    sortOrder: 100,
  },

  // ---- Tier C — 1 confirmation ----
  {
    fieldName: "onsetMinutes",
    tier: "C",
    requiredConfirmations: 1,
    requiresDistinctReviewers: false,
    gateRequired: true,
    readinessKey: "onset",
    catalogColumn: "onsetMinutes",
    label: "Onset (minutes)",
    helpText: "How long until it is felt.",
    inputType: "number",
    allowsConfirmedAbsent: false,
    gateSatisfyingValues: [],
    sortOrder: 110,
  },
  {
    fieldName: "durationMinutes",
    tier: "C",
    requiredConfirmations: 1,
    requiresDistinctReviewers: false,
    gateRequired: true,
    readinessKey: "duration",
    catalogColumn: "durationMinutes",
    label: "Duration (minutes)",
    helpText: "How long it lasts.",
    inputType: "number",
    allowsConfirmedAbsent: false,
    gateSatisfyingValues: [],
    sortOrder: 120,
  },
  {
    fieldName: "brandDoseGuidance",
    tier: "C",
    requiredConfirmations: 1,
    requiresDistinctReviewers: false,
    gateRequired: true,
    readinessKey: "brand dose guidance",
    catalogColumn: "brandDoseInstructions",
    label: "Brand dose guidance",
    helpText: "What the brand tells people to take.",
    inputType: "text",
    allowsConfirmedAbsent: true,
    gateSatisfyingValues: [],
    sortOrder: 130,
  },
  {
    fieldName: "strainSlug",
    tier: "C",
    requiredConfirmations: 1,
    requiresDistinctReviewers: false,
    gateRequired: true,
    readinessKey: null,
    catalogColumn: "strainSlug",
    label: "Strain",
    helpText: "Some products genuinely make no strain claim — that is “confirmed absent”, not blank.",
    inputType: "strain",
    allowsConfirmedAbsent: true,
    gateSatisfyingValues: [],
    sortOrder: 140,
  },

  // ---- Tier D — explicitly OUT of the listing gate ----
  // These need dosed sessions to exist. computeReadiness() still requires them for the
  // admin completeness view; gateRequired=false is what keeps listing possible today.
  {
    fieldName: "vibeProfile",
    tier: "D",
    requiredConfirmations: 1,
    requiresDistinctReviewers: false,
    gateRequired: false,
    readinessKey: "vibe profile",
    catalogColumn: null,
    label: "Vibe profile",
    helpText: "Needs dosed sessions. Not part of listing.",
    inputType: "text",
    allowsConfirmedAbsent: false,
    gateSatisfyingValues: [],
    sortOrder: 200,
  },
  {
    fieldName: "strengthOffset",
    tier: "D",
    requiredConfirmations: 1,
    requiresDistinctReviewers: false,
    gateRequired: false,
    readinessKey: "strength offset confirmation",
    catalogColumn: null,
    label: "Strength offset",
    helpText: "Needs dosed sessions. Not part of listing.",
    inputType: "text",
    allowsConfirmedAbsent: false,
    gateSatisfyingValues: [],
    sortOrder: 210,
  },
];

/** Field names the reviewer surface presents, in display order. Tier D is not reviewable here. */
export const REVIEWABLE_FIELD_SPECS = CATALOG_FIELD_SPECS.filter((spec) => spec.tier !== "D").sort(
  (a, b) => a.sortOrder - b.sortOrder
);

export function specForField(fieldName: string): CatalogFieldSpec | undefined {
  return CATALOG_FIELD_SPECS.find((spec) => spec.fieldName === fieldName);
}

/**
 * Readiness keys the listing gate must IGNORE, derived from config rather than hardcoded.
 *
 * Without this the spec contradicts itself: `computeReadiness()` requires "vibe profile"
 * and "strength offset confirmation", while Tier D is explicitly out of the gate — so
 * every product would fail forever. When dosed sessions exist, flip `gateRequired` to
 * true on those two rows and the gate tightens with no code change.
 */
export function readinessKeysExcludedFromGate(
  rules: Array<{ readinessKey: string | null; gateRequired: boolean }>
): Set<string> {
  const excluded = new Set<string>();
  for (const rule of rules) {
    if (!rule.gateRequired && rule.readinessKey) excluded.add(rule.readinessKey);
  }
  return excluded;
}
