/**
 * KEWL-2491 — INDEPENDENT cross-entry-point verification of the advisory-lock fix.
 *
 * Written against the acceptance criteria rather than against the implementation, and
 * deliberately different in kind from `scripts/mint-staff-link.lib.test.mjs`: that file
 * asserts the script's call record against an injected double, so the admin route's
 * participation in the lock is established by reading the source. This file imports the
 * REAL route handler and the REAL `runMintStaffLink` and runs them against ONE store, so
 * "all entry points participate in the same partner-scoped serialisation" is executable.
 *
 * The fake database models only what the bug turns on:
 *   1. READ COMMITTED — statements see what is committed when they run; a transaction gives
 *      no snapshot and takes no table lock. This is why `$transaction` alone fixed nothing.
 *   2. `pg_advisory_xact_lock` as a real per-key mutex, released on commit AND rollback.
 *   3. Rollback that undoes only the transaction's OWN writes (a journal, not a table
 *      snapshot) — a snapshot restore would resurrect rows a concurrent transaction had
 *      committed and manufacture the anomaly we are testing for.
 *
 * Interleaving is injected at named points rather than raced, so results are deterministic.
 * `lockEnabled: false` reruns the identical interleaving with the mutex removed; those cases
 * assert the anomaly REAPPEARS, which is what shows the lock is the thing doing the work.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF_LINK_MINT_LOCK_NAMESPACE, staffLinkMintLockKey } from "./staffLinkMintLock";

const PARTNER_ID = "partner_qa_0001";
const ADMIN = "admin@test.dev";
const LOCK_SQL = "SELECT pg_advisory_xact_lock($1::int, $2::int)";

let db: FakeDb;

const getServerSessionMock = vi.hoisted(() => vi.fn());
const ensureFieldRulesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    { get: (_t, prop: string) => (db as unknown as Record<string, unknown>)[prop] }
  ),
}));
vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@/domain/auth/config", () => ({ authOptions: {} }));
vi.mock("@/domain/myco/staffReviewService", () => ({ ensureFieldRules: ensureFieldRulesMock }));

import { POST as adminMint } from "@/app/api/admin/myco/staff-links/route";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- plain .mjs library; the CLI cannot be imported, only this lib.
import { runMintStaffLink } from "../../../scripts/mint-staff-link.lib.mjs";

type TokenRow = Record<string, unknown> & { id: string; status: string };
type Where = Record<string, unknown>;

function makeMutex() {
  const tails = new Map<string, Promise<void>>();
  return async function lock(key: string): Promise<() => void> {
    let release!: () => void;
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prior = tails.get(key) ?? Promise.resolve();
    tails.set(key, prior.then(() => mine));
    await prior;
    return release;
  };
}

function matches(row: TokenRow, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value !== null && typeof value === "object") {
      throw new Error(`fake db: unsupported filter on ${key}: ${JSON.stringify(value)}`);
    }
    return row[key] === value;
  });
}

type Hooks = {
  /** After the script's pre-transaction "inspected" read — the operator's snapshot. */
  afterInspectionRead?: () => void | Promise<void>;
  /** After a transaction's locked read, before it decides or writes. */
  afterLockedRead?: () => void | Promise<void>;
};

type FakeDb = ReturnType<typeof makeFakeDb>;

