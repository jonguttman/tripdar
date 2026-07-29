/**
 * KEWL-2467 — global vitest setup.
 *
 * Fails any test in which the code under test reached for a prisma model/method the test
 * did not stub. `createPrismaMock` already throws at the point of access, but a route's
 * catch-all will catch that Error like any other and return 500 — so on its own the throw
 * is invisible to a test asserting on an error status. This hook is what turns a missing
 * stub into a failure of its own, regardless of what swallowed it.
 *
 * See `src/test/prismaMock.ts` for the full failure mode.
 */

import { afterEach, beforeEach } from "vitest";

import { drainUnstubbedPrismaAccesses } from "./prismaMock";

// Clear anything left over from module-load-time access so a test is only ever blamed
// for misses it actually caused.
beforeEach(() => {
  drainUnstubbedPrismaAccesses();
});

afterEach(() => {
  const misses = drainUnstubbedPrismaAccesses();
  if (misses.length === 0) return;

  const unique = [...new Set(misses)];
  throw new Error(
    `Un-stubbed prisma access during this test:\n` +
      unique.map((path) => `  - ${path}`).join("\n") +
      `\n\nThe code under test called a prisma method the mock does not stub. If the ` +
      `test appeared to pass on a status code, it was asserting on an error path it was ` +
      `never meant to reach (KEWL-2467). Add the stub, or fix the code under test.`
  );
});
