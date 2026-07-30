/**
 * KEWL-2480 — the argument parsing, guards and mint transaction behind
 * `scripts/mint-staff-link.mjs`.
 *
 * WHY THIS IS A SEPARATE MODULE: minting revokes a partner's live staff link, and the
 * original script hardcoded `name: "The Mushroom Top"` with the revoke reachable from a
 * copy-pasted command line. That is only safely reviewable if the guards can be asserted
 * without a database — and the CLI itself cannot be imported by a test, because it is a
 * top-level-await script that would run the transaction on import. So the decision logic
 * lives here, behind an injected `prisma`, and `mint-staff-link.mjs` is a thin wrapper.
 *
 * See `mint-staff-link.lib.test.mjs` for the five cases that pin the blast radius:
 * no partner, ambiguous partner, refuse-on-active-token, partner-scoped revoke `where`,
 * and `--force` not implying the revoke.
 */

import {
  createCatalogAccessToken,
  hashCatalogAccessToken,
} from "../src/domain/myco/catalogTokens.ts";
import {
  DEFAULT_ENROLLMENT_HOURS,
  enrollmentClosesAtFrom,
  preMintPinWarnings,
} from "../src/domain/myco/reviewerEnrollment.ts";
import { staffReviewerWhere } from "../src/domain/myco/staffReviewRoster.ts";

/**
 * Kept at the KEWL-2379 value on purpose. `issuedBy` / `revokedBy` are the only record of
 * who minted or killed a link, and the KEWL-2422 audit queried this exact string — changing
 * it would orphan the existing rows from the ones this script writes next.
 */
export const MINT_ACTOR = "kewl-2379-mint";

export const REVOKE_REASON = "superseded by the shared staff link";

/** Thrown for operator error (bad flags, refused guard). The CLI prints it and exits 1. */
export class MintUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "MintUsageError";
  }
}

/**
 * `--partner` is REQUIRED and has no default.
 *
 * The bug this fixes: the script used to resolve The Mushroom Top implicitly, so every
 * invocation — including one copy-pasted out of the header to try the command — pointed at
 * the live pilot partner. A default with a warning would not have helped; the warning is
 * exactly what a hurried operator skips. Requiring the argument is the fix.
 *
 * Note the first bare (non-`--`) argument is still `baseUrl`, so the partner is a named
 * flag rather than a second positional.
 */
export function parseMintArgs(argv) {
  const flagValue = (name) => {
    const match = argv.find((arg) => arg.startsWith(`--${name}=`));
    return match ? match.slice(`--${name}=`.length) : undefined;
  };

  const partner = flagValue("partner")?.trim();
  if (!partner) {
    throw new MintUsageError(
      "--partner=<name|id> is required. This script revokes and re-mints a partner's live " +
        "staff-review link; it deliberately has no default partner."
    );
  }

  const hoursRaw = flagValue("hours");
  const hours = hoursRaw === undefined ? DEFAULT_ENROLLMENT_HOURS : Number(hoursRaw);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new MintUsageError(`--hours must be a positive number (got ${JSON.stringify(hoursRaw)})`);
  }

  return {
    partner,
    baseUrl: argv.find((arg) => !arg.startsWith("--")) ?? "http://localhost:3000",
    /** Overrides the PIN pre-ship assertion ONLY. It does not authorise the revoke. */
    force: argv.includes("--force"),
    /** The one and only flag that permits destroying a live link. */
    revokeExisting: argv.includes("--revoke-existing"),
    hours,
  };
}

/**
 * Accepts an id or an exact name so the operator can paste whichever they have, without
 * either form silently falling back to a hardcoded partner.
 *
 * This predicate is deliberately allowed to match more than one row: `Partner.name` carries
 * no `@unique` in `prisma/schema.prisma` (only `apiKeyHash` does), so two partners may share
 * a name and one partner's `name` may equal another's `id`. Resolving that with `findFirst`
 * would pick arbitrarily — and on a revoke-capable script an arbitrary pick is a wrong-target
 * write, not a near miss. `resolvePartner` below refuses instead of guessing (KEWL-2486).
 */
export function partnerSelectorWhere(selector) {
  return { OR: [{ id: selector }, { name: selector }] };
}

/**
 * Resolve `--partner` to exactly one partner, or refuse having written nothing.
 *
 * `take: 2` is all the guard needs: one row is the happy path, two is already proof of
 * ambiguity. The refusal therefore reports "at least" the rows it fetched rather than
 * claiming to have enumerated every match — the operator's next step is the same either way
 * (re-run with the id), and paging the full set to phrase the message differently would be
 * the only reason to read more.
 */
export async function resolvePartner({ prisma, selector }) {
  const matches = await prisma.partner.findMany({
    where: partnerSelectorWhere(selector),
    take: 2,
    select: { id: true, name: true },
  });

  if (matches.length === 0) throw new MintUsageError(`Partner not found: ${selector}`);

  if (matches.length > 1) {
    const listed = matches
      .map((match) => `  id=${match.id} name=${JSON.stringify(match.name)}`)
      .join("\n");
    throw new MintUsageError(
      `Ambiguous --partner=${selector} — it matched at least ${matches.length} partners:\n${listed}\n` +
        "Partner names are not unique, and a partner's name may equal another partner's id. " +
        "Re-run with --partner=<id> to name exactly one. Nothing was written."
    );
  }

  return matches[0];
}

