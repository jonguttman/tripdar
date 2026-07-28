/**
 * KEWL-2393 / KEWL-2379 — the fixed TMT staff-catalog reviewer roster.
 *
 * `active MycoEmployee` is broader operational data, not an authorization role.
 * These seeded internal addresses are stable identifiers for the six people Jon
 * approved for the public shared-link flow. Keep every roster read and auth check
 * behind this one predicate so a later employee import cannot widen access.
 *
 * This matters more under the shared link than it did under per-reviewer links: one
 * unbound token now authorizes whoever the roster query returns, so the query IS the
 * access-control boundary. An `active: true` row created by any future employee import
 * would otherwise become a claimable identity on a link that is already in circulation.
 */

import type { Prisma } from "@prisma/client";

export const STAFF_REVIEWER_EMAILS = [
  "adrienne@themushroomtop.internal",
  "audrey@themushroomtop.internal",
  "clay@themushroomtop.internal",
  "dani@themushroomtop.internal",
  "devon@themushroomtop.internal",
  "eddie@themushroomtop.internal",
] as const;

/** Roster size the enrollment auto-close counts against ("six of six"). */
export const STAFF_REVIEWER_COUNT = STAFF_REVIEWER_EMAILS.length;

/**
 * The single predicate every roster read must go through.
 *
 * Both narrowing arguments are optional so admin paths that key on an employee id
 * (single-reviewer PIN reset) stay inside the allowlist too — passing an id alone
 * must not be a way around the email constraint.
 */
export function staffReviewerWhere(
  partnerId?: string,
  employeeId?: string
): Prisma.MycoEmployeeWhereInput {
  return {
    ...(employeeId ? { id: employeeId } : {}),
    ...(partnerId ? { partnerId } : {}),
    active: true,
    optedOut: false,
    email: { in: [...STAFF_REVIEWER_EMAILS] },
  };
}

/** True when an address is on the approved roster. Case-insensitive; null is never on it. */
export function isStaffReviewerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return STAFF_REVIEWER_EMAILS.some((approved) => approved === normalized);
}
