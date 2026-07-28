/** KEWL-2335 — mint a staff review link. The raw token is printed once; only its hash is stored. */
import { PrismaClient } from "@prisma/client";
import { createCatalogAccessToken, hashCatalogAccessToken } from "../src/domain/myco/catalogTokens.ts";

const prisma = new PrismaClient();
const base = process.argv[2] ?? "http://localhost:3000";
const partner = await prisma.partner.findFirst({ where: { name: "The Mushroom Top" } });
const token = createCatalogAccessToken();
const record = await prisma.catalogAccessToken.create({
  data: {
    tokenHash: hashCatalogAccessToken(token),
    purpose: "staff_review",
    status: "active",
    partnerId: partner.id,
    issuedToType: "staff",
    issuedBy: "kewl-2353-build",
  },
  select: { id: true },
});
console.log(JSON.stringify({ id: record.id, url: `${base}/staff/catalog/${token}`, token }));
await prisma.$disconnect();
