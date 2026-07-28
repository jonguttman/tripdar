/**
 * KEWL-2335 — mint one staff review link PER REVIEWER.
 *
 * Raw tokens are printed once; only their hashes are stored. Each link is bound to a
 * single `MycoEmployee` (KEWL-2364) — there is no shared store-wide link, because
 * possession of a link is what authorizes that reviewer's first-use PIN.
 *
 * Usage: node scripts/mint-staff-link.mjs [baseUrl] [reviewerEmail]
 */
import { PrismaClient } from "@prisma/client";
import { createCatalogAccessToken, hashCatalogAccessToken } from "../src/domain/myco/catalogTokens.ts";

const prisma = new PrismaClient();
const base = process.argv[2] ?? "http://localhost:3000";
const onlyEmail = process.argv[3] ?? null;

const partner = await prisma.partner.findFirst({ where: { name: "The Mushroom Top" } });
if (!partner) throw new Error("Partner 'The Mushroom Top' not found");

const reviewers = await prisma.mycoEmployee.findMany({
  where: {
    partnerId: partner.id,
    active: true,
    optedOut: false,
    ...(onlyEmail ? { email: onlyEmail } : {}),
  },
  orderBy: { name: "asc" },
  select: { id: true, name: true, email: true },
});
if (reviewers.length === 0) throw new Error("No active reviewers found");

const minted = [];
for (const reviewer of reviewers) {
  // Supersede any live link for this reviewer so a forwarded old copy stops working.
  await prisma.catalogAccessToken.updateMany({
    where: {
      purpose: "staff_review",
      issuedToType: "staff",
      issuedToId: reviewer.id,
      status: "active",
    },
    data: {
      status: "revoked",
      revokedAt: new Date(),
      revokedBy: "kewl-2353-build",
      revocationReason: "superseded by a newly minted link",
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
      issuedToId: reviewer.id,
      issuedToEmail: reviewer.email,
      issuedBy: "kewl-2353-build",
    },
    select: { id: true },
  });

  minted.push({
    id: record.id,
    reviewer: reviewer.name,
    email: reviewer.email,
    url: `${base}/staff/catalog/${token}`,
  });
}

console.log(JSON.stringify(minted, null, 2));
await prisma.$disconnect();
