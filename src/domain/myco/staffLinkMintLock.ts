/**
 * KEWL-2491 — the one partner-scoped serialisation point for staff-link minting.
 *
 * THE BUG THIS FIXES: two entry points mint a partner's shared `staff_review` link —
 * `scripts/mint-staff-link.lib.mjs` and `src/app/api/admin/myco/staff-links/route.ts`.
 * Both read the partner's live token, decide, then revoke-and-create. Nothing made that
 * read-decide-write sequence atomic *across* the two, so two concurrent mints could each
 * observe "no active link" and each create one, leaving two live links for one partner.
 *
 * WHY A LOCK AND NOT A CONSTRAINT: the natural fix is a partial unique index —
 * "at most one `CatalogAccessToken` with `status='active'` and `purpose='staff_review'`
 * per partner". That is a schema change against production data that may already violate
 * it, so it needs migration review and Jon's approval. An advisory lock needs no DDL,
 * enforces the same invariant for every writer that takes it, and can ship now. If the
 * constraint is added later this helper stays correct — it just stops being the only
 * thing standing between us and a duplicate.
 *
 * WHY NOT JUST A TRANSACTION: an earlier attempt (`b784f26`) moved the read inside
 * `$transaction` and claimed SQLite/Turso's single-writer serialisation made it atomic.
 * Tripdar is **Postgres** (`prisma/schema.prisma` → `provider = "postgresql"`, Neon).
 * Under Postgres' default Read Committed isolation, two concurrent transactions can both
 * run that read and both see no active token — a transaction boundary alone serialises
 * nothing here, because there is no row to contend on when the answer is "none exists".
 * The lock is what creates the contention point that the missing row does not.
 *
 * `pg_advisory_xact_lock` is transaction-scoped on purpose: it releases on COMMIT *and*
 * on ROLLBACK, so a refusal that throws mid-transaction cannot leak a held lock. The
 * session-scoped variant (`pg_advisory_lock`) would need a matching unlock on every exit
 * path, including the throwing ones, and a connection returned to Prisma's pool still
 * holding it would deadlock the next request to use it.
 */

/**
 * The slice of a Prisma client this helper needs.
 *
 * Declared structurally rather than as `Prisma.TransactionClient` so the plain-JS mint
 * script (`scripts/mint-staff-link.lib.mjs`, which injects a recording double and never
 * loads the generated client) can satisfy it too. Both real entry points pass an
 * interactive-transaction client, which has this method.
 */
export type AdvisoryLockClient = {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
};

/**
 * First half of the two-int lock key, shared by every staff-link mint.
 *
 * Postgres advisory locks live in one global namespace per database, so an unnamespaced
 * key could collide with an unrelated feature's lock and serialise the two against each
 * other. Fixing the first int to this constant confines every collision risk to the
 * second int, which we derive ourselves.
 */
export const STAFF_LINK_MINT_LOCK_NAMESPACE = 2491;

export const STAFF_REVIEW_PURPOSE = "staff_review";

/**
 * FNV-1a, 32-bit, returned as a **signed** int32.
 *
 * `pg_advisory_xact_lock(int, int)` takes two int4s, so the key has to fit in a signed
 * 32-bit integer — `| 0` is the conversion, not a truncation of a wider hash.
 * `Math.imul` is what keeps the multiply in 32-bit space instead of drifting into
 * float territory the way `*` would past 2^53.
 */
function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

/**
 * Derive the partner+purpose half of the lock key.
 *
 * ON COLLISIONS: two different partners can hash to the same int32. That is safe in the
 * direction that matters — a collision makes two unrelated partners' mints wait for each
 * other (a brief, correct-but-unnecessary serialisation), it never lets two mints for the
 * *same* partner run concurrently. Under-locking would be the dangerous failure and a
 * hash cannot produce it: equal inputs always produce equal keys.
 *
 * `purpose` is in the key so a future `brand_portal` mint does not queue behind a staff
 * mint for the same partner.
 */
export function staffLinkMintLockKey(partnerId: string, purpose: string = STAFF_REVIEW_PURPOSE): number {
  if (!partnerId) throw new Error("staffLinkMintLockKey requires a partnerId");
  return fnv1a32(`${partnerId}:${purpose}`);
}

/**
 * Serialise this partner's staff-link mint against every other one.
 *
 * MUST be called **inside** a transaction and **before** the caller reads the partner's
 * active token — a lock taken after the read leaves exactly the window it exists to
 * close. Blocks until any concurrent holder's transaction commits or rolls back.
 *
 * Both mint entry points call this and only this, which is what makes the invariant
 * shared rather than reimplemented per caller.
 */
export async function lockStaffLinkMint(
  tx: AdvisoryLockClient,
  { partnerId, purpose = STAFF_REVIEW_PURPOSE }: { partnerId: string; purpose?: string }
): Promise<void> {
  await tx.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock($1::int, $2::int)",
    STAFF_LINK_MINT_LOCK_NAMESPACE,
    staffLinkMintLockKey(partnerId, purpose)
  );
}
