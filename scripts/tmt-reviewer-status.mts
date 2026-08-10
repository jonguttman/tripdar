import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_REVIEWER_COUNT = 6;
const REQUIRED_REVIEWER_NAME = "Sage";

export const TMT_REVIEWER_STATUS_KEYS = [
  "name",
  "on_shared_roster",
  "pin_enrolled",
  "pin_set_at",
  "pin_last_used_at",
  "invite_state",
  "live_expires_at",
  "first_confirmed_at",
  "last_link_open_at",
  "scanner_open_at",
  "last_seen_at",
  "live_sessions",
  "edits",
  "edits_24h",
  "last_edit_at",
] as const;

type OperationalKey = typeof TMT_REVIEWER_STATUS_KEYS[number];

type RawReviewerStatusRow = Record<string, unknown>;

export type ReviewerStatusRow = {
  [K in OperationalKey]: K extends
    | "pin_set_at"
    | "pin_last_used_at"
    | "live_expires_at"
    | "first_confirmed_at"
    | "last_link_open_at"
    | "scanner_open_at"
    | "last_seen_at"
    | "last_edit_at"
    ? string | null
    : K extends "on_shared_roster" | "pin_enrolled"
      ? boolean
      : K extends "live_sessions" | "edits" | "edits_24h"
        ? number
        : string;
};

type PrismaReadOnly = {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
};

type OutputStream = {
  write(chunk: string): unknown;
};

type ExecuteReviewerStatusOptions = {
  prisma: PrismaReadOnly;
  stdout?: OutputStream;
  stderr?: OutputStream;
};

export class ReviewerStatusControlError extends Error {
  readonly control: string;

  constructor(control: string, message: string) {
    super(message);
    this.name = "ReviewerStatusControlError";
    this.control = control;
  }
}

export const TMT_REVIEWER_STATUS_SQL = `WITH partner AS (SELECT '13720283-cb0d-4368-be0e-016638d859a9'::text AS pid),
canon AS (
  SELECT e.id, e.name, e.email FROM "MycoEmployee" e, partner p
  WHERE e."partnerId" = p.pid AND e.active = true AND e.email NOT LIKE '%@themushroomtop.internal'),
alias AS (SELECT a."employeeId" AS canon_id, a."legacyEmployeeId" AS legacy_id FROM "StaffReviewerIdentityAlias" a),
roster AS (
  SELECT c.id AS canon_id, l.id AS roster_id, (l."pinHash" IS NOT NULL) AS pin_enrolled, l."pinSetAt", l."pinLastUsedAt"
  FROM canon c LEFT JOIN alias al ON al.canon_id = c.id LEFT JOIN "MycoEmployee" l ON l.id = al.legacy_id),
ids AS (SELECT id AS canon_id, id AS any_id FROM canon UNION SELECT canon_id, legacy_id FROM alias),
inv AS (
  SELECT "employeeId",
    BOOL_OR("revokedAt" IS NULL AND "confirmedAt" IS NOT NULL) AS has_confirmed_live,
    BOOL_OR("revokedAt" IS NULL AND "confirmedAt" IS NULL)     AS has_pending_live,
    MAX(CASE WHEN "revokedAt" IS NULL THEN "expiresAt" END)     AS live_expires_at,
    MIN("confirmedAt") AS first_confirmed_at,
    MAX(GREATEST("lastOpenedAt","confirmedAt")) AS last_link_open_at,
    MAX("scannerOpenedAt") AS scanner_open_at
  FROM "StaffReviewInvitation" GROUP BY "employeeId"),
sess AS (
  SELECT "employeeId", MAX("lastSeenAt") AS last_seen_at, COUNT(*) FILTER (WHERE "revokedAt" IS NULL)::int AS live_sessions
  FROM "StaffReviewSession" GROUP BY "employeeId"),
work AS (
  SELECT i.canon_id, COUNT(*)::int AS edits,
    COUNT(*) FILTER (WHERE f."createdAt" >= NOW() - INTERVAL '24 hours')::int AS edits_24h,
    MIN(f."createdAt") AS first_edit_at, MAX(f."createdAt") AS last_edit_at
  FROM ids i JOIN "CatalogFieldChange" f ON f."actorIdentity" = i.any_id AND f."actorType" = 'staff'
  GROUP BY i.canon_id)
SELECT c.name, (r.roster_id IS NOT NULL) AS on_shared_roster,
  COALESCE(r.pin_enrolled,false) AS pin_enrolled, r."pinSetAt" AS pin_set_at, r."pinLastUsedAt" AS pin_last_used_at,
  CASE WHEN i.has_confirmed_live THEN 'confirmed' WHEN i.has_pending_live THEN 'pending' ELSE 'none' END AS invite_state,
  i.live_expires_at, i.first_confirmed_at, i.last_link_open_at, i.scanner_open_at,
  s.last_seen_at, COALESCE(s.live_sessions,0) AS live_sessions,
  COALESCE(w.edits,0) AS edits, COALESCE(w.edits_24h,0) AS edits_24h, w.last_edit_at
FROM canon c
LEFT JOIN roster r ON r.canon_id = c.id
LEFT JOIN inv i ON i."employeeId" = c.id
LEFT JOIN sess s ON s."employeeId" = c.id
LEFT JOIN work w ON w.canon_id = c.id
ORDER BY c.name;`;

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

