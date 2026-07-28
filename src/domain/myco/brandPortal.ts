/**
 * Brand self-serve portal (KEWL-2331).
 *
 * Pure validation/normalisation for the unauthenticated `/b/<token>` surface.
 * Everything here treats its input as hostile: strangers with a link POST to it.
 *
 * Persistence lives in the route handler; this module never touches the DB so it
 * stays trivially unit-testable.
 */

import type { CatalogFieldSource } from "./catalogProvenance";

/** Product fields a brand is allowed to correct. Anything else is dropped. */
export const BRAND_EDITABLE_PRODUCT_FIELDS = [
  "productName",
  "sku",
  "format",
  "productUnitMg",
  "unitsPerPack",
  "ingredients",
  "flavors",
  "onsetMinutes",
  "durationMinutes",
  "brandDoseInstructions",
] as const;

export type BrandEditableProductField = (typeof BRAND_EDITABLE_PRODUCT_FIELDS)[number];

/** Product formats the catalog understands. */
export const PRODUCT_FORMATS = ["capsule", "edible", "dried", "tincture", "other"] as const;

export const CONTACT_METHODS = ["email", "signal", "telegram"] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

/** Brand-level fields, stored on the submission payload rather than the change log. */
export const BRAND_EDITABLE_BRAND_FIELDS = [
  "shortDescription",
  "websiteUrl",
  "supportEmail",
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "instagram",
  "x",
  "tiktok",
  "linkedin",
] as const;

/** The source tag every value from this surface carries into the change log. */
export const BRAND_PORTAL_SOURCE: CatalogFieldSource = "brand-provided";

const MAX_TEXT = 2000;
const MAX_SHORT_TEXT = 200;
const MAX_LIST_ITEMS = 40;
const MAX_MISSING_PRODUCTS = 20;
/** Signed upload handles are an opaque base64url payload plus an HMAC. */
const MAX_UPLOAD_HANDLES = 60;
const MAX_UPLOAD_HANDLE_LENGTH = 4000;

export class BrandPortalValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = "BrandPortalValidationError";
    this.field = field;
  }
}

function fail(field: string, message: string): never {
  throw new BrandPortalValidationError(field, message);
}

/**
 * Strip control characters (including the bidi overrides used for spoofing) and
 * collapse whitespace. Returns undefined for anything that normalises to empty,
 * so "cleared the box" is distinguishable from "did not touch the box".
 */
export function cleanText(value: unknown, max = MAX_TEXT): string | undefined {
  if (typeof value !== "string") return undefined;
  const stripped = value
    // C0/C1 control chars, then bidi overrides used for display spoofing.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return undefined;
  if (stripped.length > max) fail("text", `Value is too long (max ${max} characters)`);
  return stripped;
}

/** Accepts only http(s). Blocks javascript:, data:, and protocol-relative URLs. */
export function cleanUrl(value: unknown, field: string): string | undefined {
  const text = cleanText(value, 500);
  if (!text) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    fail(field, "Enter a full URL including https://");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    fail(field, "Only http and https links are accepted");
  }
  return parsed.toString();
}

export function cleanEmail(value: unknown, field: string): string | undefined {
  const text = cleanText(value, 320);
  if (!text) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) fail(field, "Enter a valid email address");
  return text.toLowerCase();
}

/** Hex colours only — these get interpolated into inline styles on the brand page. */
export function cleanHexColor(value: unknown, field: string): string | undefined {
  const text = cleanText(value, 20);
  if (!text) return undefined;
  const normalized = text.startsWith("#") ? text : `#${text}`;
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized)) {
    fail(field, "Enter a hex colour such as #4a7c2f");
  }
  return normalized.toLowerCase();
}

export function cleanInteger(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number } = {},
): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const num = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(num) || !Number.isInteger(num)) fail(field, "Enter a whole number");
  const { min = 0, max = 1_000_000 } = opts;
  if (num < min || num > max) fail(field, `Enter a number between ${min} and ${max}`);
  return num;
}

