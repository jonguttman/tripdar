/**
 * KEWL-2393 — the fixed TMT staff-catalog reviewer roster.
 *
 * `active MycoEmployee` is broader operational data, not an authorization role.
 * These seeded internal addresses are stable identifiers for the six people Jon
 * approved for the public shared-link flow. Keep every roster read and auth check
 * behind this one predicate so a later employee import cannot widen access.
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

export function staffReviewerWhere(
  partnerId: string,
  employeeId?: string
): Prisma.MycoEmployeeWhereInput {
  return {
    ...(employeeId ? { id: employeeId } : {}),
    partnerId,
    active: true,
    optedOut: false,
    email: { in: [...STAFF_REVIEWER_EMAILS] },
  };
}
