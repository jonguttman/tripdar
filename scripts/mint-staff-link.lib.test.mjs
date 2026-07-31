/**
 * KEWL-2480 — pins the blast radius of `scripts/mint-staff-link.mjs`.
 *
 * The bug these cover: the script hardcoded `name: "The Mushroom Top"` and revoked EVERY
 * active staff-review token for that partner before minting, with no partner argument at
 * all. The revoke-scope case below — asserting the revoke `where` object carries the
 * partner id that was actually passed in — is the one that would have caught it.
 *
 * KEWL-2486 adds the ambiguity block: `Partner.name` is not unique, so a selector can match
 * two partners, and the old `findFirst` would have picked one arbitrarily and revoked its
 * live link. Those cases assert the refusal happens at the resolution read, before anything
 * downstream of it runs. No production data ever had a collision — the guard exists because
 * the day one appears is a data event no test run would catch.
 *
 * Every case runs against a recording prisma double. Nothing here touches a database, and
 * `mint-staff-link.mjs` itself is deliberately never imported (it is a top-level-await
 * script; importing it would execute the mint).
 */

import { describe, expect, it } from "vitest";
import {
  MINT_ACTOR,
  MintUsageError,
  activeStaffTokenWhere,
  parseMintArgs,
  planTokenAction,
  runMintStaffLink,
} from "./mint-staff-link.lib.mjs";
import {
  STAFF_LINK_MINT_LOCK_NAMESPACE,
  staffLinkMintLockKey,
} from "../src/domain/myco/staffLinkMintLock.ts";

const PARTNER_ID = "partner_qa_0001";
const OTHER_PARTNER_ID = "partner_tmt_live";

/**
 * Records every call. Any model/method not configured below throws, so a code path that
 * reaches an unexpected table fails the test rather than silently no-opping.
 */
function makePrisma({
  partner = { id: PARTNER_ID, name: "QA Partner" },
  /** Overrides `partner` when a case needs 0 or >1 rows back from the selector. */
  partners,
  reviewers,
  activeToken = null,
} = {}) {
  const calls = [];
  const record = (method, args) => calls.push({ method, args });
  const partnerRows = partners ?? (partner ? [partner] : []);

  const tokenModel = {
    findFirst: async (args) => {
      record("catalogAccessToken.findFirst", args);
      return activeToken;
    },
    updateMany: async (args) => {
      record("catalogAccessToken.updateMany", args);
      return { count: 1 };
    },
    create: async (args) => {
      record("catalogAccessToken.create", args);
      return {
        id: "token_new",
        issuedAt: new Date("2026-07-29T00:00:00.000Z"),
        enrollmentClosesAt: args.data.enrollmentClosesAt,
      };
    },
  };

  const prisma = {
    calls,
    partner: {
      // Honours `take` the way Prisma does, so the guard's `take: 2` is exercised rather
      // than assumed.
      findMany: async (args) => {
        record("partner.findMany", args);
        return partnerRows.slice(0, args.take ?? partnerRows.length);
      },
    },
    mycoEmployee: {
      findMany: async (args) => {
        record("mycoEmployee.findMany", args);
        return (
          reviewers ?? [
            { id: "e1", name: "Adrienne", email: "adrienne@x.internal", pinHash: null, pinSetAt: null },
          ]
        );
      },
    },
    catalogAccessToken: tokenModel,
    reviewerEnrollmentEvent: {
      create: async (args) => {
        record("reviewerEnrollmentEvent.create", args);
        return { id: "event_new" };
      },
    },
    $transaction: async (fn) =>
      fn({
        catalogAccessToken: tokenModel,
        reviewerEnrollmentEvent: prisma.reviewerEnrollmentEvent,
        // KEWL-2491: the tx client the lock helper needs. Recorded like everything else so
        // the lock's presence and ordering are assertable rather than assumed.
        $executeRawUnsafe: async (...args) => {
          record("$executeRawUnsafe", args);
          return 1;
        },
      }),
  };
  return prisma;
}

