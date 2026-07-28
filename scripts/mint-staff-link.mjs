/**
 * KEWL-2379 — mint the ONE shared staff review link.
 *
 * Jon's 2026-07-28 override: a single link for the whole roster, and everyone picks their
 * PIN the first time they open it. The raw token is printed once; only its SHA-256 hash is
 * stored, so it cannot be recovered later.
 *
 * Minting supersedes every live staff link for the partner — including the per-reviewer
 * links minted earlier the same day — so exactly one link is valid afterwards.
 *
 * REFUSES TO MINT if any roster reviewer already holds a PIN. Enrollment is compare-and-set
 * on `pinHash IS NULL`, so that person could never claim their own name on the new link;
 * shipping it anyway would silently lock them out. Clear the PINs through the admin
 * reset-all action (which logs the clear) and re-run. `--force` overrides for the case
 * where the lockout is intended and understood.
 *
 * Usage: node --env-file=.env.local scripts/mint-staff-link.mjs [baseUrl] [--force] [--hours=72]
 */
import { PrismaClient } from "@prisma/client";
import { createCatalogAccessToken, hashCatalogAccessToken } from "../src/domain/myco/catalogTokens.ts";
import {
  DEFAULT_ENROLLMENT_HOURS,
  enrollmentClosesAtFrom,
  preMintPinWarnings,
} from "../src/domain/myco/reviewerEnrollment.ts";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const base = args.find((arg) => !arg.startsWith("--")) ?? "http://localhost:3000";
const force = args.includes("--force");
const hoursArg = args.find((arg) => arg.startsWith("--hours="));
const hours = hoursArg ? Number(hoursArg.split("=")[1]) : DEFAULT_ENROLLMENT_HOURS;

const partner = await prisma.partner.findFirst({ where: { name: "The Mushroom Top" } });
if (!partner) throw new Error("Partner 'The Mushroom Top' not found");

const reviewers = await prisma.mycoEmployee.findMany({
  where: { partnerId: partner.id, active: true, optedOut: false },
  orderBy: { name: "asc" },
  select: { id: true, name: true, email: true, pinHash: true, pinSetAt: true },
});
if (reviewers.length === 0) throw new Error("No active reviewers found");

// Hand-off evidence Jon asked for by name: every reviewer, correctly named, PIN state shown.
console.log("\nRoster at mint time:");
console.table(
  reviewers.map((reviewer) => ({
    name: reviewer.name,
    email: reviewer.email,
    pinHashIsNull: reviewer.pinHash === null,
    pinSetAt: reviewer.pinSetAt?.toISOString() ?? null,
  }))
);

const warnings = preMintPinWarnings(reviewers);
if (warnings.length > 0) {
  console.error("\n*** PRE-SHIP ASSERTION FAILED ***");
  for (const warning of warnings) console.error(`  - ${warning}`);
  if (!force) {
    console.error("\nReset those PINs (admin reset-all, which logs it) and re-run. --force to override.\n");
    await prisma.$disconnect();
    process.exit(1);
  }
  console.error("\n--force given: minting anyway.\n");
}

const enrollmentClosesAt = enrollmentClosesAtFrom(hours);
const token = createCatalogAccessToken();

const record = await prisma.$transaction(async (tx) => {
  await tx.catalogAccessToken.updateMany({
    where: { purpose: "staff_review", partnerId: partner.id, status: "active" },
    data: {
      status: "revoked",
      revokedAt: new Date(),
      revokedBy: "kewl-2379-mint",
      revocationReason: "superseded by the shared staff link",
      enrollmentOpen: false,
    },
  });

  const created = await tx.catalogAccessToken.create({
    data: {
      tokenHash: hashCatalogAccessToken(token),
      purpose: "staff_review",
      status: "active",
      partnerId: partner.id,
      issuedToType: "staff",
      // Shared: no `issuedToId`. The roster picks who they are, inside the window below.
      issuedToId: null,
      issuedToEmail: null,
      issuedBy: "kewl-2379-mint",
      enrollmentOpen: true,
      enrollmentClosesAt,
    },
    select: { id: true, issuedAt: true, enrollmentClosesAt: true },
  });

  await tx.reviewerEnrollmentEvent.create({
    data: {
      partnerId: partner.id,
      tokenId: created.id,
      employeeName: "—",
      eventType: "enrollment_opened",
      actorType: "admin",
      actorIdentity: "kewl-2379-mint",
      reason: `shared staff link minted; enrollment open until ${enrollmentClosesAt.toISOString()}`,
    },
  });

  return created;
});

console.log(
  JSON.stringify(
    {
      id: record.id,
      shared: true,
      url: `${base}/staff/catalog/${token}`,
      issuedAt: record.issuedAt,
      enrollmentClosesAt: record.enrollmentClosesAt,
      roster: reviewers.map((reviewer) => reviewer.name),
    },
    null,
    2
  )
);
await prisma.$disconnect();
