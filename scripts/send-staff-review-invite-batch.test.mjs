import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function scriptEnv() {
  return {
    ...process.env,
    DATABASE_URL: "",
    RESEND_API_KEY: "",
    STAFF_INVITE_BATCH_SEALING_KEY: "",
  };
}

describe("send staff-review invite-batch executor", () => {
  it("refuses missing identity arguments through the canonical npm path before domain imports", () => {
    const result = spawnSync("npm", ["run", "staff-review:send-invite-batch", "--", "--batch-id", "batch-a"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: scriptEnv(),
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

  it("refuses valid-looking sends because provider send is retired", () => {
    const result = spawnSync("npm", [
      "run",
      "staff-review:send-invite-batch",
      "--",
      "--batch-id",
      "batch-a",
      "--approved-interaction-id",
      "interaction-a",
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      env: scriptEnv(),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("staff invite batch provider send is retired");
    expect(result.stderr).toContain("staff-review:record-invite-batch-approval");
    expect(result.stderr).not.toContain("sendApprovedStaffReviewInviteBatch");
    expect(result.stderr).not.toContain("DATABASE_URL");
    expect(result.stderr).not.toContain("RESEND_API_KEY");
    expect(result.stderr).not.toContain("STAFF_INVITE_BATCH_SEALING_KEY");
  });
});

describe("prepare staff-review invite-batch executor", () => {
  it("refuses missing required arguments through the canonical npm path before domain imports", () => {
    const result = spawnSync("npm", ["run", "staff-review:prepare-invite-batch", "--", "--partner-id", "partner-tmt"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: scriptEnv(),
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "Usage: npm run staff-review:prepare-invite-batch -- --partner-id <id> --messages-file <path> --from <email> --reply-to <email> --rendered-by <email> --expires-in-days <days>"
    );
    expect(result.stderr).not.toContain("DATABASE_URL");
    expect(result.stderr).not.toContain("RESEND_API_KEY");
    expect(result.stderr).not.toContain("STAFF_INVITE_BATCH_SEALING_KEY");
  });

  it("rejects malformed message files before domain imports", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "tripdar-staff-invite-"));
    const messagesFile = path.join(tempDir, "messages.json");
    writeFileSync(messagesFile, JSON.stringify({ email: "sage@thegreenroomonventura.com" }));
    try {
      const result = spawnSync("npm", [
        "run",
        "staff-review:prepare-invite-batch",
        "--",
        "--partner-id",
        "partner-tmt",
        "--messages-file",
        messagesFile,
        "--from",
        "Tripdar <noreply@tripd.ar>",
        "--reply-to",
        "scottyclaw@gmail.com",
        "--rendered-by",
        "admin@example.com",
        "--expires-in-days",
        "21",
      ], {
        cwd: repoRoot,
        encoding: "utf8",
        env: scriptEnv(),
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Messages file must be a JSON array");
      expect(result.stderr).not.toContain("DATABASE_URL");
      expect(result.stderr).not.toContain("RESEND_API_KEY");
      expect(result.stderr).not.toContain("STAFF_INVITE_BATCH_SEALING_KEY");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects a messages file that does not match the TMT direct staff roster before batch preparation", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "tripdar-staff-invite-"));
    const messagesFile = path.join(tempDir, "messages.json");
    writeFileSync(messagesFile, JSON.stringify([
      {
        email: "sage@thegreenroomonventura.com",
        cc: ["adrienne@theotherpathcbd.com"],
        subject: "Subject",
        html: "<p>{{INVITE_URL}}</p>",
        text: "{{INVITE_URL}}",
      },
    ]));
    try {
      const result = spawnSync("npm", [
        "run",
        "staff-review:prepare-invite-batch",
        "--",
        "--partner-id",
        "partner-tmt",
        "--messages-file",
        messagesFile,
        "--from",
        "Tripdar <noreply@tripd.ar>",
        "--reply-to",
        "scottyclaw@gmail.com",
        "--rendered-by",
        "admin@example.com",
        "--expires-in-days",
        "21",
      ], {
        cwd: repoRoot,
        encoding: "utf8",
        env: scriptEnv(),
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Messages file must contain exactly 6 TMT staff reviewer messages");
      expect(result.stderr).not.toContain("DATABASE_URL");
      expect(result.stderr).not.toContain("RESEND_API_KEY");
      expect(result.stderr).not.toContain("STAFF_INVITE_BATCH_SEALING_KEY");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("record staff-review invite-batch approval executor", () => {
  it("refuses missing approval arguments through the canonical npm path before domain imports", () => {
    const result = spawnSync("npm", [
      "run",
      "staff-review:record-invite-batch-approval",
      "--",
      "--batch-id",
      "batch-a",
      "--approved-interaction-id",
      "interaction-a",
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      env: scriptEnv(),
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "Usage: npm run staff-review:record-invite-batch-approval -- --batch-id <id> --approved-interaction-id <id> --approved-by <email>"
    );
    expect(result.stderr).not.toContain("DATABASE_URL");
    expect(result.stderr).not.toContain("RESEND_API_KEY");
    expect(result.stderr).not.toContain("STAFF_INVITE_BATCH_SEALING_KEY");
  });
});
