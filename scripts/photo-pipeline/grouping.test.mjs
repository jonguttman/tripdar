import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { materializeGrouping, normalizeGroupingAnalysis } from "./grouping.mjs";

const analysis = {
  groups: [
    {
      id: "blue-moon-20mg",
      identity: { brand: "Nocturnal Farms", product: "Blue Moon", variant: "20mg" },
      confidence: 0.96,
      files: [
        { name: "front.png", view: "front" },
        { name: "back.png", view: "back" },
      ],
      evidence: ["NOCTURNAL FARMS", "BLUE MOON", "20mg"],
    },
    {
      id: "blue-moon-40mg",
      identity: { brand: "Nocturnal Farms", product: "Blue Moon", variant: "40mg" },
      confidence: 0.92,
      files: [{ name: "forty.png", view: "front" }],
      evidence: ["BLUE MOON", "40mg"],
    },
  ],
  unassigned: [
    { name: "blur.png", reason: "Package identity is unreadable", confidence: 0.22 },
  ],
};

describe("mixed-folder photo grouping", () => {
  it("keeps variants separate and flags near-identical groups for confirmation", () => {
    const normalized = normalizeGroupingAnalysis(analysis, ["front.png", "back.png", "forty.png", "blur.png"]);

    expect(normalized.groups).toHaveLength(2);
    expect(normalized.confirmations).toEqual([
      expect.objectContaining({
        reason: "near_identical_variant",
        groupIds: ["blue-moon-20mg", "blue-moon-40mg"],
      }),
    ]);
    expect(normalized.unassigned[0].name).toBe("blur.png");
  });

  it("rejects analysis that loses or duplicates an input image", () => {
    expect(() => normalizeGroupingAnalysis({ ...analysis, unassigned: [] }, ["front.png", "back.png", "forty.png", "blur.png"]))
      .toThrow(/exactly once/);

    const duplicated = structuredClone(analysis);
    duplicated.groups[1].files.push({ name: "front.png", view: "front" });
    expect(() => normalizeGroupingAnalysis(duplicated, ["front.png", "back.png", "forty.png", "blur.png"]))
      .toThrow(/exactly once/);
  });

  it("refuses to place working output inside the immutable raw drop", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "tripdar-grouping-guard-"));
    const inputDir = path.join(root, "raw");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(inputDir));
    for (const name of ["front.png", "back.png", "forty.png", "blur.png"]) {
      await writeFile(path.join(inputDir, name), `immutable-${name}`);
    }

    await expect(materializeGrouping({ inputDir, outputDir: path.join(inputDir, "grouped"), analysis }))
      .rejects.toThrow(/outside the immutable raw input/);
  });

  it("copies immutable inputs into group folders and writes a traceable manifest", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "tripdar-grouping-"));
    const inputDir = path.join(root, "raw");
    const outputDir = path.join(root, "grouped");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(inputDir));
    for (const name of ["front.png", "back.png", "forty.png", "blur.png"]) {
      await writeFile(path.join(inputDir, name), `immutable-${name}`);
    }

    const result = await materializeGrouping({ inputDir, outputDir, analysis });
    const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));

    expect(await readFile(path.join(inputDir, "front.png"), "utf8")).toBe("immutable-front.png");
    expect(await readFile(path.join(outputDir, "groups", "blue-moon-20mg", "front.png"), "utf8"))
      .toBe("immutable-front.png");
    expect(await readFile(path.join(outputDir, "needs-confirmation", "blur.png"), "utf8"))
      .toBe("immutable-blur.png");
    expect(manifest.source_files).toHaveLength(4);
    expect(manifest.confirmations).toHaveLength(1);
    expect(manifest.ready_for_worker).toBe(false);
    expect(await readdir(path.join(outputDir, "groups"))).toEqual(["blue-moon-20mg", "blue-moon-40mg"]);
    expect((await stat(result.manifestPath)).isFile()).toBe(true);
  });
});
