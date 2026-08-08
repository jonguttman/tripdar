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
 *
 * KEWL-2475 — the allowlist is now PER PARTNER SCOPE rather than one flat list, so a QA
 * sandbox identity can exist without touching TMT's boundary. See below.
 */

import type { Prisma } from "@prisma/client";
import crypto from "crypto";

import { normalizeEmployeeEmail } from "./employeeReviews";

export const STAFF_REVIEWER_EMAILS = [
  "adrienne@themushroomtop.internal",
  "audrey@themushroomtop.internal",
  "clay@themushroomtop.internal",
  "dani@themushroomtop.internal",
  "devon@themushroomtop.internal",
  "eddie@themushroomtop.internal",
] as const;

/**
 * KEWL-2912 — forward-looking direct-invitation roster.
 *
 * These real-email identities are additive and intentionally separate from the legacy
 * shared-link allowlist above. Do not use them to widen the old roster picker.
 */
export const TMT_DIRECT_STAFF_REVIEWERS = [
  { displayName: "Sage", email: "sage@thegreenroomonventura.com" },
  { displayName: "Dani", email: "dani@thehigherpath.com" },
  { displayName: "Eddie", email: "eddie@thehigherpath.com" },
  { displayName: "Devon", email: "devinmandley@yahoo.com" },
  { displayName: "Clay", email: "clayton@thehigherpath.com" },
  { displayName: "Audrey", email: "audrey@theotherpathcbd.com" },
] as const;

export const TMT_DIRECT_STAFF_REVIEWER_COUNT = TMT_DIRECT_STAFF_REVIEWERS.length;

export interface DirectStaffReviewEmployee {
  id: string;
  partnerId: string;
  name: string;
  email: string;
  active: boolean;
  optedOut: boolean;
}

export interface ResolvedDirectStaffReviewer {
  ordinal: number;
  employeeId: string;
  partnerId: string;
  displayName: string;
  expectedDisplayName: string;
  emailNormalized: string;
  active: boolean;
  optedOut: boolean;
}

export class DirectStaffReviewRosterError extends Error {
  readonly code: string;
  readonly statusCode = 409;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DirectStaffReviewRosterError";
    this.code = code;
  }
}

export function tmtDirectStaffReviewerEmails(): string[] {
  return TMT_DIRECT_STAFF_REVIEWERS.map((reviewer) =>
    normalizeEmployeeEmail(reviewer.email)
  );
}

export function directStaffReviewerWhere(partnerId: string): Prisma.MycoEmployeeWhereInput {
  return {
    partnerId,
    email: { in: tmtDirectStaffReviewerEmails() },
  };
}

function directRosterDigestPayload(roster: ResolvedDirectStaffReviewer[]) {
  return {
    version: "staff-direct-roster-v1",
    reviewers: roster.map((reviewer) => ({
      ordinal: reviewer.ordinal,
      employeeId: reviewer.employeeId,
      partnerId: reviewer.partnerId,
      displayName: reviewer.displayName,
      expectedDisplayName: reviewer.expectedDisplayName,
      emailNormalized: reviewer.emailNormalized,
      active: reviewer.active,
      optedOut: reviewer.optedOut,
    })),
  };
}

export function hashDirectStaffReviewRoster(roster: ResolvedDirectStaffReviewer[]): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(directRosterDigestPayload(roster)), "utf8")
    .digest("hex");
}

export function resolveDirectStaffReviewRoster(
  partnerId: string,
  employees: DirectStaffReviewEmployee[]
): { reviewers: ResolvedDirectStaffReviewer[]; rosterDigest: string } {
  const byEmail = new Map<string, DirectStaffReviewEmployee>();
  for (const employee of employees) {
    const email = normalizeEmployeeEmail(employee.email);
    if (byEmail.has(email)) {
      throw new DirectStaffReviewRosterError(
        "roster_duplicate_email",
        `Duplicate direct staff reviewer email: ${email}`
      );
    }
    byEmail.set(email, employee);
  }

  const reviewers = TMT_DIRECT_STAFF_REVIEWERS.map((expected, index) => {
    const emailNormalized = normalizeEmployeeEmail(expected.email);
    const employee = byEmail.get(emailNormalized);
    if (!employee) {
      throw new DirectStaffReviewRosterError(
        "roster_missing",
        `Missing direct staff reviewer: ${emailNormalized}`
      );
    }
    if (employee.partnerId !== partnerId) {
      throw new DirectStaffReviewRosterError(
        "partner_scope_mismatch",
        `Direct staff reviewer is outside partner scope: ${emailNormalized}`
      );
    }
    if (!employee.active) {
      throw new DirectStaffReviewRosterError(
        "employee_inactive",
        `Direct staff reviewer is inactive: ${emailNormalized}`
      );
    }
    if (employee.optedOut) {
      throw new DirectStaffReviewRosterError(
        "employee_opted_out",
        `Direct staff reviewer is opted out: ${emailNormalized}`
      );
    }
    return {
      ordinal: index,
      employeeId: employee.id,
      partnerId: employee.partnerId,
      displayName: employee.name,
      expectedDisplayName: expected.displayName,
      emailNormalized,
      active: employee.active,
      optedOut: employee.optedOut,
    };
  });

  if (employees.length !== TMT_DIRECT_STAFF_REVIEWER_COUNT) {
    throw new DirectStaffReviewRosterError(
      "roster_mismatch",
      `Expected ${TMT_DIRECT_STAFF_REVIEWER_COUNT} direct staff reviewers, found ${employees.length}`
    );
  }

  return { reviewers, rosterDigest: hashDirectStaffReviewRoster(reviewers) };
}

