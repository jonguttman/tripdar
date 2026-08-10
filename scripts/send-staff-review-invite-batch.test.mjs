import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    STAFF_REVIEW_INVITE_SEAL_KEY: "",
  };
}

describe("send staff-review invite-batch executor", () => {
  it("has no live npm entry because provider send is retired", () => {
    const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
    expect(packageJson.scripts).not.toHaveProperty("staff-review:send-invite-batch");
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
      "Usage: npm run staff-review:prepare-invite-batch -- --partner-id <id> --template-file <path> --from <email> --reply-to <email> --rendered-by <email> --expires-in-days <days> --provider <name> --provider-credential-fingerprint <sha256> --source-issue-id <id> --source-comment-id <id>"
    );
    expect(result.stderr).not.toContain("DATABASE_URL");
    expect(result.stderr).not.toContain("RESEND_API_KEY");
    expect(result.stderr).not.toContain("STAFF_INVITE_BATCH_SEALING_KEY");
  });

  it("rejects malformed template files before domain imports", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "tripdar-staff-invite-"));
    const templateFile = path.join(tempDir, "template.json");
    writeFileSync(templateFile, JSON.stringify([{ subject: "Subject", html: "{{INVITE_URL}}", text: "{{INVITE_URL}}" }]));
    try {
      const result = spawnSync("npm", [
        "run",
        "staff-review:prepare-invite-batch",
        "--",
        "--partner-id",
        "partner-tmt",
        "--template-file",
        templateFile,
        "--from",
        "Tripdar <noreply@tripd.ar>",
        "--reply-to",
        "scottyclaw@gmail.com",
        "--rendered-by",
        "admin@example.com",
        "--expires-in-days",
        "21",
        "--provider",
        "resend",
        "--provider-credential-fingerprint",
        "fingerprint-a",
        "--source-issue-id",
        "KEWL-3405",
        "--source-comment-id",
        "comment-a",
      ], {
        cwd: repoRoot,
        encoding: "utf8",
        env: scriptEnv(),
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Template file must be a JSON object");
      expect(result.stderr).not.toContain("DATABASE_URL");
      expect(result.stderr).not.toContain("RESEND_API_KEY");
      expect(result.stderr).not.toContain("STAFF_INVITE_BATCH_SEALING_KEY");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects malformed Cc values before DB or provider access", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "tripdar-staff-invite-"));
    const templateFile = path.join(tempDir, "template.json");
    writeFileSync(templateFile, JSON.stringify({
      cc: ["not-an-email"],
      subject: "Subject {{INVITE_URL}}",
      html: "<p>{{INVITE_URL}}</p>",
      text: "{{INVITE_URL}}",
    }));
    try {
      const result = spawnSync("npm", [
        "run",
        "staff-review:prepare-invite-batch",
        "--",
        "--partner-id",
        "partner-tmt",
        "--template-file",
        templateFile,
        "--from",
        "Tripdar <noreply@tripd.ar>",
        "--reply-to",
        "scottyclaw@gmail.com",
        "--rendered-by",
        "admin@example.com",
        "--expires-in-days",
        "21",
        "--provider",
        "resend",
        "--provider-credential-fingerprint",
        "fingerprint-a",
        "--source-issue-id",
        "KEWL-3405",
        "--source-comment-id",
        "comment-a",
      ], {
        cwd: repoRoot,
        encoding: "utf8",
        env: scriptEnv(),
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Invalid Cc address: not-an-email");
      expect(result.stderr).not.toContain("DATABASE_URL");
      expect(result.stderr).not.toContain("RESEND_API_KEY");
      expect(result.stderr).not.toContain("STAFF_INVITE_BATCH_SEALING_KEY");
      expect(result.stderr).not.toContain("STAFF_REVIEW_INVITE_SEAL_KEY");
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
      "Usage: npm run staff-review:record-invite-batch-approval -- --partner-id <id> --batch-id <id> --approved-interaction-id <id> --approved-by <email>"
    );
    expect(result.stderr).not.toContain("DATABASE_URL");
    expect(result.stderr).not.toContain("RESEND_API_KEY");
    expect(result.stderr).not.toContain("STAFF_INVITE_BATCH_SEALING_KEY");
  });
});