const writeMethods = [
  "catalogAccessToken.updateMany",
  "catalogAccessToken.create",
  "reviewerEnrollmentEvent.create",
];
const writes = (prisma) => prisma.calls.filter((call) => writeMethods.includes(call.method));

describe("mint-staff-link — --partner is required", () => {
  it("throws before touching prisma when --partner is missing", async () => {
    const prisma = makePrisma();
    await expect(runMintStaffLink({ argv: [], prisma })).rejects.toBeInstanceOf(MintUsageError);
    expect(prisma.calls).toEqual([]);
  });

  it("does not fall back to The Mushroom Top", () => {
    expect(() => parseMintArgs(["https://www.tripd.ar", "--force"])).toThrow(/--partner/);
    expect(JSON.stringify(parseMintArgs([`--partner=${PARTNER_ID}`]))).not.toContain("Mushroom");
  });

  it("keeps baseUrl as the first bare argument", () => {
    const args = parseMintArgs([`--partner=${PARTNER_ID}`, "https://www.tripd.ar"]);
    expect(args.baseUrl).toBe("https://www.tripd.ar");
    expect(args.partner).toBe(PARTNER_ID);
    expect(args.revokeExisting).toBe(false);
    expect(args.force).toBe(false);
  });
});

describe("mint-staff-link — refuses an ambiguous partner instead of guessing", () => {
  const DUPLICATE_NAME = "The Mushroom Top";

  it("refuses when the selector matches two partners sharing a name, writing nothing", async () => {
    const prisma = makePrisma({
      partners: [
        { id: "partner_tmt_live", name: DUPLICATE_NAME },
        { id: "partner_tmt_dupe", name: DUPLICATE_NAME },
      ],
    });

    await expect(
      runMintStaffLink({ argv: [`--partner=${DUPLICATE_NAME}`, "--revoke-existing"], prisma })
    ).rejects.toThrow(/Ambiguous --partner/);

    // Not just "no write": the run stopped at the resolution read and never looked at the
    // roster or the token table, so no branch downstream of it could have fired.
    expect(prisma.calls.map((call) => call.method)).toEqual(["partner.findMany"]);
    expect(writes(prisma)).toEqual([]);
  });

  it("refuses when one partner's name equals another partner's id, writing nothing", async () => {
    // Legal in the schema: `Partner.name` has no @unique, so nothing stops a name from
    // being spelled exactly like some other partner's id.
    const COLLIDING = "partner_tmt_live";
    const prisma = makePrisma({
      partners: [
        { id: COLLIDING, name: "The Mushroom Top" },
        { id: "partner_qa_0001", name: COLLIDING },
      ],
    });

    await expect(runMintStaffLink({ argv: [`--partner=${COLLIDING}`], prisma })).rejects.toThrow(
      /Ambiguous --partner/
    );
    expect(prisma.calls.map((call) => call.method)).toEqual(["partner.findMany"]);
    expect(writes(prisma)).toEqual([]);
  });

  it("names every match it saw so the operator can pick the id", async () => {
    const prisma = makePrisma({
      partners: [
        { id: "partner_tmt_live", name: DUPLICATE_NAME },
        { id: "partner_tmt_dupe", name: DUPLICATE_NAME },
      ],
    });

    await expect(runMintStaffLink({ argv: [`--partner=${DUPLICATE_NAME}`], prisma })).rejects.toThrow(
      /partner_tmt_live[\s\S]*partner_tmt_dupe[\s\S]*--partner=<id>/
    );
    // Two rows is already proof of ambiguity, so the guard reads no further than that.
    expect(prisma.calls[0].args.take).toBe(2);
  });

  it("refuses with the not-found message when the selector matches nothing", async () => {
    const prisma = makePrisma({ partners: [] });

    await expect(runMintStaffLink({ argv: ["--partner=nope"], prisma })).rejects.toThrow(
      /Partner not found: nope/
    );
    expect(writes(prisma)).toEqual([]);
  });

  it("still resolves and proceeds on exactly one match", async () => {
    // Guards the guard: refusing on >1 must not have made the ordinary single-match path
    // refuse too.
    const prisma = makePrisma({ partners: [{ id: PARTNER_ID, name: "QA Partner" }] });

    const result = await runMintStaffLink({
      argv: [`--partner=${PARTNER_ID}`, "https://www.tripd.ar"],
      prisma,
    });

    expect(result.id).toBe("token_new");
    expect(result.partner).toEqual({ id: PARTNER_ID, name: "QA Partner" });
    const created = prisma.calls.find((call) => call.method === "catalogAccessToken.create");
    expect(created.args.data.partnerId).toBe(PARTNER_ID);
  });

  it("resolves by exact name as well as by id", async () => {
    const prisma = makePrisma({ partners: [{ id: PARTNER_ID, name: "QA Partner" }] });

    const result = await runMintStaffLink({ argv: ["--partner=QA Partner"], prisma });

    expect(result.partner.id).toBe(PARTNER_ID);
    expect(prisma.calls[0].args.where).toEqual({
      OR: [{ id: "QA Partner" }, { name: "QA Partner" }],
    });
  });
});

