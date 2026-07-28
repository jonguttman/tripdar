/**
 * KEWL-2394 — shared staff link + bounded self-enrollment.
 *
 * Jon's ruling (2026-07-28): *"Can you make it so they all have to pick their pin the
 * first time they click the link. I don't want to deal with emails for this."* One link
 * goes to the whole store; whoever opens it picks their name off the roster and chooses
 * a PIN. There is no per-reviewer link and no email step.
 *
 * The obvious objection to a shared link is that anybody holding it can claim anybody
 * else's name. Three things bound that, and they are the whole design:
 *
 *  1. **A window, not a standing invitation.** Self-enrollment is only possible while
 *     `enrollmentClosesAt` is in the future and the window has not been closed. After
 *     that an unclaimed name fails closed and only Jon can reopen it. The exposure is a
 *     known 72 hours among people who already work behind the same counter — not
 *     forever, and not to the internet.
 *  2. **Claiming is one-way and racy-safe.** Enrollment is a compare-and-set on
 *     `pinHash IS NULL` (kept from `f0f7d28`). Two devices racing the same name cannot
 *     both win, and an enrolled reviewer can never be re-claimed — only an admin reset
 *     puts a name back in play, and that is logged.
 *  3. **Everything is on the record.** Every attempt, allowed or denied, appends to
 *     `ReviewerEnrollmentEvent`. Nothing here ever mutates enrollment state silently.
 *
 * That is deterrence plus accountability, which is the right bar for a six-person store
 * catalog — it is deliberately not represented as authentication anywhere in the UI.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

/** How long a freshly minted shared link accepts self-enrollment. */
export const ENROLLMENT_WINDOW_MS = 72 * 60 * 60 * 1000;

export const ENROLLMENT_CLOSED_MESSAGE =
  "Enrollment for this link has closed. Ask Jon to reopen enrollment.";

/**
 * Any Prisma handle — the client itself or an interactive transaction.
 *
 * Passed in explicitly rather than defaulted to the app singleton, for two reasons: the
 * ledger append has to be able to join a caller's `$transaction`, and keeping `@/lib/prisma`
 * out of this module lets the mint script import the pre-ship assertion directly instead
 * of reimplementing it (plain node cannot resolve the `@/` alias).
 */
type Db = PrismaClient | Prisma.TransactionClient;

export type EnrollmentEventName =
  | "enrolled"
  | "enrollment_denied"
  | "pin_verified"
  | "pin_failed"
  | "pin_reset"
  | "pin_reset_all"
  | "window_reopened"
  | "window_auto_closed"
  | "link_minted";

export interface EnrollmentLedgerEntry {
  partnerId: string;
  accessTokenId?: string | null;
  employeeId?: string | null;
  employeeName?: string | null;
  event: EnrollmentEventName;
  outcome: "allowed" | "denied";
  actorType: "reviewer" | "admin" | "system";
  actorIdentity: string;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Appends one ledger row. Insert-only by construction — there is no update or delete
 * helper in this module, and callers outside it have no reason to reach the table.
 */
export async function appendEnrollmentEvent(db: Db, entry: EnrollmentLedgerEntry): Promise<void> {
  await db.reviewerEnrollmentEvent.create({
    data: {
      partnerId: entry.partnerId,
      accessTokenId: entry.accessTokenId ?? null,
      employeeId: entry.employeeId ?? null,
      employeeName: entry.employeeName ?? null,
      event: entry.event,
      outcome: entry.outcome,
      actorType: entry.actorType,
      actorIdentity: entry.actorIdentity,
      reason: entry.reason ?? null,
      metadata: entry.metadata ?? {},
    },
  });
}

/* ------------------------------------------------------------------ window --- */

export interface EnrollmentWindowInput {
  enrollmentClosesAt: Date | null;
  enrollmentClosedAt: Date | null;
}

export type EnrollmentWindowState = {
  open: boolean;
  closesAt: Date | null;
  closedAt: Date | null;
  /** Why it is shut, for the ledger and for the admin view. Null while open. */
  closedReason: "closed_early" | "expired" | "never_opened" | null;
};

/**
 * Pure so the fail-closed decision is testable without a database. Note the default for
 * a token that was never given a window is CLOSED, not open — a legacy shared link
 * minted before this ticket must not silently become self-enrollable.
 */
export function evaluateEnrollmentWindow(
  input: EnrollmentWindowInput,
  now: Date = new Date()
): EnrollmentWindowState {
  const base = { closesAt: input.enrollmentClosesAt, closedAt: input.enrollmentClosedAt };
  if (input.enrollmentClosedAt) {
    return { ...base, open: false, closedReason: "closed_early" };
  }
  if (!input.enrollmentClosesAt) {
    return { ...base, open: false, closedReason: "never_opened" };
  }
  if (input.enrollmentClosesAt.getTime() <= now.getTime()) {
    return { ...base, open: false, closedReason: "expired" };
  }
  return { ...base, open: true, closedReason: null };
}

export function enrollmentWindowExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + ENROLLMENT_WINDOW_MS);
}

