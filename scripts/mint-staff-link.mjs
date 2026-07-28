/**
 * KEWL-2394 — mint ONE shared staff review link for the whole roster.
 *
 * Jon's ruling replaced the KEWL-2364 per-reviewer links: everyone gets the same URL,
 * picks their name, and chooses a PIN on first use. So this mints a single UNBOUND token
 * (`issuedToId: null`) with a 72-hour enrollment window, and supersedes every live
 * staff_review link — shared or per-reviewer — so no older copy keeps working.
 *
 * The raw token is printed once; only its SHA-256 hash is stored.
 *
 * Usage: node --env-file=.env.local scripts/mint-staff-link.mjs [baseUrl] [--force] [--hours=N]
 */
import { PrismaClient } from "@prisma/client";
import {
  createCatalogAccessToken,
  hashCatalogAccessToken,
} from "../src/domain/myco/catalogTokens.ts";
import {
  appendEnrollmentEvent,
  assertReviewersUnenrolled,
  enrollmentWindowExpiry,
} from "../src/domain/myco/staffEnrollment.ts";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const flags = args.filter((arg) => arg.startsWith("--"));
const base =
  args.find((arg) => !arg.startsWith("--")) ?? "http://localhost:3000";
const force = flags.includes("--force");
const hoursFlag = flags.find((flag) => flag.startsWith("--hours="));
const hours = hoursFlag ? Number(hoursFlag.split("=")[1]) : null;

const partner = await prisma.partner.findFirst({
  where: { name: "The Mushroom Top" },
});
if (!partner) throw new Error("Partner 'The Mushroom Top' not found");

/* --- Scope item 9: the pre-ship assertion. ---------------------------------- *
 * Enrollment is compare-and-set on `pinHash IS NULL`, so a reviewer who already holds a
 * PIN CANNOT claim their own name — they would be handed a PIN prompt for digits they
 * never chose. That is exactly what the four QA enrollments did on 2026-07-28, and it is
 * invisible until the affected person taps the link. Refuse the mint instead.            */
const readiness = await assertReviewersUnenrolled(prisma, partner.id);

console.log(`roster (${readiness.reviewers.length}):`);
for (const reviewer of readiness.reviewers) {
  console.log(
    `  ${reviewer.hasPin ? "ENROLLED" : "unenrolled"}  ${reviewer.name}` +
      (reviewer.pinSetAt
        ? `  (PIN set ${reviewer.pinSetAt.toISOString()})`
        : ""),
  );
}

if (!readiness.ready) {
  const names = readiness.alreadyEnrolled
    .map((reviewer) => reviewer.name)
    .join(", ");
  console.error("");
  console.error(
    "!!!! ------------------------------------------------------------ !!!!",
  );
  console.error(
    `!!!! ${readiness.alreadyEnrolled.length} reviewer(s) ALREADY HOLD A PIN: ${names}`,
  );
  console.error(
    "!!!! They cannot self-enroll on this link — they will be asked for a",
  );
  console.error(
    "!!!! PIN they never chose, and will be locked out of their own name.",
  );
  console.error(
    "!!!! Clear them first via POST /api/admin/myco/staff-enrollment/reset-all",
  );
  console.error(
    "!!!! ------------------------------------------------------------ !!!!",
  );
  console.error("");
  if (!force) {
    console.error(
      "Refusing to mint. Re-run with --force only if this is deliberate.",
    );
    await prisma.$disconnect();
    process.exit(1);
  }
  console.error("--force given: minting anyway.");
}

const now = new Date();
const closesAt =
  hours && Number.isFinite(hours) && hours > 0
    ? new Date(now.getTime() + hours * 60 * 60 * 1000)
    : enrollmentWindowExpiry(now);

// Supersede EVERY live staff link, bound or shared, so a forwarded old copy stops working.
const superseded = await prisma.catalogAccessToken.updateMany({
  where: { partnerId: partner.id, purpose: "staff_review", status: "active" },
  data: {
    status: "revoked",
    revokedAt: now,
    revokedBy: "kewl-2394-mint",
    revocationReason: "superseded by the shared staff review link",
  },
});

const token = createCatalogAccessToken();
const record = await prisma.catalogAccessToken.create({
  data: {
    tokenHash: hashCatalogAccessToken(token),
    purpose: "staff_review",
    status: "active",
    partnerId: partner.id,
    issuedToType: "staff",
    issuedToId: null, // shared: the roster picker identifies the reviewer, not the link
    issuedToEmail: null,
    issuedBy: "kewl-2394-mint",
    enrollmentClosesAt: closesAt,
  },
  select: { id: true },
});

await appendEnrollmentEvent(prisma, {
  partnerId: partner.id,
  accessTokenId: record.id,
  event: "link_minted",
  outcome: "allowed",
  actorType: "admin",
  actorIdentity: "kewl-2394-mint",
  reason: "shared staff review link with a bounded enrollment window",
  metadata: {
    closesAt: closesAt.toISOString(),
    supersededLinks: superseded.count,
    rosterSize: readiness.reviewers.length,
    alreadyEnrolled: readiness.alreadyEnrolled.map((reviewer) => reviewer.name),
    forced: force,
  },
});

console.log("");
console.log(
  JSON.stringify(
    {
      tokenId: record.id,
      shared: true,
      supersededLinks: superseded.count,
      enrollmentClosesAt: closesAt.toISOString(),
      url: `${base}/staff/catalog/${token}`,
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