function makeFakeDb({ lockEnabled = true }: { lockEnabled?: boolean } = {}) {
  const tokens: TokenRow[] = [];
  const rawSql: Array<{ sql: string; args: unknown[] }> = [];
  const revokeWheres: Where[] = [];
  const lock = makeMutex();
  const hooks: Hooks = {};
  let idSeq = 0;

  const partnerAndRoster = {
    partner: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === PARTNER_ID ? { id: PARTNER_ID, name: "QA Partner" } : null,
      findMany: async ({ take }: { take?: number }) =>
        [{ id: PARTNER_ID, name: "QA Partner" }].slice(0, take ?? 1),
    },
    mycoEmployee: {
      findMany: async () => [
        { id: "e1", name: "Adrienne", email: "adrienne@x.internal", pinHash: null, pinSetAt: null },
      ],
    },
  };

  function seedToken(overrides: Partial<TokenRow> = {}): TokenRow {
    idSeq += 1;
    const row = {
      id: `tok_${idSeq}`,
      issuedAt: new Date("2026-07-28T18:00:00.000Z"),
      purpose: "staff_review",
      partnerId: PARTNER_ID,
      status: "active",
      issuedToId: null,
      issuedBy: "seed",
      ...overrides,
    } as TokenRow;
    tokens.push(row);
    return row;
  }

  /** Outer (non-transaction) reads. The script's "inspected" read lands here. */
  const outerTokenModel = {
    findFirst: async ({ where }: { where: Where }) => {
      const found = tokens.find((row) => matches(row, where)) ?? null;
      await hooks.afterInspectionRead?.();
      return found;
    },
    findMany: async ({ where }: { where: Where }) => tokens.filter((row) => matches(row, where)),
  };

  async function $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const releases: Array<() => void> = [];
    const undo: Array<() => void> = [];

    const tx = {
      ...partnerAndRoster,
      $executeRawUnsafe: async (sql: string, ...args: unknown[]) => {
        rawSql.push({ sql, args });
        if (sql !== LOCK_SQL) throw new Error(`fake db: unexpected raw SQL: ${sql}`);
        if (lockEnabled) releases.push(await lock(`${args[0]}:${args[1]}`));
        return 1;
      },
      catalogAccessToken: {
        findFirst: async ({ where }: { where: Where }) => {
          const found = tokens.find((row) => matches(row, where)) ?? null;
          await hooks.afterLockedRead?.();
          return found;
        },
        findMany: async ({ where }: { where: Where }) => tokens.filter((row) => matches(row, where)),
        updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
          revokeWheres.push(where);
          const hits = tokens.filter((row) => matches(row, where));
          for (const row of hits) {
            const before = { ...row };
            undo.push(() => {
              for (const key of Object.keys(row)) delete row[key];
              Object.assign(row, before);
            });
            Object.assign(row, data);
          }
          return { count: hits.length };
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          idSeq += 1;
          const row = {
            id: `tok_${idSeq}`,
            issuedAt: new Date("2026-07-29T00:00:00.000Z"),
            ...data,
          } as unknown as TokenRow;
          tokens.push(row);
          undo.push(() => {
            const at = tokens.indexOf(row);
            if (at >= 0) tokens.splice(at, 1);
          });
          return row;
        },
      },
      reviewerEnrollmentEvent: { create: async () => ({ id: "event" }) },
    };

    try {
      return await fn(tx);
    } catch (error) {
      for (const step of undo.reverse()) step();
      throw error;
    } finally {
      for (const release of releases) release();
    }
  }

  return {
    ...partnerAndRoster,
    catalogAccessToken: outerTokenModel,
    $transaction,
    hooks,
    seedToken,
    activeStaffLinks: () =>
      tokens.filter(
        (row) =>
          row.purpose === "staff_review" && row.partnerId === PARTNER_ID && row.status === "active"
      ),
    tokens,
    rawSql,
    revokeWheres,
  };
}

function useDb(options?: { lockEnabled?: boolean }) {
  db = makeFakeDb(options);
  return db;
}

function adminRequest() {
  return new Request("http://localhost:3000/api/admin/myco/staff-links", {
    method: "POST",
    body: JSON.stringify({ partnerId: PARTNER_ID }),
  }) as never;
}

function scriptMint(extraArgv: string[] = []) {
  return (runMintStaffLink as (o: unknown) => Promise<unknown>)({
    argv: [`--partner=${PARTNER_ID}`, ...extraArgv],
    prisma: db,
  });
}

function settle<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error: error as Error })
  );
}

/** Enough turns for a not-yet-awaited mint to reach its lock and block there. */
async function letPendingWorkAdvance() {
  for (let turn = 0; turn < 10; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSessionMock.mockResolvedValue({ user: { email: ADMIN } });
  ensureFieldRulesMock.mockResolvedValue([]);
});

describe("KEWL-2491 — both real entry points take the same partner-scoped lock", () => {
  it("the admin route takes it, keyed to the partner, before it supersedes anything", async () => {
    useDb();

    await adminMint(adminRequest());

    expect(db.rawSql).toHaveLength(1);
    expect(db.rawSql[0].sql).toContain("pg_advisory_xact_lock");
    expect(db.rawSql[0].args).toEqual([
      STAFF_LINK_MINT_LOCK_NAMESPACE,
      staffLinkMintLockKey(PARTNER_ID),
    ]);
    expect(db.activeStaffLinks()).toHaveLength(1);
  });

  it("the CLI script takes the identical key — the same mutex, not a parallel one", async () => {
    useDb();

    await scriptMint();

    expect(db.rawSql).toHaveLength(1);
    expect(db.rawSql[0].args).toEqual([
      STAFF_LINK_MINT_LOCK_NAMESPACE,
      staffLinkMintLockKey(PARTNER_ID),
    ]);
  });
});