/* ------------------------------------------------------------------ roster --- */

export interface RosterReviewer {
  id: string;
  name: string;
  hasPin: boolean;
  lockedOut: boolean;
}

export interface RosterRecord {
  id: string;
  name: string;
  pinHash: string | null;
  pinFailedAttempts: number;
  pinLockedUntil: Date | null;
  pinSessionsRevokedAt: Date | null;
}

/**
 * The reviewers a link serves.
 *
 * A shared link (`issuedToId` null) serves the whole active roster; a legacy per-reviewer
 * link still resolves to exactly the one person it was issued to, so links minted under
 * the KEWL-2364 model keep working rather than 410-ing in someone's face mid-shift.
 */
export async function loadRoster(
  db: Db,
  input: { partnerId: string; issuedToId: string | null }
): Promise<RosterRecord[]> {
  return db.mycoEmployee.findMany({
    where: {
      partnerId: input.partnerId,
      active: true,
      optedOut: false,
      ...(input.issuedToId ? { id: input.issuedToId } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      pinHash: true,
      pinFailedAttempts: true,
      pinLockedUntil: true,
      pinSessionsRevokedAt: true,
    },
  });
}

export function toRosterReviewer(record: RosterRecord, now: Date = new Date()): RosterReviewer {
  return {
    id: record.id,
    name: record.name,
    hasPin: Boolean(record.pinHash),
    lockedOut: Boolean(record.pinLockedUntil && record.pinLockedUntil.getTime() > now.getTime()),
  };
}

/* -------------------------------------------------------------- auto-close --- */

/**
 * Shuts the window the moment the last unclaimed name is taken (scope item 4).
 *
 * The `enrollmentClosedAt: null` guard makes this a compare-and-set, so two reviewers
 * enrolling at the same instant produce exactly one `window_auto_closed` ledger row
 * rather than two. Returns whether this call is the one that closed it.
 */
export async function autoCloseWindowIfRosterEnrolled(
  db: Db,
  input: { partnerId: string; accessTokenId: string; issuedToId: string | null },
  now: Date = new Date()
): Promise<boolean> {
  const roster = await loadRoster(db, input);
  const outstanding = roster.filter((reviewer) => !reviewer.pinHash);
  if (roster.length === 0 || outstanding.length > 0) return false;

  const closed = await db.catalogAccessToken.updateMany({
    where: { id: input.accessTokenId, enrollmentClosedAt: null },
    data: { enrollmentClosedAt: now },
  });
  if (closed.count === 0) return false;

  await appendEnrollmentEvent(db, {
    partnerId: input.partnerId,
    accessTokenId: input.accessTokenId,
    event: "window_auto_closed",
    outcome: "allowed",
    actorType: "system",
    actorIdentity: "system",
    reason: "every reviewer on the roster has enrolled",
    metadata: { enrolledCount: roster.length },
  });
  return true;
}

/* ------------------------------------------------------- pre-ship assertion --- */

export interface MintReadiness {
  ready: boolean;
  reviewers: { id: string; name: string; hasPin: boolean; pinSetAt: Date | null }[];
  alreadyEnrolled: { id: string; name: string; pinSetAt: Date | null }[];
}

/**
 * Scope item 9 — the check that has to run before a shared link goes out.
 *
 * A reviewer who already holds a PIN cannot self-enroll, so if the link ships while a
 * stale PIN is set (exactly what the four QA enrollments did on 2026-07-28) that person
 * is locked out of their own name and the failure only surfaces when they tap the link.
 * This surfaces it at mint time instead.
 */
export async function assertReviewersUnenrolled(
  db: Db,
  partnerId: string
): Promise<MintReadiness> {
  const roster = await db.mycoEmployee.findMany({
    where: { partnerId, active: true, optedOut: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, pinHash: true, pinSetAt: true },
  });
  const reviewers = roster.map((r) => ({
    id: r.id,
    name: r.name,
    hasPin: Boolean(r.pinHash),
    pinSetAt: r.pinSetAt,
  }));
  const alreadyEnrolled = reviewers
    .filter((r) => r.hasPin)
    .map((r) => ({ id: r.id, name: r.name, pinSetAt: r.pinSetAt }));
  return { ready: alreadyEnrolled.length === 0, reviewers, alreadyEnrolled };
}

/* -------------------------------------------------------------- PIN resets --- */

/** The columns an admin reset clears. Also revokes live sessions via the epoch. */
export function pinResetPatch(now: Date = new Date()) {
  return {
    pinHash: null,
    pinSetAt: null,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    pinSessionsRevokedAt: now,
  };
}
