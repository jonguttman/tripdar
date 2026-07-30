/**
 * KEWL-2491 — the admin mint route's half of the cross-entry-point invariant.
 *
 * `scripts/mint-staff-link.lib.mjs` and this route both mint a partner's shared
 * `staff_review` link. The script's own tests prove IT takes the advisory lock; they
 * cannot prove the route does, and a lock only one writer takes is not a lock. That gap is
 * exactly the shape of the original bug — two entry points, one invariant, enforced in one
 * place — so it gets its own test here rather than being assumed.
 *
 * The second thing pinned below is the deliberate ASYMMETRY: this route does NOT
 * compare-and-swap its revoke, and must not start. Its documented contract is an
 * unconditional supersede-all so a forwarded old link stops working the moment a new one
 * is minted. It is an authenticated admin action with no "token the operator inspected"
 * premise, so there is nothing to compare against — adding a CAS here would let a
 * forwarded link survive a mint. Only the script's `--revoke-existing` carries that
 * premise. Sharing the lock is the whole of what these two entry points share.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  STAFF_LINK_MINT_LOCK_NAMESPACE,
  staffLinkMintLockKey,
} from "@/domain/myco/staffLinkMintLock";

const PARTNER_ID = "partner_qa_0001";
const OTHER_PARTNER_ID = "partner_tmt_live";
const ADMIN_EMAIL = "admin@x.internal";

const prismaMock = vi.hoisted(() => ({
  partner: { findUnique: vi.fn() },
  mycoEmployee: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));

const getServerSessionMock = vi.hoisted(() => vi.fn());
const ensureFieldRulesMock = vi.hoisted(() => vi.fn());

// Strict view (KEWL-2467): the route sees a Proxy that throws by name on any un-stubbed
// prisma access, so a missing stub fails as itself instead of as a catch-all 500.
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock(prismaMock) };
});

vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@/domain/auth/config", () => ({ authOptions: {} }));
vi.mock("@/domain/myco/staffReviewService", () => ({ ensureFieldRules: ensureFieldRulesMock }));

/** Everything the route's transaction callback touches, with every call recorded in order. */
function makeTxRecorder() {
  const calls: { method: string; args: unknown[] }[] = [];
  const record = (method: string, args: unknown[]) => calls.push({ method, args });

  const tx = {
    $executeRawUnsafe: vi.fn(async (...args: unknown[]) => {
      record("$executeRawUnsafe", args);
      return 1;
    }),
    catalogAccessToken: {
      updateMany: vi.fn(async (...args: unknown[]) => {
        record("catalogAccessToken.updateMany", args);
        return { count: 1 };
      }),
      create: vi.fn(async (...args: unknown[]) => {
        record("catalogAccessToken.create", args);
        const data = (args[0] as { data: Record<string, unknown> }).data;
        return {
          id: "token_new",
          issuedAt: new Date("2026-07-29T00:00:00.000Z"),
          expiresAt: data.expiresAt ?? null,
          enrollmentClosesAt: data.enrollmentClosesAt,
        };
      }),
    },
    reviewerEnrollmentEvent: {
      create: vi.fn(async (...args: unknown[]) => {
        record("reviewerEnrollmentEvent.create", args);
        return { id: "event_new" };
      }),
    },
  };

  return { tx, calls };
}

let POST: typeof import("./route").POST;
let recorder: ReturnType<typeof makeTxRecorder>;

beforeEach(async () => {
  vi.clearAllMocks();
  recorder = makeTxRecorder();

  getServerSessionMock.mockResolvedValue({ user: { email: ADMIN_EMAIL } });
  ensureFieldRulesMock.mockResolvedValue([]);
  prismaMock.partner.findUnique.mockResolvedValue({ id: PARTNER_ID });
  prismaMock.mycoEmployee.findMany.mockResolvedValue([
    { id: "e1", name: "Adrienne", email: "adrienne@x.internal", pinHash: null, pinSetAt: null },
  ]);
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => fn(recorder.tx)
  );

  ({ POST } = await import("./route"));
});

function mintRequest(body: Record<string, unknown> = { partnerId: PARTNER_ID }) {
  return new Request("http://localhost:3000/api/admin/myco/staff-links", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

describe("POST /api/admin/myco/staff-links — KEWL-2491 shared mint lock", () => {
  it("takes the advisory lock inside the transaction, before it supersedes anything", async () => {
    const response = await POST(mintRequest());
    expect(response.status).toBe(200);

    const sequence = recorder.calls.map((call) => call.method);
    // Ordering is the requirement, not mere presence: locking after the supersede leaves
    // the window open for a concurrent script mint to interleave.
    expect(sequence[0]).toBe("$executeRawUnsafe");
    expect(sequence.indexOf("$executeRawUnsafe")).toBeLessThan(
      sequence.indexOf("catalogAccessToken.updateMany")
    );
    expect(sequence.indexOf("$executeRawUnsafe")).toBeLessThan(
      sequence.indexOf("catalogAccessToken.create")
    );
  });

  it("locks the SAME key the mint script derives for that partner", async () => {
    await POST(mintRequest());

    const [sql, namespace, key] = recorder.calls.find(
      (call) => call.method === "$executeRawUnsafe"
    )!.args;
    expect(sql).toBe("SELECT pg_advisory_xact_lock($1::int, $2::int)");
    expect(namespace).toBe(STAFF_LINK_MINT_LOCK_NAMESPACE);
    // If this key ever diverged from the script's, both entry points would still look
    // locked while blocking nobody — the failure mode this whole ticket exists to prevent.
    expect(key).toBe(staffLinkMintLockKey(PARTNER_ID, "staff_review"));
    expect(key).not.toBe(staffLinkMintLockKey(OTHER_PARTNER_ID, "staff_review"));
  });

  it("locks the requested partner, not a hardcoded one", async () => {
    prismaMock.partner.findUnique.mockResolvedValue({ id: OTHER_PARTNER_ID });

    await POST(mintRequest({ partnerId: OTHER_PARTNER_ID }));

    const lock = recorder.calls.find((call) => call.method === "$executeRawUnsafe")!;
    expect(lock.args[2]).toBe(staffLinkMintLockKey(OTHER_PARTNER_ID, "staff_review"));
  });

  it("keeps the supersede unconditional — no compare-and-swap on this path", async () => {
    await POST(mintRequest());

    const supersede = recorder.calls.find(
      (call) => call.method === "catalogAccessToken.updateMany"
    )!;
    const where = (supersede.args[0] as { where: Record<string, unknown> }).where;
    // Deliberate asymmetry with the script. An `id` predicate here would mean a link
    // forwarded to someone outside the roster could survive a re-mint — the exact thing
    // the supersede-all exists to prevent. The partner scope must still be present.
    expect(where).toEqual({ purpose: "staff_review", partnerId: PARTNER_ID, status: "active" });
    expect(where.id).toBeUndefined();
  });

  it("does not lock when the mint refuses before its transaction", async () => {
    // No partner, no transaction, no lock — a lock taken on a request that never mints
    // would block real mints for nothing.
    prismaMock.partner.findUnique.mockResolvedValue(null);

    const response = await POST(mintRequest({ partnerId: "nope" }));

    expect(response.status).toBe(404);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(recorder.tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated mint without locking", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const response = await POST(mintRequest());

    expect(response.status).toBe(401);
    expect(recorder.tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