/** Accepts an array or a comma-separated string; de-dupes, preserves order. */
export function cleanStringList(value: unknown, field: string): string[] | undefined {
  let raw: unknown[];
  if (Array.isArray(value)) raw = value;
  else if (typeof value === "string") {
    const text = value.trim();
    if (!text) return undefined;
    raw = text.split(",");
  } else return undefined;

  const out: string[] = [];
  for (const item of raw) {
    const cleaned = cleanText(item, MAX_SHORT_TEXT);
    if (cleaned && !out.includes(cleaned)) out.push(cleaned);
  }
  if (out.length > MAX_LIST_ITEMS) fail(field, `Too many entries (max ${MAX_LIST_ITEMS})`);
  return out;
}

/** Social handles: strip a leading @ and any URL wrapper, keep the bare handle. */
export function cleanHandle(value: unknown): string | undefined {
  const text = cleanText(value, 100);
  if (!text) return undefined;
  const withoutUrl = text.replace(/^https?:\/\/(?:www\.)?[^/]+\//i, "");
  const bare = withoutUrl.replace(/^@+/, "").replace(/\/+$/, "").trim();
  return bare || undefined;
}

export interface SubmitterContact {
  submitterName: string;
  submitterRole: string;
  contactPermission: boolean;
  preferredContactMethod: ContactMethod | null;
  contactHandle: string | null;
  consentToContactAt: Date | null;
}

/**
 * The contact block. "Signal" without a number is useless, so a handle is
 * mandatory whenever contact permission is granted.
 */
export function parseSubmitterContact(raw: unknown, now = new Date()): SubmitterContact {
  const input = (raw ?? {}) as Record<string, unknown>;

  const submitterName = cleanText(input.submitterName, MAX_SHORT_TEXT);
  if (!submitterName) fail("submitterName", "Tell us who you are");

  const submitterRole = cleanText(input.submitterRole, MAX_SHORT_TEXT);
  if (!submitterRole) fail("submitterRole", "Tell us your role at the brand");

  const contactPermission = input.contactPermission === true || input.contactPermission === "true";

  if (!contactPermission) {
    return {
      submitterName,
      submitterRole,
      contactPermission: false,
      preferredContactMethod: null,
      contactHandle: null,
      consentToContactAt: null,
    };
  }

  const method = cleanText(input.preferredContactMethod, 20)?.toLowerCase();
  if (!method || !(CONTACT_METHODS as readonly string[]).includes(method)) {
    fail("preferredContactMethod", "Choose how we should reach you");
  }

  const handleField = "contactHandle";
  const handle =
    method === "email"
      ? cleanEmail(input.contactHandle, handleField)
      : cleanText(input.contactHandle, MAX_SHORT_TEXT);

  if (!handle) {
    fail(
      handleField,
      method === "email"
        ? "Enter the email address we should use"
        : `Enter your ${method === "signal" ? "Signal number" : "Telegram username"} — the method alone isn't enough for us to reach you`,
    );
  }

  return {
    submitterName,
    submitterRole,
    contactPermission: true,
    preferredContactMethod: method as ContactMethod,
    contactHandle: handle,
    consentToContactAt: now,
  };
}

export interface BrandFieldUpdates {
  shortDescription?: string;
  websiteUrl?: string;
  supportEmail?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  socialHandles?: Record<string, string>;
}

export function parseBrandFields(raw: unknown): BrandFieldUpdates {
  const input = (raw ?? {}) as Record<string, unknown>;
  const out: BrandFieldUpdates = {};

  const description = cleanText(input.shortDescription, 600);
  if (description) out.shortDescription = description;

  const website = cleanUrl(input.websiteUrl, "websiteUrl");
  if (website) out.websiteUrl = website;

  const email = cleanEmail(input.supportEmail, "supportEmail");
  if (email) out.supportEmail = email;

  for (const key of ["primaryColor", "secondaryColor", "accentColor"] as const) {
    const color = cleanHexColor(input[key], key);
    if (color) out[key] = color;
  }

  const socials: Record<string, string> = {};
  for (const key of ["instagram", "x", "tiktok", "linkedin"] as const) {
    const handle = cleanHandle(input[key]);
    if (handle) socials[key] = handle;
  }
  if (Object.keys(socials).length) out.socialHandles = socials;

  return out;
}

export interface ProductFieldSubmission {
  catalogItemId: string;
  fields: Partial<Record<BrandEditableProductField, unknown>>;
  discontinued: boolean;
  coaUrl?: string;
  note?: string;
}

/**
 * Normalise one product's corrections. Only whitelisted fields survive, each
 * coerced to the catalog's own type so the change log stores comparable JSON
 * rather than whatever the form serialised.
 */
export function parseProductSubmission(raw: unknown): ProductFieldSubmission | null {
  const input = (raw ?? {}) as Record<string, unknown>;
  const catalogItemId = cleanText(input.catalogItemId, 60);
  if (!catalogItemId) fail("catalogItemId", "Missing product reference");

  const fields: Partial<Record<BrandEditableProductField, unknown>> = {};

  const name = cleanText(input.productName, MAX_SHORT_TEXT);
  if (name !== undefined) fields.productName = name;

  const sku = cleanText(input.sku, MAX_SHORT_TEXT);
  if (sku !== undefined) fields.sku = sku;

  const format = cleanText(input.format, 40)?.toLowerCase();
  if (format !== undefined) {
    if (!(PRODUCT_FORMATS as readonly string[]).includes(format)) {
      fail("format", `Choose one of: ${PRODUCT_FORMATS.join(", ")}`);
    }
    fields.format = format;
  }

  const unitMg = cleanInteger(input.productUnitMg, "productUnitMg", { min: 0, max: 100_000 });
  if (unitMg !== undefined) fields.productUnitMg = unitMg;

  const unitsPerPack = cleanInteger(input.unitsPerPack, "unitsPerPack", { min: 0, max: 10_000 });
  if (unitsPerPack !== undefined) fields.unitsPerPack = unitsPerPack;

  const onset = cleanInteger(input.onsetMinutes, "onsetMinutes", { min: 0, max: 1440 });
  if (onset !== undefined) fields.onsetMinutes = onset;

  const duration = cleanInteger(input.durationMinutes, "durationMinutes", { min: 0, max: 2880 });
  if (duration !== undefined) fields.durationMinutes = duration;

  const ingredients = cleanStringList(input.ingredients, "ingredients");
  if (ingredients !== undefined) fields.ingredients = ingredients;

  const flavors = cleanStringList(input.flavors, "flavors");
  if (flavors !== undefined) fields.flavors = flavors;

  const doseInstructions = cleanText(input.brandDoseInstructions, MAX_TEXT);
  if (doseInstructions !== undefined) fields.brandDoseInstructions = doseInstructions;

  const discontinued = input.discontinued === true || input.discontinued === "true";
  const coaUrl = cleanUrl(input.coaUrl, "coaUrl");
  const note = cleanText(input.note, MAX_TEXT);

  if (!Object.keys(fields).length && !discontinued && !coaUrl && !note) return null;

  return { catalogItemId, fields, discontinued, coaUrl, note };
}

export interface MissingProduct {
  productName: string;
  format?: string;
  productUnitMg?: number;
  unitsPerPack?: number;
  note?: string;
}

export function parseMissingProducts(raw: unknown): MissingProduct[] {
  if (!Array.isArray(raw)) return [];
  if (raw.length > MAX_MISSING_PRODUCTS) {
    fail("missingProducts", `Too many products (max ${MAX_MISSING_PRODUCTS})`);
  }
  const out: MissingProduct[] = [];
  for (const entry of raw) {
    const item = (entry ?? {}) as Record<string, unknown>;
    const productName = cleanText(item.productName, MAX_SHORT_TEXT);
    if (!productName) continue;
    const format = cleanText(item.format, 40)?.toLowerCase();
    if (format && !(PRODUCT_FORMATS as readonly string[]).includes(format)) {
      fail("missingProducts.format", `Choose one of: ${PRODUCT_FORMATS.join(", ")}`);
    }
    out.push({
      productName,
      format,
      productUnitMg: cleanInteger(item.productUnitMg, "missingProducts.productUnitMg", {
        min: 0,
        max: 100_000,
      }),
      unitsPerPack: cleanInteger(item.unitsPerPack, "missingProducts.unitsPerPack", {
        min: 0,
        max: 10_000,
      }),
      note: cleanText(item.note, MAX_TEXT),
    });
  }
  return out;
}

export interface ParsedBrandPortalSubmission {
  contact: SubmitterContact;
  imageUsageGrant: boolean;
  imageUsageGrantedAt: Date | null;
  brandFields: BrandFieldUpdates;
  products: ProductFieldSubmission[];
  missingProducts: MissingProduct[];
  uploadIds: string[];
}

/**
 * Parse a whole portal submission. `now` is injectable so consent timestamps are
 * deterministic under test.
 */
export function parseBrandPortalSubmission(
  raw: unknown,
  now = new Date(),
): ParsedBrandPortalSubmission {
  const input = (raw ?? {}) as Record<string, unknown>;

  const contact = parseSubmitterContact(input.contact, now);
  const imageUsageGrant = input.imageUsageGrant === true || input.imageUsageGrant === "true";

  const products: ProductFieldSubmission[] = [];
  if (Array.isArray(input.products)) {
    if (input.products.length > 200) fail("products", "Too many products in one submission");
    for (const entry of input.products) {
      const parsed = parseProductSubmission(entry);
      if (parsed) products.push(parsed);
    }
  }

  const uploadIds: string[] = [];
  if (Array.isArray(input.uploadIds)) {
    if (input.uploadIds.length > MAX_UPLOAD_HANDLES) {
      fail("uploadIds", `Too many files in one submission (max ${MAX_UPLOAD_HANDLES})`);
    }
    for (const id of input.uploadIds) {
      // Handles are opaque and long, so they must not be whitespace-collapsed or
      // length-clipped the way prose fields are. Authenticity is checked by the
      // HMAC in `verifyBrandAssetHandle`, not here.
      if (typeof id !== "string") continue;
      const cleaned = id.trim();
      if (!cleaned) continue;
      if (cleaned.length > MAX_UPLOAD_HANDLE_LENGTH) {
        fail("uploadIds", "An upload reference was malformed");
      }
      if (!uploadIds.includes(cleaned)) uploadIds.push(cleaned);
    }
  }

  const brandFields = parseBrandFields(input.brandFields);
  const missingProducts = parseMissingProducts(input.missingProducts);

  const hasContent =
    products.length > 0 ||
    missingProducts.length > 0 ||
    uploadIds.length > 0 ||
    Object.keys(brandFields).length > 0;

  if (!hasContent) {
    fail("submission", "Nothing to submit yet — correct a field or add a photo first");
  }

  return {
    contact,
    imageUsageGrant,
    imageUsageGrantedAt: imageUsageGrant ? now : null,
    brandFields,
    products,
    missingProducts,
    uploadIds,
  };
}

/**
 * Identity recorded against every change-log row and consent record. Combines the
 * person with the brand so a row is attributable without joining back to the token.
 */
export function buildActorIdentity(contact: SubmitterContact, brandName: string): string {
  const contactPart = contact.contactHandle ? ` <${contact.contactHandle}>` : "";
  return `${contact.submitterName} (${contact.submitterRole}) @ ${brandName}${contactPart}`;
}

/**
 * Values differ for change-log purposes? Arrays compare order-insensitively so
 * re-submitting the same ingredients in a different order isn't a "change".
 */
export function valuesDiffer(previous: unknown, next: unknown): boolean {
  if (Array.isArray(previous) && Array.isArray(next)) {
    if (previous.length !== next.length) return true;
    const a = [...previous].map(String).sort();
    const b = [...next].map(String).sort();
    return a.some((value, index) => value !== b[index]);
  }
  const normalize = (value: unknown) =>
    value === null || value === undefined || value === "" ? null : value;
  return JSON.stringify(normalize(previous)) !== JSON.stringify(normalize(next));
}
