/**
 * KEWL-2379 — mint the ONE shared staff review link for a partner.
 *
 * Jon's 2026-07-28 override: a single link for the whole roster, and everyone picks their
 * PIN the first time they open it. The raw token is printed once; only its SHA-256 hash is
 * stored, so it cannot be recovered later.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS SCRIPT CAN DESTROY A LIVE LINK. READ BEFORE RUNNING.
 *
 *   --partner=<name|id>   REQUIRED. There is no default partner. It used to resolve
 *                         "The Mushroom Top" implicitly, which meant any run — including
 *                         one pasted out of this header to try the command — pointed at
 *                         the live pilot (KEWL-2480). Partner names are not unique, so if
 *                         the value matches more than one partner the script REFUSES,
 *                         prints the matches, and asks you to re-run with the id — it does
 *                         not pick one for you (KEWL-2486).
 *
 *   --revoke-existing     DANGEROUS. Revokes the partner's current active staff-review
 *                         link before minting the replacement. Everyone holding the old
 *                         URL is locked out immediately, and it cannot be reprinted
 *                         because only its hash is stored. WITHOUT this flag the script
 *                         REFUSES to mint when a live link exists, and prints that link's
 *                         id and issuedAt so you can decide deliberately.
 *
 *   --force               DANGEROUS, and unrelated to the flag above. It overrides ONLY
 *                         the pre-ship PIN assertion: minting an enrollable link while a
 *                         roster reviewer already holds a PIN means that person can never
 *                         claim their own name (enrollment is compare-and-set on
 *                         `pinHash IS NULL`). --force ships it anyway and locks them out.
 *                         Use it only when the lockout is intended and understood — the
 *                         normal fix is the admin reset-all action, which logs the clear.
 *                         --force does NOT permit the revoke.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Run it through vite-node, NOT bare node:
 *
 *   node --env-file=.env.local node_modules/vite-node/vite-node.mjs \
 *     scripts/mint-staff-link.mjs -- --partner="<name|id>" [baseUrl] [--hours=72] \
 *     [--revoke-existing] [--force]
 *
 * The `--` before the script's own arguments is required; vite-node consumes everything
 * before it.
 *
 * Bare `node` cannot load this: it reaches `reviewerEnrollment.ts`, whose own relative
 * imports are extensionless (project-wide `moduleResolution: "bundler"` convention), and
 * Node's ESM resolver will not add `.ts`. vite-node applies the project resolver. See
 * CLAUDE.md rules 2 / 2b.
 *
 * The parsing, guards and transaction live in `mint-staff-link.lib.mjs` so they can be
 * unit-tested without a database — see `mint-staff-link.lib.test.mjs`.
 */
import { PrismaClient } from "@prisma/client";
import { MintUsageError, runMintStaffLink } from "./mint-staff-link.lib.mjs";

const prisma = new PrismaClient();

try {
  const result = await runMintStaffLink({
    argv: process.argv.slice(2),
    prisma,
    log: (event) => {
      if (event.kind !== "roster") return;
      // Hand-off evidence Jon asked for by name: every reviewer, correctly named, PIN state shown.
      console.log(`\nRoster at mint time (${event.partner.name}):`);
      console.table(
        event.reviewers.map((reviewer) => ({
          name: reviewer.name,
          email: reviewer.email,
          pinHashIsNull: reviewer.pinHash === null,
          pinSetAt: reviewer.pinSetAt?.toISOString() ?? null,
        }))
      );
    },
    warn: (event) => {
      if (event.kind !== "pin-assertion") return;
      console.error("\n*** PRE-SHIP ASSERTION FAILED ***");
      for (const warning of event.warnings) console.error(`  - ${warning}`);
      if (event.overridden) console.error("\n--force given: minting anyway.\n");
    },
  });
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
} catch (error) {
  await prisma.$disconnect();
  if (error instanceof MintUsageError) {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
