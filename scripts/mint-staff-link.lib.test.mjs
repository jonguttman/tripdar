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
      fn({ catalogAccessToken: tokenModel, reviewerEnrollmentEvent: prisma.reviewerEnrollmentEvent }),
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
    expect(planTokenAction({ activeToken, revokeExisting: true }).action).toBe("revoke-then-mint");
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
    expect(revoke.args.where).toEqual({
      purpose: "staff_review",
      partnerId: PARTNER_ID,
      status: "active",
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
 * KEWL-2491 — the active-token read must happen inside the transaction, not before it.
 *
 * The race: a concurrent admin-route mint can land between the pre-tx `findFirst` and the
 * tx's `updateMany`/`create`. If the script saw no token it would mint alongside the admin's
 * newly created one, leaving two active links for the same partner. If it saw the old token
 * with `--revoke-existing`, its unconditional `updateMany` would revoke the admin's new
 * token that the operator never inspected.
 *
 * The fix: move `findFirst` + `planTokenAction` + refuse inside `$transaction`. With
 * SQLite/Turso's single-writer serialisation, the tx holds the write lock for the entire
 * read-decide-revoke-mint sequence, making it atomic.
 *
 * These tests use a split mock: the outer `catalogAccessToken` has no `findFirst` (calling
 * it throws — catching any regression to the pre-tx read), while the tx layer returns the
 * value the DB would contain after a concurrent mint.
 */
describe("mint-staff-link — KEWL-2491: active-token read is inside the transaction", () => {
  /** Builds a prisma double where the outer catalogAccessToken.findFirst is forbidden,
   * but the tx layer's findFirst returns `txActiveToken`. */
  function makeSplitPrisma({ txActiveToken = null } = {}) {
    const calls = [];
    const record = (layer, method, args) => calls.push({ layer, method, args });

    const txTokenModel = {
      findFirst: async (args) => {
        record("tx", "catalogAccessToken.findFirst", args);
        return txActiveToken;
      },
      updateMany: async (args) => {
        record("tx", "catalogAccessToken.updateMany", args);
        return { count: 1 };
      },
      create: async (args) => {
        record("tx", "catalogAccessToken.create", args);
        return { id: "token_new", issuedAt: new Date("2026-07-29T00:00:00.000Z"), enrollmentClosesAt: args.data.enrollmentClosesAt };
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
          return [{ id: "e1", name: "Adrienne", email: "adrienne@x.internal", pinHash: null, pinSetAt: null }];
        },
      },
      catalogAccessToken: {
        // Intentionally absent: if the implementation calls outer findFirst, this throws and
        // fails the test. All token reads must go through the tx layer.
        findFirst: () => { throw new Error("catalogAccessToken.findFirst must not be called outside the transaction"); },
      },
      reviewerEnrollmentEvent: {
        create: async (args) => {
          record("tx", "reviewerEnrollmentEvent.create", args);
          return { id: "event_new" };
        },
      },
      $transaction: async (fn) =>
        fn({ catalogAccessToken: txTokenModel, reviewerEnrollmentEvent: { create: prisma.reviewerEnrollmentEvent.create } }),
    };
    return prisma;
  }

  it("reads the active token inside the tx, not outside it", async () => {
    const prisma = makeSplitPrisma({ txActiveToken: null });
    // Should succeed (no active token in tx) and NOT call the forbidden outer findFirst.
    const result = await runMintStaffLink({ argv: [`--partner=${PARTNER_ID}`], prisma });
    expect(result.id).toBe("token_new");
    const txRead = prisma.calls.filter((c) => c.layer === "tx" && c.method === "catalogAccessToken.findFirst");
    expect(txRead).toHaveLength(1);
  });

  it("refuses without writing when a concurrent mint lands before the tx runs", async () => {
    // Simulates: script is called with no active token visible to an outer read (old code
    // would proceed), but by the time the tx executes, a concurrent admin-route mint has
    // already created a token. New code: tx sees the token and refuses (no --revoke-existing).
    const concurrent = { id: "token_concurrent", issuedAt: new Date("2026-07-29T09:00:00.000Z") };
    const prisma = makeSplitPrisma({ txActiveToken: concurrent });

    await expect(runMintStaffLink({ argv: [`--partner=${PARTNER_ID}`], prisma }))
      .rejects.toBeInstanceOf(MintUsageError);

    // The refuse message must name the concurrent token so the operator knows what to inspect.
    await expect(runMintStaffLink({ argv: [`--partner=${PARTNER_ID}`], prisma }))
      .rejects.toThrow(/token_concurrent/);

    // No writes despite the outer layer seeing "nothing" (which old code would have minted on).
    const txWrites = prisma.calls.filter((c) => c.layer === "tx" && (c.method === "catalogAccessToken.create" || c.method === "catalogAccessToken.updateMany"));
    expect(txWrites).toHaveLength(0);
  });

  it("with --revoke-existing, revokes what the tx actually sees at execution time", async () => {
    // Simulates: operator saw old token A and passed --revoke-existing. A concurrent mint
    // replaced A with B before the tx ran. New code: tx sees B, revokes B, mints C.
    // This is consistent: only one active token exits the tx. The WHERE is still scoped to
    // the correct partner (not a cross-partner write).
    const tokenB = { id: "token_B", issuedAt: new Date("2026-07-29T10:00:00.000Z") };
    const prisma = makeSplitPrisma({ txActiveToken: tokenB });

    const result = await runMintStaffLink({
      argv: [`--partner=${PARTNER_ID}`, "--revoke-existing"],
      prisma,
    });

    expect(result.revokedPrevious).toBe(true);
    const revoke = prisma.calls.find((c) => c.method === "catalogAccessToken.updateMany");
    expect(revoke).toBeDefined();
    expect(revoke.args.where.partnerId).toBe(PARTNER_ID);
    expect(revoke.args.where.purpose).toBe("staff_review");
    expect(revoke.args.where.status).toBe("active");
    // One token was minted: exactly one active link after the tx.
    const created = prisma.calls.filter((c) => c.method === "catalogAccessToken.create");
    expect(created).toHaveLength(1);
  });
});
