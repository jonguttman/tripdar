import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const products = await p.storeProductCatalog.findMany({
    select: { id: true, productName: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  for (const pr of products) {
    console.log(`${pr.productName.padEnd(35)} created=${pr.createdAt.toISOString()}  updated=${pr.updatedAt.toISOString()}`);
  }
  await p.$disconnect();
}
main();
