import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  TMT_REVIEWER_STATUS_KEYS,
  TMT_REVIEWER_STATUS_SQL,
  executeReviewerStatus,
} from "./tmt-reviewer-status.mts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const expectedSchemaFields = {
  MycoEmployee: ["pinHash", "pinSetAt", "pinLastUsedAt"],
  StaffReviewerIdentityAlias: ["legacyEmployeeId", "employeeId"],
  StaffReviewInvitation: ["confirmedAt", "lastOpenedAt", "scannerOpenedAt", "revokedAt", "expiresAt"],
  StaffReviewSession: ["lastSeenAt", "revokedAt"],
  CatalogFieldChange: ["actorIdentity", "actorType", "createdAt"],
};

function fakeRows(names = ["Audrey", "Clay", "Dani", "Devon", "Eddie", "Sage"]) {
  return names.map((name, index) => ({
    name,
    on_shared_roster: name !== "Sage",
    pin_enrolled: index % 2 === 0,
    pin_set_at: new Date("2026-08-05T12:00:00.000Z"),
    pin_last_used_at: null,
    invite_state: name === "Sage" ? "confirmed" : "pending",
    live_expires_at: new Date("2026-08-26T12:00:00.000Z"),
    first_confirmed_at: name === "Sage" ? new Date("2026-08-07T12:00:00.000Z") : null,
    last_link_open_at: null,
    scanner_open_at: null,
    last_seen_at: null,
    live_sessions: BigInt(index),
    edits: index,
    edits_24h: 0,
    last_edit_at: index > 0 ? new Date("2026-08-10T12:00:00.000Z") : null,
    email: `${name.toLowerCase()}@example.com`,
    pinHash: "must-not-leak",
    tokenHash: "must-not-leak",
    sessionHash: "must-not-leak",
    invitationTokenHash: "must-not-leak",
    scannerUserAgentHash: "must-not-leak",
    sealKeyFingerprint: "must-not-leak",
  }));
}

function captureStreams() {
  let stdout = "";
  let stderr = "";
  return {
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } },
    get stdoutText() { return stdout; },
    get stderrText() { return stderr; },
  };
}

function prismaReturning(rows) {
  return {
    $queryRawUnsafe: async () => rows,
  };
}

function extractModelBlock(schema, modelName) {
  const match = schema.match(new RegExp(`^model ${modelName} \\{\\r?\\n([\\s\\S]*?)\\r?\\n\\}`, "m"));
  if (!match) throw new Error(`model ${modelName} not found`);
  return match[1];
}

function fieldNamesInModel(schema, modelName) {
  const block = extractModelBlock(schema, modelName);
  return new Set(
    block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("//") && !line.startsWith("@@"))
      .map((line) => line.split(/\s+/)[0]),
  );
}

