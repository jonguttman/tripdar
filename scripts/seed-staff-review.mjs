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

const REVIEWERS = ["Adrienne", "Clay", "Dani", "Devon", "Eddie", "Audrey"];
const PARTNER_NAME = "The Mushroom Top";

async function main() {
  const partner = await prisma.partner.findFirst({ where: { name: PARTNER_NAME } });
  if (!partner) throw new Error(`Partner "${PARTNER_NAME}" not found`);

  // 1. Reviewers.
  for (const name of REVIEWERS) {
    const email = `${name.toLowerCase()}@themushroomtop.internal`;
    await prisma.mycoEmployee.upsert({
      where: { partnerId_email: { partnerId: partner.id, email } },
      create: { partnerId: partner.id, name, email, active: true },
      update: { name, active: true },
    });
  }
  console.log(`reviewers: ${REVIEWERS.length}`);

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