/**
 * The single predicate for "this partner's live staff links".
 *
 * Every read and every revoke goes through it, so the partner id physically cannot be
 * dropped from the revoke `where` the way it was when the partner was resolved implicitly.
 */
export function activeStaffTokenWhere(partnerId) {
  if (!partnerId) throw new Error("activeStaffTokenWhere requires a partnerId");
  return { purpose: "staff_review", partnerId, status: "active" };
}

/**
 * Refuse-by-default: an existing live link is only destroyed when the operator asked for
 * it by name. `--force` is NOT accepted here — it means "override the PIN assertion", and
 * folding two unrelated overrides into one flag is how the wrong link gets revoked.
 */
export function planTokenAction({ activeToken, revokeExisting }) {
  if (!activeToken) return { action: "mint" };
  if (revokeExisting) return { action: "revoke-then-mint" };
  return {
    action: "refuse",
    reason:
      `An active staff-review link already exists for this partner: ` +
      `id=${activeToken.id} issuedAt=${activeToken.issuedAt?.toISOString?.() ?? activeToken.issuedAt}. ` +
      `Minting would strand anyone holding it. Pass --revoke-existing to replace it deliberately.`,
  };
}

/**
 * Resolve partner → roster → PIN assertion → live-link gate → mint.
 *
 * `prisma` is injected so the guards can be exercised against a recording double. Returns
 * the mint result; throws `MintUsageError` on any refusal, having written nothing.
 */
export async function runMintStaffLink({ argv, prisma, log = () => {}, warn = () => {} }) {
  const args = parseMintArgs(argv);

  const partner = await resolvePartner({ prisma, selector: args.partner });

  const reviewers = await prisma.mycoEmployee.findMany({
    where: staffReviewerWhere(partner.id),
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, pinHash: true, pinSetAt: true },
  });
  if (reviewers.length === 0) {
    throw new MintUsageError(`No active roster reviewers found for partner ${partner.name}`);
  }

  // Hand-off evidence Jon asked for by name: every reviewer, correctly named, PIN state shown.
  log({ kind: "roster", partner, reviewers });

  const warnings = preMintPinWarnings(reviewers);
  if (warnings.length > 0) {
    warn({ kind: "pin-assertion", warnings, overridden: args.force });
    if (!args.force) {
      throw new MintUsageError(
        "PRE-SHIP ASSERTION FAILED — a roster reviewer already holds a PIN and could not claim " +
          "their name on a new link. Reset those PINs (admin reset-all, which logs it) and re-run. " +
          "--force overrides this assertion only; it does not permit revoking a live link."
      );
    }
  }

  const activeToken = await prisma.catalogAccessToken.findFirst({
    where: activeStaffTokenWhere(partner.id),
    select: { id: true, issuedAt: true },
  });
  const plan = planTokenAction({ activeToken, revokeExisting: args.revokeExisting });
  if (plan.action === "refuse") throw new MintUsageError(plan.reason);

  const enrollmentClosesAt = enrollmentClosesAtFrom(args.hours);
  const token = createCatalogAccessToken();

  const record = await prisma.$transaction(async (tx) => {
    if (plan.action === "revoke-then-mint") {
      await tx.catalogAccessToken.updateMany({
        where: activeStaffTokenWhere(partner.id),
        data: {
          status: "revoked",
          revokedAt: new Date(),
          revokedBy: MINT_ACTOR,
          revocationReason: REVOKE_REASON,
          enrollmentOpen: false,
        },
      });
    }

    const created = await tx.catalogAccessToken.create({
      data: {
        tokenHash: hashCatalogAccessToken(token),
        purpose: "staff_review",
        status: "active",
        partnerId: partner.id,
        issuedToType: "staff",
        // Shared: no `issuedToId`. The roster picks who they are, inside the window below.
        issuedToId: null,
        issuedToEmail: null,
        issuedBy: MINT_ACTOR,
        enrollmentOpen: true,
        enrollmentClosesAt,
      },
      select: { id: true, issuedAt: true, enrollmentClosesAt: true },
    });

    await tx.reviewerEnrollmentEvent.create({
      data: {
        partnerId: partner.id,
        tokenId: created.id,
        employeeName: "—",
        eventType: "enrollment_opened",
        actorType: "admin",
        actorIdentity: MINT_ACTOR,
        reason: `shared staff link minted; enrollment open until ${enrollmentClosesAt.toISOString()}`,
      },
    });

    return created;
  });

  return {
    id: record.id,
    partner: { id: partner.id, name: partner.name },
    shared: true,
    revokedPrevious: plan.action === "revoke-then-mint",
    url: `${args.baseUrl}/staff/catalog/${token}`,
    issuedAt: record.issuedAt,
    enrollmentClosesAt: record.enrollmentClosesAt,
    roster: reviewers.map((reviewer) => reviewer.name),
  };
}
