/**
 * KEWL-2467 — strict prisma test doubles.
 *
 * Route tests hand-roll their prisma mock as an object literal. When production code
 * starts calling a method the literal does not stub, the access returns `undefined`,
 * calling it throws `undefined is not a function`, and a route's catch-all turns that
 * into a 500 — which error-path tests happily assert on. That is exactly how PR #28's
 * `findUnique` -> `findFirst` switch left four tests green against a code path they
 * never reached (repaired in KEWL-2462).
 *
 * The fix has two halves, and BOTH are needed:
 *
 *  1. `createPrismaMock` wraps the literal in a Proxy that throws
 *     `prisma.<model>.<method> is not stubbed in this test` on any un-stubbed access.
 *     This aborts the wrong code path immediately and names the missing stub.
 *
 *  2. Every miss is also recorded here, and the global setup file (`src/test/setup.ts`)
 *     fails the test in `afterEach` if anything was recorded. Half 1 on its own is not
 *     enough: a route's `catch` block catches the thrown Error like any other and
 *     returns 500, so a test that legitimately asserts on a 500 error path would still
 *     pass while the message went only to stderr. The recorder is what makes a missing
 *     stub fail as itself no matter what swallowed it.
 */

/**
 * Properties that must never throw: the language, the test runner, and the error
 * reporter all probe objects speculatively. `then` is the important one — awaiting or
 * resolving anything that touches the mock reads `.then` to check for a thenable, and a
 * throw there turns a clean failure into an unrelated one.
 */
const SPECULATIVE_PROBES = new Set<string>([
  "then",
  "catch",
  "finally",
  "toJSON",
  "toString",
  "valueOf",
  "constructor",
  "inspect",
  "asymmetricMatch",
  "nodeType",
  "$$typeof",
  "_isMockFunction",
  "tagName",
  "hasAttribute",
]);

/** Un-stubbed accesses seen since the last drain. Read by `src/test/setup.ts`. */
let unstubbedAccesses: string[] = [];

/** Return everything recorded since the last drain, and clear it. */
export function drainUnstubbedPrismaAccesses(): string[] {
  const drained = unstubbedAccesses;
  unstubbedAccesses = [];
  return drained;
}

function unstubbedMessage(path: string): string {
  return (
    `${path} is not stubbed in this test. ` +
    `Add it to the mock, or fix the code under test if it should not be calling it.`
  );
}

function isStubGroup(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

function strict<T extends object>(target: T, path: string): T {
  // Cache per group so `prisma.model` returns a stable reference across accesses (code
  // that captures `prisma.model` once must see the same object as code that re-reads it).
  const wrapped = new Map<string, unknown>();

  return new Proxy(target, {
    get(obj, prop, receiver) {
      if (typeof prop === "symbol") return Reflect.get(obj, prop, receiver);
      if (Reflect.has(obj, prop)) {
        const value = Reflect.get(obj, prop, receiver);
        if (!isStubGroup(value)) return value;
        if (!wrapped.has(prop)) wrapped.set(prop, strict(value, `${path}.${prop}`));
        return wrapped.get(prop);
      }
      if (SPECULATIVE_PROBES.has(prop)) return undefined;

      const fullPath = `${path}.${prop}`;
      unstubbedAccesses.push(fullPath);
      throw new Error(unstubbedMessage(fullPath));
    },
  });
}

/**
 * Wrap a hand-rolled prisma mock so un-stubbed model/method access throws by name and is
 * reported even if the code under test swallows the throw.
 *
 * Nested plain objects are wrapped recursively, so both `prisma.unknownModel` and
 * `prisma.knownModel.unknownMethod` fail loudly. Functions (`vi.fn()`, `$transaction`)
 * and anything already stubbed pass straight through, so `expect(mock.model.method)`
 * assertions keep working against the original literal.
 *
 * Usage — the wrap has to happen inside the `vi.mock` factory rather than in
 * `vi.hoisted`, because `vi.hoisted` bodies run before this module's import is
 * evaluated:
 *
 * ```ts
 * const prismaMock = vi.hoisted(() => ({ myModel: { findFirst: vi.fn() } }));
 *
 * vi.mock("@/lib/prisma", async () => {
 *   const { createPrismaMock } = await import("@/test/prismaMock");
 *   return { prisma: createPrismaMock(prismaMock) };
 * });
 * ```
 *
 * Assertions still target `prismaMock` (the raw literal); only the code under test sees
 * the strict view.
 *
 * @param stubs the hand-rolled mock literal
 * @param name root label used in the error message (defaults to `prisma`); pass e.g.
 *   `"tx"` when wrapping an interactive-transaction client so the path reads `tx.model.method`
 */
export function createPrismaMock<T extends object>(stubs: T, name = "prisma"): T {
  return strict(stubs, name);
}
