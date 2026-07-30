/**
 * KEWL-2491 — the lock helper's contract.
 *
 * What actually has to hold for the fix to work is not "a lock is taken" but "BOTH mint
 * entry points take the SAME lock". That is only true if the key is a pure function of
 * partner + purpose, so these tests pin determinism and the int4 range that
 * `pg_advisory_xact_lock(int, int)` requires. The two callers each have their own test
 * asserting they route through this helper:
 * `scripts/mint-staff-link.lib.test.mjs` and
 * `src/app/api/admin/myco/staff-links/route.test.ts`.
 */

import { describe, expect, it, vi } from "vitest";

import {
  STAFF_LINK_MINT_LOCK_NAMESPACE,
  STAFF_REVIEW_PURPOSE,
  lockStaffLinkMint,
  staffLinkMintLockKey,
} from "./staffLinkMintLock";

const PARTNER_A = "partner_qa_0001";
const PARTNER_B = "partner_tmt_live";

const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;

describe("staffLinkMintLockKey", () => {
  it("is deterministic — the same partner always yields the same key", () => {
    // THE load-bearing property. If this drifted, the script and the route would take two
    // different locks and neither would block the other, while both still looked locked.
    expect(staffLinkMintLockKey(PARTNER_A)).toBe(staffLinkMintLockKey(PARTNER_A));
    expect(staffLinkMintLockKey(PARTNER_A, STAFF_REVIEW_PURPOSE)).toBe(
      staffLinkMintLockKey(PARTNER_A)
    );
  });

  it("separates partners and purposes", () => {
    // Not a correctness requirement the way determinism is — a collision here would only
    // over-serialise — but minting for one partner should not queue behind another's.
    expect(staffLinkMintLockKey(PARTNER_A)).not.toBe(staffLinkMintLockKey(PARTNER_B));
    expect(staffLinkMintLockKey(PARTNER_A, "brand_portal")).not.toBe(
      staffLinkMintLockKey(PARTNER_A, STAFF_REVIEW_PURPOSE)
    );
  });

  it("stays inside signed int32 for realistic and adversarial ids", () => {
    // `pg_advisory_xact_lock(int, int)` takes int4s. A key outside the range is not a
    // near miss — Postgres rejects the call and the mint fails at runtime, in the exact
    // concurrent situation the lock exists for.
    const ids = [
      PARTNER_A,
      PARTNER_B,
      "c",
      "",
      "partner_" + "x".repeat(500),
      "ünïcøde-partner-\u{1F344}",
      "0",
    ];
    for (const id of ids) {
      const key = staffLinkMintLockKey(id || "fallback");
      expect(Number.isInteger(key)).toBe(true);
      expect(key).toBeGreaterThanOrEqual(INT32_MIN);
      expect(key).toBeLessThanOrEqual(INT32_MAX);
    }
    expect(Number.isInteger(STAFF_LINK_MINT_LOCK_NAMESPACE)).toBe(true);
    expect(STAFF_LINK_MINT_LOCK_NAMESPACE).toBeLessThanOrEqual(INT32_MAX);
  });

  it("refuses to build an unscoped key", () => {
    // An empty partner id would silently lock one global key for every partner, turning a
    // per-partner lock into a global one — slow, and quietly wrong rather than loud.
    expect(() => staffLinkMintLockKey("")).toThrow(/partnerId/);
    expect(() => staffLinkMintLockKey(undefined as unknown as string)).toThrow(/partnerId/);
  });
});

describe("lockStaffLinkMint", () => {
  it("issues a transaction-scoped advisory lock with the namespaced key", async () => {
    const tx = { $executeRawUnsafe: vi.fn().mockResolvedValue(1) };

    await lockStaffLinkMint(tx, { partnerId: PARTNER_A });

    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, namespace, key] = tx.$executeRawUnsafe.mock.calls[0];
    // `_xact_` matters: it releases on COMMIT *and* ROLLBACK. The session-scoped variant
    // would leak a held lock onto a pooled connection whenever a refusal throws.
    expect(sql).toBe("SELECT pg_advisory_xact_lock($1::int, $2::int)");
    expect(namespace).toBe(STAFF_LINK_MINT_LOCK_NAMESPACE);
    expect(key).toBe(staffLinkMintLockKey(PARTNER_A));
  });

  it("awaits the lock before returning", async () => {
    // The caller reads immediately after this resolves, so returning early — before
    // Postgres has actually granted the lock — would reopen the whole race.
    let released: () => void = () => {};
    const gate = new Promise<number>((resolve) => {
      released = () => resolve(1);
    });
    const tx = { $executeRawUnsafe: vi.fn().mockReturnValue(gate) };

    let settled = false;
    const pending = lockStaffLinkMint(tx, { partnerId: PARTNER_A }).then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    released();
    await pending;
    expect(settled).toBe(true);
  });

  it("passes a distinct key per partner", async () => {
    const tx = { $executeRawUnsafe: vi.fn().mockResolvedValue(1) };

    await lockStaffLinkMint(tx, { partnerId: PARTNER_A });
    await lockStaffLinkMint(tx, { partnerId: PARTNER_B });

    const [keyA, keyB] = tx.$executeRawUnsafe.mock.calls.map((call) => call[2]);
    expect(keyA).not.toBe(keyB);
  });
});