/** Roster size the enrollment auto-close counts against ("six of six"). */
export const STAFF_REVIEWER_COUNT = STAFF_REVIEWER_EMAILS.length;

/**
 * KEWL-2475 — the QA sandbox reviewer.
 *
 * Agents had no way to open the staff review screens on production without claiming one
 * of the five unclaimed REAL reviewer identities, which permanently takes that person's
 * name (KEWL-2474). This address is the fixture identity that closes that gap.
 *
 * It is deliberately NOT a seventh entry in `STAFF_REVIEWER_EMAILS`. A flat seventh entry
 * would be safe only while no row carrying it exists under the TMT partner — an invariant
 * nothing in the schema or the seeds enforces. Instead the QA address is admitted ONLY when
 * the roster query is scoped to the QA partner, so TMT's allowlist is literally the same
 * six addresses it was before this change and cannot be widened by it.
 *
 * `.invalid` is the RFC 2606 reserved TLD: this address can never be deliverable, and it
 * cannot collide with a real `@themushroomtop.internal` row.
 */
export const QA_STAFF_REVIEWER_EMAIL = "qa-reviewer@tripdar-qa.invalid";

/**
 * Env var naming the QA sandbox partner. The QA identity is admitted in an environment
 * ONLY if this is set there — absent, `approvedReviewerEmails()` is the six TMT addresses
 * for every scope, exactly as before. That is the fail-closed direction: a missing var can
 * only remove the QA identity, never grant one.
 */
export const QA_STAFF_REVIEW_PARTNER_ID_ENV = "QA_STAFF_REVIEW_PARTNER_ID";

export function qaStaffReviewPartnerId(): string | null {
  const configured = process.env[QA_STAFF_REVIEW_PARTNER_ID_ENV]?.trim();
  return configured ? configured : null;
}

export function isQaStaffReviewPartner(partnerId: string | null | undefined): boolean {
  const configured = qaStaffReviewPartnerId();
  return Boolean(configured && partnerId && partnerId === configured);
}

/**
 * The approved addresses for one partner scope.
 *
 * The QA scope REPLACES the list rather than extending it, in both directions:
 *  - a TMT-scoped read never sees the QA address, so this change cannot widen TMT;
 *  - a QA-scoped read never sees the six TMT addresses, so the QA link cannot be used to
 *    claim a real reviewer's name even if a TMT-emailed row were somehow created under the
 *    QA partner.
 *
 * A misconfigured env var pointing at the TMT partner id would therefore make TMT's roster
 * query return nothing (`resolveReviewerRoster` → 410 `roster_empty`) — it fails closed and
 * loudly, and can never hand a real name to a QA holder.
 *
 * An UNSCOPED read (no partnerId — the admin single-reviewer PIN reset) is the six TMT
 * addresses only. The QA reviewer's PIN is resettable through the partner-scoped
 * `reset_all` action instead; an unscoped id lookup is not a path into the QA scope.
 */
export function approvedReviewerEmails(partnerId?: string | null): string[] {
  return isQaStaffReviewPartner(partnerId)
    ? [QA_STAFF_REVIEWER_EMAIL]
    : [...STAFF_REVIEWER_EMAILS];
}

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
    email: { in: approvedReviewerEmails(partnerId) },
  };
}

/**
 * True when an address is on the approved TMT roster. Case-insensitive; null is never on it.
 *
 * Deliberately TMT-only and partner-unaware: this asks "is this one of Jon's six", which is
 * not a question the QA fixture identity should ever answer yes to.
 */
export function isStaffReviewerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return STAFF_REVIEWER_EMAILS.some((approved) => approved === normalized);
}
