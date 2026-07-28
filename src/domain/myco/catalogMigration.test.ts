import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

describe("catalog foundation migration", () => {
  it("blocks destructive CatalogFieldChange updates and deletes at the database layer", () => {
    const migration = readFileSync(
      join(process.cwd(), "prisma/migrations/20260728163000_tmt_catalog_foundation/migration.sql"),
      "utf8"
    );

    expect(migration).toContain("prevent_catalog_field_change_mutation");
    expect(migration).toContain("BEFORE UPDATE ON \"CatalogFieldChange\"");
    expect(migration).toContain("BEFORE DELETE ON \"CatalogFieldChange\"");
    expect(migration).toContain("CatalogFieldChange history columns are immutable");
  });
});
