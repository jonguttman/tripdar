import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { normalizeStrainSlug } from "../src/domain/strain/data.ts";

function loadDotenvFile(path: string) {
  if (!existsSync(path)) return;

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;

    const value = rawValue
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    process.env[key] = value;
  }
}

loadDotenvFile(resolve(process.cwd(), ".env"));
loadDotenvFile(resolve(process.cwd(), ".env.local"));

const prisma = new PrismaClient();

try {
  const products = await prisma.storeProductCatalog.findMany({
    where: { strainSlug: { not: null } },
    select: { id: true, productName: true, strainSlug: true },
    orderBy: { productName: "asc" },
  });

  const nonEmptyProducts = products.filter((product) => product.strainSlug?.trim());
  const misses = nonEmptyProducts.filter(
    (product) => product.strainSlug && !normalizeStrainSlug(product.strainSlug)
  );

  if (misses.length > 0) {
    console.error(`StoreProductCatalog strainSlug drift found: ${misses.length} invalid value(s).`);
    for (const product of misses) {
      console.error(`- ${product.id} ${product.productName}: "${product.strainSlug}"`);
    }
    process.exitCode = 1;
  } else {
    console.log(`StoreProductCatalog strainSlug drift check passed (${nonEmptyProducts.length} non-empty strainSlug value(s)).`);
  }
} finally {
  await prisma.$disconnect();
}
