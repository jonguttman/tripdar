/**
 * KEWL-2379 — bounded PIN self-enrollment for the shared staff-review link.
 *
 * Jon's override (2026-07-28) replaced one-link-per-reviewer with ONE shared link and
 * "pick your PIN the first time you click it". That reopens the identity question
 * KEWL-2364 raised, so the claim is bounded on three independent axes rather than trusted:
 *
 *  1. TIME — a name can only be claimed while enrollment is open on that link (72h by
 *     default). Outside the window an unclaimed name fails closed; it never falls back to
 *     letting them in.
 *  2. EXHAUSTION — the window auto-closes the moment every roster reviewer holds a PIN,
 *     so the exposure ends on its own rather than running to the deadline.
 *  3. EVIDENCE — every claim, rejection, reset, open and close is an append-only ledger
 *     row with reviewer, timestamp, IP and user-agent, so a wrong claim is visible and
 *     an admin can reset that one PIN.
 *
 * A set PIN is never overwritable through any of this — enrollment is a compare-and-set on
 * `pinHash IS NULL` (kept from `f0f7d28`), so re-enrollment requires an explicit admin
 * reset, which is itself logged.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

/** Jon's default: the link is claimable for three days after it is minted. */
export const DEFAULT_ENROLLMENT_HOURS = 72;

/** Bounds on an admin-supplied window, so "reopen" can't become "open forever". */
export const MIN_ENROLLMENT_HOURS = 1;
export const MAX_ENROLLMENT_HOURS = 24 * 14;

export const ENROLLMENT_CLOSED_CODE = "enrollment_closed";
export const ENROLLMENT_CLOSED_MESSAGE =
  "PIN sign-up for this link has closed. Ask Jon to reopen enrollment.";

export type EnrollmentEventType =
  | "enrolled"
  | "enrollment_rejected"
  | "pin_reset"
  | "enrollment_opened"
  | "enrollment_closed";

export type EnrollmentActorType = "enrollment" | "admin" | "system";

export interface EnrollmentWindowState {
  enrollmentOpen: boolean;
  enrollmentClosesAt: Date | null;
}

/**
 * The window is open only if it was opened AND has not lapsed. The deadline is checked at
 * read time rather than by a sweeper job, so a missed cron can never leave it claimable.
 */
export function isEnrollmentOpen(state: EnrollmentWindowState, now = new Date()): boolean {
  if (!state.enrollmentOpen) return false;
  if (!state.enrollmentClosesAt) return true;
  return state.enrollmentClosesAt.getTime() > now.getTime();
}

export function enrollmentClosesAtFrom(hours: number | null | undefined, now = new Date()): Date {
  const requested = Number(hours);
  const safe = Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_ENROLLMENT_HOURS;
  const clamped = Math.min(Math.max(safe, MIN_ENROLLMENT_HOURS), MAX_ENROLLMENT_HOURS);
  return new Date(now.getTime() + clamped * 60 * 60 * 1000);
}

/** Fields cleared by an admin PIN reset. Also revokes that reviewer's live sessions — see
 *  `isReviewerSessionStale`: with no `pinSetAt` there is no session age that can be valid. */
export function pinResetPatch() {
  return {
    pinHash: null,
    pinSetAt: null,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
  };
}

/**
 * A session minted before the current PIN was set is stale.
 *
 * This is what makes "reset a reviewer's PIN" actually revoke their devices: the cookie
 * carries the time it was signed, so clearing `pinSetAt` (or setting a new one) invalidates
 * every cookie issued earlier without needing a session table.
 */
export function isReviewerSessionStale(input: {
  sessionIssuedAt: number;
  pinSetAt: Date | null;
}): boolean {
  if (!input.pinSetAt) return true;
  return input.sessionIssuedAt < input.pinSetAt.getTime();
}

/** Truncated so a hostile header cannot bloat the ledger. Stored as-is otherwise: Jon asked
 *  for IP and user-agent by name, and a hash would not tell him which device to go ask about. */
const MAX_IP_LENGTH = 64;
const MAX_USER_AGENT_LENGTH = 256;

export interface RequestFingerprint {
  ip: string | null;
  userAgent: string | null;
}

export function requestFingerprint(headers: Headers): RequestFingerprint {
  const forwarded = headers.get("x-forwarded-for");
  // Left-most entry is the client; the rest are proxies we added ourselves.
  const ip = (forwarded?.split(",")[0] ?? headers.get("x-real-ip") ?? "").trim();
  const userAgent = (headers.get("user-agent") ?? "").trim();
  return {
    ip: ip ? ip.slice(0, MAX_IP_LENGTH) : null,
    userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
  };
}

export interface EnrollmentLedgerEntry {
  partnerId: string;
  tokenId?: string | null;
  employeeId?: string | null;
  employeeName: string;
  employeeEmail?: string | null;
  eventType: EnrollmentEventType;
  actorType: EnrollmentActorType;
  actorIdentity: string;
  reason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

type PrismaLike = PrismaClient | Prisma.TransactionClient;

/** The only write path into the ledger. There is deliberately no update or delete helper. */
export async function recordEnrollmentEvent(
  db: PrismaLike,
  entry: EnrollmentLedgerEntry
): Promise<void> {
  await db.reviewerEnrollmentEvent.create({
    data: {
      partnerId: entry.partnerId,
      tokenId: entry.tokenId ?? null,
      employeeId: entry.employeeId ?? null,
      employeeName: entry.employeeName,
      employeeEmail: entry.employeeEmail ?? null,
      eventType: entry.eventType,
      actorType: entry.actorType,
      actorIdentity: entry.actorIdentity,
      reason: entry.reason ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    },
  });
}

/**
 * Closes the window as soon as nobody is left to enroll (Jon's "auto-close at six of six").
 *
 * Idempotent: the `enrollmentOpen: true` guard in the WHERE means a concurrent final
 * enrollment can only produce one `enrollment_closed` row, so the ledger doesn't grow a
 * duplicate close for every request that races.
 */
export async function closeEnrollmentIfRosterComplete(
  db: PrismaLike,
  input: { tokenId: string; partnerId: string }
): Promise<boolean> {
  const unclaimed = await db.mycoEmployee.count({
    where: { partnerId: input.partnerId, active: true, optedOut: false, pinHash: null },
  });
  if (unclaimed > 0) return false;

  const closed = await db.catalogAccessToken.updateMany({
    where: { id: input.tokenId, enrollmentOpen: true },
    data: { enrollmentOpen: false },
  });
  if (closed.count === 0) return false;

  await recordEnrollmentEvent(db, {
    partnerId: input.partnerId,
    tokenId: input.tokenId,
    employeeName: "—",
    eventType: "enrollment_closed",
    actorType: "system",
    actorIdentity: "auto-close",
    reason: "every roster reviewer has set a PIN",
  });
  return true;
}

/**
 * Pre-ship assertion (Jon's explicit ask): minting an enrollable link while someone already
 * holds a PIN means that person CANNOT claim their name — enrollment is compare-and-set on
 * a null hash. Surfaced as a loud warning on the mint response rather than a silent success.
 */
export function preMintPinWarnings(
  reviewers: { name: string; pinSetAt: Date | null; pinHash: string | null }[]
): string[] {
  return reviewers
    .filter((reviewer) => Boolean(reviewer.pinHash))
    .map(
      (reviewer) =>
        `${reviewer.name} already holds a PIN${
          reviewer.pinSetAt ? ` (set ${reviewer.pinSetAt.toISOString()})` : ""
        } and CANNOT claim their name on this link. Reset their PIN before sending it out.`
    );
}
