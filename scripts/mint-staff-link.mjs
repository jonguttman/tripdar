/** KEWL-2335 — mint a staff review link. The raw token is printed once; only its hash is stored. */
import { PrismaClient } from "@prisma/client";
import { createCatalogAccessToken, hashCatalogAccessToken } from "../src/domain/myco/catalogTokens.ts";

const prisma = new PrismaClient();
const base = process.argv[2] ?? "http://localhost:3000";
const partner = await prisma.partner.findFirst({ where: { name: "The Mushroom Top" } });
const token = createCatalogAccessToken();
if (!partner) throw new Error("The Mushroom Top partner was not found");
const now = new Date();
const record = await prisma.$transaction(async (tx) => {
  await tx.catalogAccessToken.updateMany({
    where: {
      purpose: "staff_review",
      partnerId: partner.id,
      status: "active",
      catalogItemId: null,
    },
    data: {
      status: "revoked",
      revokedAt: now,
      revokedBy: "kewl-2393-build",
      revocationReason: "superseded by shared staff link",
    },
  });
  return tx.catalogAccessToken.create({
    data: {
      tokenHash: hashCatalogAccessToken(token),
      purpose: "staff_review",
      status: "active",
      partnerId: partner.id,
      issuedToType: "staff",
      issuedToId: null,
      issuedBy: "kewl-2393-build",
    },
    select: { id: true },
  });
});
console.log(JSON.stringify({ id: record.id, url: `${base}/staff/catalog/${token}`, token }));
await prisma.$disconnect();
