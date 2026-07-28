/**
 * KEWL-2335 — seed the staff catalog review surface.
 *
 * Idempotent. Seeds:
 *  1. The six fixed reviewers (no PINs — each is set on first use).
 *  2. The approved Tier A–D required-field set as CatalogFieldVerificationRule rows.
 *  3. The G23 research-only exclusion (Lady Hyphae isolated solution).
 *
 * Run: node --env-file=.env.local scripts/seed-staff-review.mjs
 */

import { PrismaClient } from "@prisma/client";
import { CATALOG_FIELD_SPECS } from "../src/domain/myco/catalogFieldSpec.ts";

const prisma = new PrismaClient();

/**
 * The six reviewers.
 *
 * `legacyEmails` exists because of the KEWL-2394 Clay rename. The row was seeded as
 * "Claw" — a typo — so its address is `claw@…`, and the name was later corrected by hand
 * in Neon. The upsert key here is `partnerId_email`, so simply changing the literal to
 * "Clay" would derive `clay@…`, miss the existing row entirely, and seed a SEVENTH
 * reviewer. Reconciling the legacy address first is what makes the rename idempotent
 * against a row that has already been renamed.
 */
const REVIEWERS = [
  { name: "Adrienne" },
  { name: "Audrey" },
  { name: "Clay", legacyEmails: ["claw@themushroomtop.internal"] },
  { name: "Dani" },
  { name: "Devon" },
  { name: "Eddie" },
];
const PARTNER_NAME = "The Mushroom Top";

const emailFor = (name) => `${name.toLowerCase()}@themushroomtop.internal`;

async function main() {
  const partner = await prisma.partner.findFirst({ where: { name: PARTNER_NAME } });
  if (!partner) throw new Error(`Partner "${PARTNER_NAME}" not found`);

  // 1. Reviewers.
  for (const { name, legacyEmails = [] } of REVIEWERS) {
    const email = emailFor(name);

    // Migrate any legacy-addressed row onto the canonical address BEFORE the upsert, so
    // the upsert can only ever find-or-create one row per person. Skipped when a
    // canonical row already exists, so a half-migrated database converges instead of
    // colliding on the unique key.
    const canonical = await prisma.mycoEmployee.findUnique({
      where: { partnerId_email: { partnerId: partner.id, email } },
      select: { id: true },
    });
    if (!canonical) {
      const legacy = await prisma.mycoEmployee.findFirst({
        where: { partnerId: partner.id, email: { in: legacyEmails } },
        select: { id: true, email: true },
      });
      if (legacy) {
        await prisma.mycoEmployee.update({
          where: { id: legacy.id },
          // PIN columns are untouched: this is a rename, not a re-enrollment.
          data: { email, name },
        });
        console.log(`reviewer: migrated ${legacy.email} -> ${email}`);
      }
    }

    await prisma.mycoEmployee.upsert({
      where: { partnerId_email: { partnerId: partner.id, email } },
      create: { partnerId: partner.id, name, email, active: true },
      update: { name, active: true },
    });
  }

  const seeded = await prisma.mycoEmployee.count({
    where: { partnerId: partner.id, active: true, optedOut: false },
  });
  console.log(`reviewers: ${REVIEWERS.length} declared, ${seeded} active in the database`);
  if (seeded !== REVIEWERS.length) {
    console.warn(
      `WARNING: expected ${REVIEWERS.length} active reviewers, found ${seeded}. Check for a duplicate or stale row before minting a link.`
    );
  }

  // 2. Required-field config data.
  for (const spec of CATALOG_FIELD_SPECS) {
    const existing = await prisma.catalogFieldVerificationRule.findFirst({
      where: { partnerId: null, fieldName: spec.fieldName },
    });
    if (existing) {
      await prisma.catalogFieldVerificationRule.update({
        where: { id: existing.id },
        data: { ...spec },
      });
    } else {
      await prisma.catalogFieldVerificationRule.create({
        data: { partnerId: null, ...spec },
      });
    }
  }
  console.log(`field rules: ${CATALOG_FIELD_SPECS.length}`);

  // 3. G23 research-only exclusion.
  const g23 = await prisma.storeProductCatalog.findFirst({
    where: { partnerId: partner.id, sku: "INTAKE-20260717-023" },
    select: { id: true, productName: true, brand: true },
  });
  if (g23) {
    await prisma.storeProductCatalog.update({
      where: { id: g23.id },
      data: {
        researchOnly: true,
        researchOnlyReason:
          "Isolated research solution — never enters the customer path (KEWL-2335 G23 exclusion).",
        active: false,
      },
    });
    console.log(`research-only: ${g23.productName} (${g23.brand})`);
  } else {
    console.log("research-only: G23 (INTAKE-20260717-023) not found — skipped");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