describe("mint-staff-link — refuses to clobber a live link", () => {
  it("reports the existing token and writes nothing when --revoke-existing is absent", async () => {
    const activeToken = { id: "token_live", issuedAt: new Date("2026-07-28T18:00:00.000Z") };
    const prisma = makePrisma({ activeToken });

    await expect(runMintStaffLink({ argv: [`--partner=${PARTNER_ID}`], prisma })).rejects.toThrow(
      /token_live.*2026-07-28T18:00:00\.000Z/s
    );
    expect(writes(prisma)).toEqual([]);
  });

  it("planTokenAction refuses on an active token and mints on none", () => {
    const activeToken = { id: "token_live", issuedAt: new Date("2026-07-28T18:00:00.000Z") };
    expect(planTokenAction({ activeToken, revokeExisting: false }).action).toBe("refuse");
    // KEWL-2491: --revoke-existing alone is no longer sufficient. It authorises revoking
    // the token this run inspected, so the inspected id has to match for the revoke to be
    // planned. The mismatch cases are covered in the compare-and-swap describe below.
    expect(
      planTokenAction({ activeToken, revokeExisting: true, inspectedTokenId: "token_live" }).action
    ).toBe("revoke-then-mint");
    expect(planTokenAction({ activeToken: null, revokeExisting: false }).action).toBe("mint");
  });
});

describe("mint-staff-link — the revoke is scoped to the partner that was passed in", () => {
  it("revokes only that partner's tokens, never another partner's", async () => {
    const activeToken = { id: "token_live", issuedAt: new Date("2026-07-28T18:00:00.000Z") };
    const prisma = makePrisma({ activeToken });

    const result = await runMintStaffLink({
      argv: [`--partner=${PARTNER_ID}`, "--revoke-existing", "https://www.tripd.ar"],
      prisma,
    });

    const revoke = prisma.calls.find((call) => call.method === "catalogAccessToken.updateMany");
    expect(revoke).toBeDefined();
    // The assertion that would have caught the original bug: the partner id in the revoke
    // filter is the one the operator passed, and the filter cannot match anyone else.
    // KEWL-2491 adds `id` — the compare-and-swap — without dropping any of the three
    // blast-radius fields, so a bad id still cannot reach another partner's rows.
    expect(revoke.args.where).toEqual({
      purpose: "staff_review",
      partnerId: PARTNER_ID,
      status: "active",
      id: "token_live",
    });
    expect(revoke.args.where.partnerId).not.toBe(OTHER_PARTNER_ID);
    expect(revoke.args.data.revokedBy).toBe(MINT_ACTOR);

    const created = prisma.calls.find((call) => call.method === "catalogAccessToken.create");
    expect(created.args.data.partnerId).toBe(PARTNER_ID);
    expect(created.args.data.issuedBy).toBe(MINT_ACTOR);

    const ledger = prisma.calls.find((call) => call.method === "reviewerEnrollmentEvent.create");
    expect(ledger.args.data.actorIdentity).toBe(MINT_ACTOR);
    expect(ledger.args.data.partnerId).toBe(PARTNER_ID);

    expect(result.revokedPrevious).toBe(true);
    expect(result.url).toMatch(/^https:\/\/www\.tripd\.ar\/staff\/catalog\/.+/);
  });

  it("activeStaffTokenWhere refuses to build an unscoped filter", () => {
    expect(() => activeStaffTokenWhere(undefined)).toThrow(/partnerId/);
    expect(() => activeStaffTokenWhere("")).toThrow(/partnerId/);
  });
});