export function loadTripdarEnv() {
  loadDotenvFile(resolve(process.cwd(), ".env"));
  loadDotenvFile(resolve(process.cwd(), ".env.local"));
}

function serializeTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  throw new ReviewerStatusControlError("output_contract", "timestamp value has an unexpected type");
}

function serializeCount(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  throw new ReviewerStatusControlError("output_contract", "count value has an unexpected type");
}

function serializeBoolean(value: unknown): boolean {
  return Boolean(value);
}

function serializeString(value: unknown): string {
  if (typeof value !== "string") {
    throw new ReviewerStatusControlError("output_contract", "string value has an unexpected type");
  }
  return value;
}

export function serializeReviewerStatusRows(rows: RawReviewerStatusRow[]): ReviewerStatusRow[] {
  return rows.map((row) => ({
    name: serializeString(row.name),
    on_shared_roster: serializeBoolean(row.on_shared_roster),
    pin_enrolled: serializeBoolean(row.pin_enrolled),
    pin_set_at: serializeTimestamp(row.pin_set_at),
    pin_last_used_at: serializeTimestamp(row.pin_last_used_at),
    invite_state: serializeString(row.invite_state),
    live_expires_at: serializeTimestamp(row.live_expires_at),
    first_confirmed_at: serializeTimestamp(row.first_confirmed_at),
    last_link_open_at: serializeTimestamp(row.last_link_open_at),
    scanner_open_at: serializeTimestamp(row.scanner_open_at),
    last_seen_at: serializeTimestamp(row.last_seen_at),
    live_sessions: serializeCount(row.live_sessions),
    edits: serializeCount(row.edits),
    edits_24h: serializeCount(row.edits_24h),
    last_edit_at: serializeTimestamp(row.last_edit_at),
  }));
}

function assertReviewerStatusControls(rows: RawReviewerStatusRow[]) {
  if (rows.length !== EXPECTED_REVIEWER_COUNT) {
    throw new ReviewerStatusControlError(
      "row_count",
      `expected ${EXPECTED_REVIEWER_COUNT} TMT reviewer rows, got ${rows.length}`,
    );
  }

  if (!rows.some((row) => row.name === REQUIRED_REVIEWER_NAME)) {
    throw new ReviewerStatusControlError("sage_presence", "expected reviewer row named Sage");
  }
}

export async function fetchReviewerStatusRows(prisma: PrismaReadOnly): Promise<RawReviewerStatusRow[]> {
  let rows: unknown;
  try {
    rows = await prisma.$queryRawUnsafe(TMT_REVIEWER_STATUS_SQL);
  } catch {
    throw new ReviewerStatusControlError("database_query", "database query failed");
  }

  if (!Array.isArray(rows)) {
    throw new ReviewerStatusControlError("database_query", "database query returned a non-array result");
  }

  return rows as RawReviewerStatusRow[];
}

export async function buildReviewerStatusJson(prisma: PrismaReadOnly): Promise<string> {
  const rows = await fetchReviewerStatusRows(prisma);
  assertReviewerStatusControls(rows);
  return JSON.stringify(serializeReviewerStatusRows(rows));
}

export async function executeReviewerStatus(options: ExecuteReviewerStatusOptions): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  try {
    const payload = await buildReviewerStatusJson(options.prisma);
    stdout.write(`${payload}\n`);
    return 0;
  } catch (error) {
    if (error instanceof ReviewerStatusControlError) {
      stderr.write(`tmt reviewer status control failed (${error.control}): ${error.message}\n`);
    } else {
      stderr.write("tmt reviewer status control failed (unknown): unexpected runtime failure\n");
    }
    return 1;
  }
}

async function main() {
  loadTripdarEnv();
  let prisma: PrismaReadOnly & { $disconnect(): Promise<void> };
  try {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
  } catch {
    process.stderr.write(
      "tmt reviewer status control failed (prisma_client): Prisma client unavailable; run npx prisma generate\n",
    );
    process.exitCode = 1;
    return;
  }

  try {
    process.exitCode = await executeReviewerStatus({ prisma });
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  await main();
}
