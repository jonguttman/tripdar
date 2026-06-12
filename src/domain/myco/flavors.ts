/**
 * Flavor list handling.
 *
 * Flavors are presentation variants of one recipe (same dose, ingredients,
 * format, strain) — strings on the product, not entities. Normalization here
 * mirrors what the admin UI does, so direct API calls can't store dupes like
 * ["Mint", "mint"].
 */

export const MAX_FLAVORS = 25;
export const MAX_FLAVOR_LENGTH = 60;

/** Trim, collapse whitespace, dedupe case-insensitively (first casing wins). */
export function normalizeFlavors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const flavor = raw.trim().replace(/\s+/g, " ").slice(0, MAX_FLAVOR_LENGTH);
    if (!flavor) continue;
    const key = flavor.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(flavor);
    if (out.length >= MAX_FLAVORS) break;
  }
  return out;
}

/**
 * Match a submitted flavor against a product's flavor list (case-insensitive),
 * returning the canonical casing — or null when it isn't a known flavor.
 */
export function matchFlavor(value: unknown, productFlavors: string[]): string | null {
  if (typeof value !== "string") return null;
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  return productFlavors.find((f) => f.toLowerCase() === needle) ?? null;
}