describe("mint-staff-link — --force gates the PIN assertion only", () => {
  const withPin = [
    {
      id: "e1",
      name: "Audrey",
      email: "audrey@x.internal",
      pinHash: "hash",
      pinSetAt: new Date("2026-07-28T12:00:00.000Z"),
    },
  ];

  it("refuses on a set PIN without --force, writing nothing", async () => {
    const prisma = makePrisma({ reviewers: withPin });
    await expect(runMintStaffLink({ argv: [`--partner=${PARTNER_ID}`], prisma })).rejects.toThrow(
      /PRE-SHIP ASSERTION FAILED/
    );
    expect(writes(prisma)).toEqual([]);
  });

  it("--force clears the PIN assertion but still refuses to revoke a live link", async () => {
    const activeToken = { id: "token_live", issuedAt: new Date("2026-07-28T18:00:00.000Z") };
    const prisma = makePrisma({ reviewers: withPin, activeToken });

    await expect(
      runMintStaffLink({ argv: [`--partner=${PARTNER_ID}`, "--force"], prisma })
    ).rejects.toThrow(/--revoke-existing/);
    expect(writes(prisma)).toEqual([]);
  });

  it("--force mints when there is no live link, proving it passed the PIN gate", async () => {
    const prisma = makePrisma({ reviewers: withPin, activeToken: null });
    const result = await runMintStaffLink({ argv: [`--partner=${PARTNER_ID}`, "--force"], prisma });

    expect(result.id).toBe("token_new");
    // No live link existed, so nothing was revoked — --force never implies the revoke.
    expect(prisma.calls.some((call) => call.method === "catalogAccessToken.updateMany")).toBe(false);
    expect(result.revokedPrevious).toBe(false);
  });
});

/**
 * KEWL-2491 — two entry points mint a partner's shared staff link, and nothing made them
 * atomic with respect to each other.
 *
 * The race has two distinct outcomes, and they need two distinct fixes:
 *
 *  1. **Duplicate live links.** Script and admin route both read "no active link", both
 *     create one. Fixed by `pg_advisory_xact_lock`, taken by BOTH entry points on the same
 *     partner+purpose key, BEFORE the read.
 *
 *  2. **Revoking an uninspected token.** The operator saw token A and passed
 *     `--revoke-existing`. A concurrent admin mint replaced A with B. An unconditioned
 *     revoke kills B — a link the operator was never shown — and reports success as if it
 *     had replaced A. Fixed by comparing the live token id against the inspected one and
 *     refusing on mismatch (the compare half of a compare-and-swap; the revoke `where`'s
 *     `id` is the swap half).
 *
 * The lock alone does not fix (2): serialised access still revokes the wrong token. The
 * CAS alone does not fix (1): two transactions that both see nothing both proceed to
 * create. The tests below cover each independently.
 *
 * A NOTE ON WHAT AN EARLIER FIX GOT WRONG (`b784f26`): it moved the read inside
 * `$transaction` and asserted that SQLite/Turso single-writer serialisation made the
 * sequence atomic. This database is Postgres (`prisma/schema.prisma` → `postgresql`,
 * Neon). Under Read Committed, a transaction boundary serialises nothing when the
 * contended state is the ABSENCE of a row. That version also kept the unconditioned
 * `updateMany`, and the test here asserted revoking the uninspected token was "consistent"
 * — encoding the defect as correct behaviour. Both are corrected below.
 */
