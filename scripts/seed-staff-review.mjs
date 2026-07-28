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
 * The roster. Email is the identity key (`@@unique([partnerId, email])`), so it is written
 * out explicitly rather than derived from the name — deriving it is what made the "Claw" →
 * "Clay" correction (KEWL-2379) dangerous: Jon renamed the row in Neon but the email key
 * stayed `claw@…`, so a name-derived `clay@…` upsert would have MISSED the renamed row and
 * inserted a seventh reviewer instead of updating the sixth.
 *
 * `legacyEmails` lets the seed adopt such a row and correct its key in place, so re-running
 * this can neither resurrect "Claw" nor create a duplicate.
 */
const REVIEWERS = [
  { name: "Adrienne", email: "adrienne@themushroomtop.internal" },
  { name: "Audrey", email: "audrey@themushroomtop.internal" },
  { name: "Clay", email: "clay@themushroomtop.internal", legacyEmails: ["claw@themushroomtop.internal"] },
  { name: "Dani", email: "dani@themushroomtop.internal" },
  { name: "Devon", email: "devon@themushroomtop.internal" },
  { name: "Eddie", email: "eddie@themushroomtop.internal" },
];
const PARTNER_NAME = "The Mushroom Top";

async function main() {
  const partner = await prisma.partner.findFirst({ where: { name: PARTNER_NAME } });
  if (!partner) throw new Error(`Partner "${PARTNER_NAME}" not found`);

  // 1. Reviewers. PINs are never seeded — each is set by that person on first use.
  for (const { name, email, legacyEmails = [] } of REVIEWERS) {
    const canonical = await prisma.mycoEmployee.findUnique({
      where: { partnerId_email: { partnerId: partner.id, email } },
      select: { id: true },
    });

    if (!canonical && legacyEmails.length > 0) {
      const legacy = await prisma.mycoEmployee.findFirst({
        where: { partnerId: partner.id, email: { in: legacyEmails } },
        select: { id: true, name: true, email: true },
      });
      if (legacy) {
        // Adopt in place: same row, same id, same review history — just corrected.
        await prisma.mycoEmployee.update({
          where: { id: legacy.id },
          data: { name, email, active: true },
        });
        console.log(`reviewer adopted: ${legacy.name} <${legacy.email}> -> ${name} <${email}>`);
        continue;
      }
    }

    await prisma.mycoEmployee.upsert({
      where: { partnerId_email: { partnerId: partner.id, email } },
      create: { partnerId: partner.id, name, email, active: true },
      update: { name, active: true },
    });
  }

  // Guard against the exact failure this shape exists to prevent.
  const roster = await prisma.mycoEmployee.findMany({
    where: { partnerId: partner.id, active: true, optedOut: false },
    select: { name: true, email: true },
    orderBy: { name: "asc" },
  });
  const stray = roster.filter(
    (entry) => !REVIEWERS.some((expected) => expected.email === entry.email)
  );
  if (stray.length > 0) {
    throw new Error(
      `Unexpected reviewers on the roster (a rename likely duplicated a row): ${stray
        .map((entry) => `${entry.name} <${entry.email}>`)
        .join(", ")}`
    );
  }
  console.log(`reviewers: ${roster.length} — ${roster.map((r) => r.name).join(", ")}`);

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