describe("KEWL-2491 — interleaving cannot leave two active links", () => {
  it("makes a concurrent admin mint wait for the script's transaction", async () => {
    useDb();
    let adminDone: Promise<unknown> | undefined;
    let tokensWhileScriptHeldLock = -1;

    // Worst moment: the script has done its locked read (decision made) but written nothing.
    db.hooks.afterLockedRead = async () => {
      adminDone = adminMint(adminRequest());
      await letPendingWorkAdvance();
      tokensWhileScriptHeldLock = db.tokens.length;
    };

    await scriptMint();
    await adminDone;

    // The route reached its lock and stopped: nothing written inside the script's window.
    expect(tokensWhileScriptHeldLock).toBe(0);
    expect(db.tokens).toHaveLength(2);
    expect(db.activeStaffLinks()).toHaveLength(1);
  });

  it("WITHOUT the lock the same interleaving yields two live links — the lock is load-bearing", async () => {
    useDb({ lockEnabled: false });

    db.hooks.afterLockedRead = async () => {
      db.hooks.afterLockedRead = undefined; // the route reads too; do not recurse
      await adminMint(adminRequest());
    };

    await settle(scriptMint());

    // Two live links for one partner: whichever URL the operator hands out, the other also
    // works. This is the review thread's first failure mode, still present post-`b784f26`.
    expect(db.activeStaffLinks()).toHaveLength(2);
  });
});

describe("KEWL-2491 — the script never revokes a link the operator did not inspect", () => {
  it("refuses when the inspected token was replaced between inspection and the lock", async () => {
    // The operator inspected A and passed --revoke-existing. The admin route then revoked A
    // and minted B. B must survive: nobody inspected it, and someone may already hold it.
    const store = useDb();
    const tokenA = store.seedToken();

    store.hooks.afterInspectionRead = async () => {
      store.hooks.afterInspectionRead = undefined;
      await adminMint(adminRequest()); // revokes A, mints B, commits
    };

    const outcome = await settle(scriptMint(["--revoke-existing"]));

    const tokenB = db.tokens.find((row) => row.id !== tokenA.id && row.issuedBy === ADMIN);
    expect(tokenB).toBeDefined();

    expect(outcome.ok).toBe(false);
    // B is untouched and still the one live link.
    expect(db.activeStaffLinks()).toHaveLength(1);
    expect(db.activeStaffLinks()[0].id).toBe(tokenB!.id);
    expect(tokenB!.status).toBe("active");
    // No revoke this script issued may name B.
    expect(db.revokeWheres.every((where) => where.id !== tokenB!.id)).toBe(true);
  });

  it("refuses to mint beside a link that appeared when nothing was inspected", async () => {
    // Nothing live at inspection time, so no --revoke-existing was warranted; a link appears
    // before the lock. Minting anyway is how two live links happen.
    const store = useDb();

    store.hooks.afterInspectionRead = async () => {
      store.hooks.afterInspectionRead = undefined;
      await adminMint(adminRequest());
    };

    const outcome = await settle(scriptMint());

    expect(outcome.ok).toBe(false);
    expect(db.activeStaffLinks()).toHaveLength(1);
    expect(db.activeStaffLinks()[0].issuedBy).toBe(ADMIN);
  });

  it("still replaces the inspected token on the ordinary uncontended path", async () => {
    // Guards the guard: the CAS must not have made the normal --revoke-existing path refuse.
    const store = useDb();
    const tokenA = store.seedToken();

    const outcome = await settle(scriptMint(["--revoke-existing"]));

    expect(outcome.ok).toBe(true);
    expect(tokenA.status).toBe("revoked");
    expect(db.activeStaffLinks()).toHaveLength(1);
    expect(db.activeStaffLinks()[0].id).not.toBe(tokenA.id);
    // And the revoke named A specifically, not "whatever is active".
    expect(db.revokeWheres.some((where) => where.id === tokenA.id)).toBe(true);
  });
});
