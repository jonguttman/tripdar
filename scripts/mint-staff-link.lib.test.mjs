/**
 * KEWL-2480 — pins the blast radius of `scripts/mint-staff-link.mjs`.
 *
 * The bug these cover: the script hardcoded `name: "The Mushroom Top"` and revoked EVERY
 * active staff-review token for that partner before minting, with no partner argument at
 * all. The third case below — asserting the revoke `where` object carries the partner id
 * that was actually passed in — is the one that would have caught it.
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
function makePrisma({ partner = { id: PARTNER_ID, name: "QA Partner" }, reviewers, activeToken = null } = {}) {
  const calls = [];
  const record = (method, args) => calls.push({ method, args });

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
      findFirst: async (args) => {
        record("partner.findFirst", args);
        return partner;
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