describe("mint-staff-link — KEWL-2491: mints are serialised and the revoke is compare-and-swapped", () => {
  const LOCK_SQL = "SELECT pg_advisory_xact_lock($1::int, $2::int)";

  /**
   * A double whose pre-transaction read and in-transaction read can return DIFFERENT
   * tokens — which is the whole race. `inspectedToken` is what the operator's run sees
   * before the tx (the "inspected" state); `txActiveToken` is what the database actually
   * holds once the lock is acquired, i.e. after a concurrent mint has landed.
   */
  function makeRacingPrisma({ inspectedToken = null, txActiveToken = null } = {}) {
    const calls = [];
    const record = (layer, method, args) => calls.push({ layer, method, args });

    const txTokenModel = {
      findFirst: async (args) => {
        record("tx", "catalogAccessToken.findFirst", args);
        return txActiveToken;
      },
      updateMany: async (args) => {
        record("tx", "catalogAccessToken.updateMany", args);
        // Honour the `id` predicate the way Postgres would, so a compare-and-swap that
        // matches nothing reports count 0 instead of silently "succeeding".
        const matches = txActiveToken && (!args.where.id || args.where.id === txActiveToken.id);
        return { count: matches ? 1 : 0 };
      },
      create: async (args) => {
        record("tx", "catalogAccessToken.create", args);
        return {
          id: "token_new",
          issuedAt: new Date("2026-07-29T00:00:00.000Z"),
          enrollmentClosesAt: args.data.enrollmentClosesAt,
        };
      },
    };

    const prisma = {
      calls,
      partner: {
        findMany: async (args) => {
          record("outer", "partner.findMany", args);
          return [{ id: PARTNER_ID, name: "QA Partner" }].slice(0, args.take ?? 1);
        },
      },
      mycoEmployee: {
        findMany: async (args) => {
          record("outer", "mycoEmployee.findMany", args);
          return [
            { id: "e1", name: "Adrienne", email: "adrienne@x.internal", pinHash: null, pinSetAt: null },
          ];
        },
      },
      catalogAccessToken: {
        // The pre-tx inspection read. It exists deliberately (it is the CAS baseline), but
        // it must never be the read a write is planned from — the tx read is.
        findFirst: async (args) => {
          record("outer", "catalogAccessToken.findFirst", args);
          return inspectedToken;
        },
      },
      reviewerEnrollmentEvent: {
        create: async (args) => {
          record("tx", "reviewerEnrollmentEvent.create", args);
          return { id: "event_new" };
        },
      },
      $transaction: async (fn) =>
        fn({
          catalogAccessToken: txTokenModel,
          reviewerEnrollmentEvent: { create: prisma.reviewerEnrollmentEvent.create },
          $executeRawUnsafe: async (...args) => {
            record("tx", "$executeRawUnsafe", args);
            return 1;
          },
        }),
    };
    return prisma;
  }

  const txWritesOf = (prisma) =>
    prisma.calls.filter(
      (call) =>
        call.layer === "tx" &&
        (call.method === "catalogAccessToken.create" ||
          call.method === "catalogAccessToken.updateMany" ||
          call.method === "reviewerEnrollmentEvent.create")
    );

  describe("the advisory lock", () => {
    it("is taken inside the transaction and BEFORE the active-token read", async () => {
      const prisma = makeRacingPrisma();
      await runMintStaffLink({ argv: [`--partner=${PARTNER_ID}`], prisma });

      const txSequence = prisma.calls.filter((call) => call.layer === "tx").map((call) => call.method);
      // Ordering is the entire point: a lock taken after the read leaves open exactly the
      // window it exists to close.
      expect(txSequence[0]).toBe("$executeRawUnsafe");
      expect(txSequence[1]).toBe("catalogAccessToken.findFirst");
      expect(txSequence.indexOf("$executeRawUnsafe")).toBeLessThan(
        txSequence.indexOf("catalogAccessToken.create")
      );
    });

    it("locks on pg_advisory_xact_lock keyed to this partner", async () => {
      const prisma = makeRacingPrisma();
      await runMintStaffLink({ argv: [`--partner=${PARTNER_ID}`], prisma });

      const lock = prisma.calls.find((call) => call.method === "$executeRawUnsafe");
      const [sql, namespace, key] = lock.args;
      expect(sql).toBe(LOCK_SQL);
      expect(namespace).toBe(STAFF_LINK_MINT_LOCK_NAMESPACE);
      // The key the admin route computes for the same partner — that both entry points
      // derive the SAME key from the same helper is what makes them mutually exclusive.
      expect(key).toBe(staffLinkMintLockKey(PARTNER_ID, "staff_review"));
    });

    it("takes the lock exactly once, and does not take another partner's", async () => {
      const prisma = makeRacingPrisma();
      await runMintStaffLink({ argv: [`--partner=${PARTNER_ID}`], prisma });

      const locks = prisma.calls.filter((call) => call.method === "$executeRawUnsafe");
      expect(locks).toHaveLength(1);
      expect(locks[0].args[2]).not.toBe(staffLinkMintLockKey(OTHER_PARTNER_ID, "staff_review"));
    });

    it("is still taken on the refusal paths, so the decision itself is serialised", async () => {
      // The refuse cases must ALSO hold the lock while they read — otherwise a run could
      // decide "refuse" against a token that a concurrent mint was mid-way through
      // replacing, and report an id that never existed at commit time.
      const prisma = makeRacingPrisma({
        inspectedToken: { id: "token_live", issuedAt: new Date("2026-07-28T18:00:00.000Z") },
        txActiveToken: { id: "token_live", issuedAt: new Date("2026-07-28T18:00:00.000Z") },
      });

      await expect(
        runMintStaffLink({ argv: [`--partner=${PARTNER_ID}`], prisma })
      ).rejects.toBeInstanceOf(MintUsageError);

      const txSequence = prisma.calls.filter((call) => call.layer === "tx").map((call) => call.method);
      expect(txSequence[0]).toBe("$executeRawUnsafe");
      expect(txWritesOf(prisma)).toEqual([]);
    });
  });

  describe("the compare-and-swap on --revoke-existing", () => {
    it("REFUSES when a concurrent mint replaced the inspected token, writing nothing", async () => {
      // The case the previous fix got backwards. Operator inspected A and consented to
      // replacing A. By the time the lock is held, a concurrent admin mint has made B live.
      // Revoking B would strand everyone holding a link the operator was never shown, and
      // the success output would claim A was replaced. The only safe answer is to refuse.
      const tokenA = { id: "token_A", issuedAt: new Date("2026-07-29T09:00:00.000Z") };
      const tokenB = { id: "token_B", issuedAt: new Date("2026-07-29T10:00:00.000Z") };
      const prisma = makeRacingPrisma({ inspectedToken: tokenA, txActiveToken: tokenB });

      await expect(
        runMintStaffLink({ argv: [`--partner=${PARTNER_ID}`, "--revoke-existing"], prisma })
      ).rejects.toBeInstanceOf(MintUsageError);

      // Nothing revoked, nothing minted, no ledger row — the refusal is total.
      expect(txWritesOf(prisma)).toEqual([]);
    });

    it("names both the consented token and the one it actually found", async () => {
      const tokenA = { id: "token_A", issuedAt: new Date("2026-07-29T09:00:00.000Z") };
      const tokenB = { id: "token_B", issuedAt: new Date("2026-07-29T10:00:00.000Z") };
      const prisma = makeRacingPrisma({ inspectedToken: tokenA, txActiveToken: tokenB });

      // The operator has to be able to tell this apart from an ordinary refuse-on-live-link,
      // so both ids appear and the message says the link changed underneath them.
      await expect(
        runMintStaffLink({ argv: [`--partner=${PARTNER_ID}`, "--revoke-existing"], prisma })
      ).rejects.toThrow(/changed after this run inspected it[\s\S]*token_A[\s\S]*token_B/);
    });

    it("REFUSES when nothing was inspected but a token appeared before the lock", async () => {
      // `--revoke-existing` passed against no visible link is consent to revoke nothing.
      // A token that appears in the window is by definition uninspected, so it is not
      // covered by that consent even though the flag is set.
      const concurrent = { id: "token_concurrent", issuedAt: new Date("2026-07-29T09:00:00.000Z") };
      const prisma = makeRacingPrisma({ inspectedToken: null, txActiveToken: concurrent });

      await expect(
        runMintStaffLink({ argv: [`--partner=${PARTNER_ID}`, "--revoke-existing"], prisma })
      ).rejects.toThrow(/nothing \(no live link was present\)[\s\S]*token_concurrent/);
      expect(txWritesOf(prisma)).toEqual([]);
    });

    it("scopes the revoke to the inspected id AND the partner predicate when they agree", async () => {
      const tokenA = { id: "token_A", issuedAt: new Date("2026-07-29T09:00:00.000Z") };
      const prisma = makeRacingPrisma({ inspectedToken: tokenA, txActiveToken: tokenA });

      const result = await runMintStaffLink({
        argv: [`--partner=${PARTNER_ID}`, "--revoke-existing"],
        prisma,
      });

      const revoke = prisma.calls.find((call) => call.method === "catalogAccessToken.updateMany");
      // Both halves present: `id` is the swap, the other three are the KEWL-2480 blast-radius
      // guard. Dropping either one reintroduces a bug we already shipped once.
      expect(revoke.args.where).toEqual({
        id: "token_A",
        partnerId: PARTNER_ID,
        purpose: "staff_review",
        status: "active",
      });
      expect(revoke.args.data.revokedBy).toBe(MINT_ACTOR);
      expect(result.revokedPrevious).toBe(true);

      // Exactly one link exists after the tx: one revoked, one created.
      expect(prisma.calls.filter((call) => call.method === "catalogAccessToken.create")).toHaveLength(1);
    });
  });

  describe("without --revoke-existing", () => {
    it("refuses on a token that appeared after the inspection read, writing nothing", async () => {
      // Refuse-by-default has to survive the race too: the inspection saw nothing, so the
      // old pre-tx-read code would have minted a second live link alongside the concurrent
      // one. The locked read is what catches it.
      const concurrent = { id: "token_concurrent", issuedAt: new Date("2026-07-29T09:00:00.000Z") };
      const prisma = makeRacingPrisma({ inspectedToken: null, txActiveToken: concurrent });

      await expect(
        runMintStaffLink({ argv: [`--partner=${PARTNER_ID}`], prisma })
      ).rejects.toThrow(/token_concurrent[\s\S]*--revoke-existing/);
      expect(txWritesOf(prisma)).toEqual([]);
    });

    it("plans the write from the locked read, not the inspection read", async () => {
      // Inverse of the case above: the inspection saw a live token but it was revoked
      // concurrently, so by lock time there is none. Minting is correct — there is nothing
      // to strand — and it proves the decision is made from the tx read.
      const stale = { id: "token_stale", issuedAt: new Date("2026-07-29T08:00:00.000Z") };
      const prisma = makeRacingPrisma({ inspectedToken: stale, txActiveToken: null });

      const result = await runMintStaffLink({ argv: [`--partner=${PARTNER_ID}`], prisma });

      expect(result.id).toBe("token_new");
      expect(result.revokedPrevious).toBe(false);
      // Nothing was revoked: there was no live token at decision time.
      expect(prisma.calls.some((call) => call.method === "catalogAccessToken.updateMany")).toBe(false);
    });
  });
});
