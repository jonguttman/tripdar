import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const products = await p.storeProductCatalog.findMany({
    include: { photos: true, partner: { select: { name: true, subdomain: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  for (const pr of products) {
    console.log(`[${pr.partner.subdomain}] ${pr.productName} | photoUrl=${pr.photoUrl ? "YES" : "no"} | photos[]=${pr.photos.length}`);
    if (pr.photoUrl) console.log(`   legacy photoUrl: ${pr.photoUrl.slice(0, 120)}`);
    for (const ph of pr.photos) {
      console.log(`   - ${ph.tag} (sort=${ph.sortOrder}): ${ph.url.slice(0, 120)}${ph.url.length > 120 ? "..." : ""}`);
    }
  }
  await p.$disconnect();
}
main();
