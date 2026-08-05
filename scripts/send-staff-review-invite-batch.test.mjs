import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("send staff-review invite-batch executor", () => {
  it("refuses missing identity arguments through the canonical npm path before domain imports", () => {
    const result = spawnSync("npm", ["run", "staff-review:send-invite-batch", "--", "--batch-id", "batch-a"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: "",
        RESEND_API_KEY: "",
        STAFF_INVITE_BATCH_SEALING_KEY: "",
      },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "Usage: npm run staff-review:send-invite-batch -- --batch-id <id> --approved-interaction-id <id>"
    );
    expect(result.stderr).not.toContain("Staff invite batch not found");
    expect(result.stderr).not.toContain("staff invite batch send failed");
    expect(result.stderr).not.toContain("DATABASE_URL");
    expect(result.stderr).not.toContain("RESEND_API_KEY");
    expect(result.stderr).not.toContain("STAFF_INVITE_BATCH_SEALING_KEY");
  });
});