describe("TMT reviewer-status runtime controls", () => {
  it("loads under the same strip-only TypeScript runner used by the npm command", () => {
    const result = spawnSync("node", [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      "await import('./scripts/tmt-reviewer-status.mts')",
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: "" },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("");
  });

  it("prints six rows including Sage as JSON only after controls pass", async () => {
    const streams = captureStreams();
    const status = await executeReviewerStatus({
      prisma: prismaReturning(fakeRows()),
      stdout: streams.stdout,
      stderr: streams.stderr,
    });

    expect(status).toBe(0);
    expect(streams.stderrText).toBe("");
    const payload = JSON.parse(streams.stdoutText);
    expect(payload).toHaveLength(6);
    expect(payload.some((row) => row.name === "Sage")).toBe(true);
    expect(payload[0].pin_set_at).toBe("2026-08-05T12:00:00.000Z");
    expect(payload[4].edits).toBe(4);
  });

  it("refuses five rows and emits no stdout JSON", async () => {
    const streams = captureStreams();
    const status = await executeReviewerStatus({
      prisma: prismaReturning(fakeRows(["Audrey", "Clay", "Dani", "Devon", "Eddie"])),
      stdout: streams.stdout,
      stderr: streams.stderr,
    });

    expect(status).toBe(1);
    expect(streams.stdoutText).toBe("");
    expect(streams.stderrText).toContain("row_count");
  });

  it("refuses six rows without Sage and emits no stdout JSON", async () => {
    const streams = captureStreams();
    const status = await executeReviewerStatus({
      prisma: prismaReturning(fakeRows(["Audrey", "Clay", "Dani", "Devon", "Eddie", "Adrienne"])),
      stdout: streams.stdout,
      stderr: streams.stderr,
    });

    expect(status).toBe(1);
    expect(streams.stdoutText).toBe("");
    expect(streams.stderrText).toContain("sage_presence");
  });

  it("emits no stdout JSON when the database query fails", async () => {
    const streams = captureStreams();
    const status = await executeReviewerStatus({
      prisma: {
        $queryRawUnsafe: async () => {
          throw new Error("connection string should not leak");
        },
      },
      stdout: streams.stdout,
      stderr: streams.stderr,
    });

    expect(status).toBe(1);
    expect(streams.stdoutText).toBe("");
    expect(streams.stderrText).toContain("database_query");
    expect(streams.stderrText).not.toContain("connection string should not leak");
  });
});

describe("TMT reviewer-status output contract", () => {
  it("serializes only approved operational keys and no email-shaped values or forbidden field names", async () => {
    const streams = captureStreams();
    const status = await executeReviewerStatus({
      prisma: prismaReturning(fakeRows()),
      stdout: streams.stdout,
      stderr: streams.stderr,
    });

    expect(status).toBe(0);
    const payload = JSON.parse(streams.stdoutText);
    for (const row of payload) {
      expect(Object.keys(row)).toEqual([...TMT_REVIEWER_STATUS_KEYS]);
    }

    const serialized = JSON.stringify(payload);
    for (const forbidden of [
      "email",
      "pinHash",
      "tokenHash",
      "sessionHash",
      "invitationTokenHash",
      "scannerUserAgentHash",
      "sealKeyFingerprint",
      "connection",
      "DATABASE_URL",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  });
});

describe("TMT reviewer-status read-only query boundary", () => {
  it("executes exactly one raw SELECT and no Prisma write path", async () => {
    const calls = [];
    const forbiddenWrites = new Set(["create", "update", "updateMany", "delete", "deleteMany", "upsert"]);
    const prisma = new Proxy({}, {
      get(_target, prop) {
        if (prop === "$queryRawUnsafe") {
          return async (sql) => {
            calls.push({ op: "$queryRawUnsafe", sql });
            return fakeRows();
          };
        }
        if (String(prop).startsWith("$executeRaw")) {
          throw new Error(`write path reached: ${String(prop)}`);
        }
        return new Proxy({}, {
          get(_modelTarget, modelProp) {
            if (forbiddenWrites.has(String(modelProp))) {
              throw new Error(`write path reached: ${String(prop)}.${String(modelProp)}`);
            }
            return undefined;
          },
        });
      },
    });

    const streams = captureStreams();
    const status = await executeReviewerStatus({ prisma, stdout: streams.stdout, stderr: streams.stderr });

    expect(status).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe("$queryRawUnsafe");
    expect(calls[0].sql).toBe(TMT_REVIEWER_STATUS_SQL);
    expect(calls[0].sql.trim()).toMatch(/^WITH partner AS/);
    expect(calls[0].sql).toContain("SELECT c.name");
    expect(calls[0].sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|UPSERT|CREATE|DROP|ALTER|TRUNCATE)\b/i);
  });
});

describe("TMT reviewer-status schema contract", () => {
  it("keeps the exact production fields required by the canonical query", () => {
    const schema = readFileSync(path.join(repoRoot, "prisma/schema.prisma"), "utf8");

    for (const [modelName, requiredFields] of Object.entries(expectedSchemaFields)) {
      const fields = fieldNamesInModel(schema, modelName);
      for (const field of requiredFields) {
        expect(fields.has(field), `${modelName}.${field} exists`).toBe(true);
      }
    }
  });
});
