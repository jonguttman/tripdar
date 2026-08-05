import crypto from "crypto";
import { VIBE_KEYS, emptyVibeScores, type VibeKey, type VibeScores } from "./vibes";

export type EmployeeReviewStatus =
  | "assigned"
  | "opened"
  | "submitted"
  | "not_familiar"
  | "overdue"
  | "expired";

export interface EmployeeReviewAxes {
  clarityCognition: number | null;
  moodSocial: number | null;
  visualPattern: number | null;
  somatic: number | null;
  energyDirection: number | null;
  depthDirection: number | null;
}

export interface EmployeeReviewForAggregation extends EmployeeReviewAxes {
  knowsProduct: boolean;
  confidence: number | null;
}

const FIELD_BY_KEY: Record<VibeKey, keyof EmployeeReviewAxes> = {
  clarity_cognition: "clarityCognition",
  mood_social: "moodSocial",
  visual_pattern: "visualPattern",
  somatic: "somatic",
  energy_direction: "energyDirection",
  depth_direction: "depthDirection",
};

export function normalizeEmployeeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createReviewToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function hashReviewToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function hashUserAgent(userAgent: string | null): string | null {
  if (!userAgent) return null;
  return crypto.createHash("sha256").update(userAgent).digest("hex");
}

type CanonicalJson =
  | string
  | number
  | boolean
  | null
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

function canonicalValue(value: unknown): CanonicalJson {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const canonical: { [key: string]: CanonicalJson } = {};
    for (const key of Object.keys(record).sort()) {
      canonical[key] = canonicalValue(record[key]);
    }
    return canonical;
  }
  return String(value);
}

export function canonicalizeForDigest(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function digestCanonical(value: unknown): string {
  return `sha256:${crypto.createHash("sha256").update(canonicalizeForDigest(value)).digest("hex")}`;
}

export function providerCredentialFingerprint(apiKey = process.env.RESEND_API_KEY): string {
  return apiKey ? digestCanonical({ provider: "resend", apiKey }) : "missing";
}

export function digestStaffReviewInviteRoster(
  recipients: { employeeId: string; email: string; assignmentId?: string | null; accessTokenId?: string | null }[]
): string {
  return digestCanonical({
    recipients: recipients
      .map((recipient) => ({
        employeeId: recipient.employeeId,
        email: normalizeEmployeeEmail(recipient.email),
        assignmentId: recipient.assignmentId ?? null,
        accessTokenId: recipient.accessTokenId ?? null,
      }))
      .sort((left, right) => {
        const leftKey = `${left.employeeId}:${left.email}`;
        const rightKey = `${right.employeeId}:${right.email}`;
        return leftKey.localeCompare(rightKey);
      }),
  });
}

export interface StaffReviewInviteMessageArtifacts {
  sender: string;
  subject: string;
  html: string;
  text: string;
  link: string;
  subjectDigest: string;
  htmlDigest: string;
  textDigest: string;
  linkDigest: string;
}

export function buildStaffReviewInviteMessageArtifacts(input: {
  sender: string;
  partnerName: string;
  productName: string;
  link: string;
}): StaffReviewInviteMessageArtifacts {
  const subject = `Tripdar product guidance: ${input.productName}`;
  const html = `<p>${input.partnerName} is asking for your product guidance on <strong>${input.productName}</strong>.</p><p><a href="${input.link}">Open your review link</a></p><p>If you are not familiar enough with this product, that is a valid response.</p>`;
  const text = `${input.partnerName} is asking for your product guidance on ${input.productName}.\n\nOpen your review link: ${input.link}\n\nIf you are not familiar enough with this product, that is a valid response.`;
  return {
    sender: input.sender,
    subject,
    html,
    text,
    link: input.link,
    subjectDigest: digestCanonical(subject),
    htmlDigest: digestCanonical(html),
    textDigest: digestCanonical(text),
    linkDigest: digestCanonical(input.link),
  };
}

export type StaffReviewInviteNoSendReason =
  | "batch_not_current"
  | "duplicate_send"
  | "provider_credential_missing"
  | "provider_credential_mismatch"
  | "missing_assignment"
  | "assignment_identity_mismatch"
  | "assignment_not_current"
  | "assignment_expired"
  | "missing_access_token"
  | "access_token_identity_mismatch"
  | "access_token_revoked"
  | "access_token_expired"
  | "recipient_mismatch"
  | "employee_inactive"
  | "opted_out"
  | "catalog_mismatch"
  | "roster_mismatch"
  | "sender_mismatch"
  | "subject_mismatch"
  | "html_mismatch"
  | "text_mismatch"
  | "link_mismatch";

export interface StaffReviewInviteSnapshotForValidation {
  batchId: string;
  batchStatus: string;
  recipientId: string;
  recipientStatus: string;
  providerMessageId: string | null;
  assignmentId: string;
  employeeId: string;
  accessTokenId: string;
  catalogItemId: string;
  partnerId: string;
  tokenHash: string;
  accessTokenHash: string;
  recipientEmailNormalized: string;
  expiresAt: Date;
  rosterDigest: string;
  sender: string;
  subjectDigest: string;
  htmlDigest: string;
  textDigest: string;
  linkDigest: string;
  providerCredentialFingerprint: string;
}

export interface StaffReviewInviteLiveStateForValidation {
  providerCredentialFingerprint: string;
  rosterDigest: string;
  sender: string;
  subjectDigest: string;
  htmlDigest: string;
  textDigest: string;
  linkDigest: string;
  now?: Date;
  assignment: {
    id: string;
    catalogItemId: string;
    employeeId: string;
    accessTokenId: string | null;
    tokenHash: string;
    status: string;
    expiresAt: Date | null;
    submittedAt?: Date | null;
    accessToken: {
      id: string;
      tokenHash: string;
      purpose: string;
      status: string;
      partnerId: string;
      brandId?: string | null;
      catalogItemId?: string | null;
      issuedToId?: string | null;
      issuedToEmail?: string | null;
      expiresAt: Date | null;
      revokedAt?: Date | null;
    } | null;
    employee: {
      id: string;
      partnerId: string;
      email: string;
      active: boolean;
      optedOut: boolean;
    };
    catalogItem: {
      id: string;
      partnerId: string;
      brandId?: string | null;
    };
  } | null;
}

export type StaffReviewInviteValidation =
  | { ok: true }
  | { ok: false; reason: StaffReviewInviteNoSendReason; detail: Record<string, string | null> };

function invalid(
  reason: StaffReviewInviteNoSendReason,
  detail: Record<string, string | null> = {}
): StaffReviewInviteValidation {
  return { ok: false, reason, detail };
}

function dateIso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

export function validateStaffReviewInviteSend(
  snapshot: StaffReviewInviteSnapshotForValidation,
  live: StaffReviewInviteLiveStateForValidation
): StaffReviewInviteValidation {
  const now = live.now ?? new Date();
  if (!["approved", "sending", "partial"].includes(snapshot.batchStatus)) {
    return invalid("batch_not_current", { status: snapshot.batchStatus });
  }
  if (snapshot.providerMessageId || snapshot.recipientStatus === "sent") {
    return invalid("duplicate_send", {
      status: snapshot.recipientStatus,
      providerMessageId: snapshot.providerMessageId,
    });
  }
  if (snapshot.providerCredentialFingerprint === "missing" || live.providerCredentialFingerprint === "missing") {
    return invalid("provider_credential_missing");
  }
  if (snapshot.providerCredentialFingerprint !== live.providerCredentialFingerprint) {
    return invalid("provider_credential_mismatch");
  }
  const assignment = live.assignment;
  if (!assignment) return invalid("missing_assignment", { assignmentId: snapshot.assignmentId });
  if (
    assignment.id !== snapshot.assignmentId ||
    assignment.catalogItemId !== snapshot.catalogItemId ||
    assignment.employeeId !== snapshot.employeeId ||
    assignment.accessTokenId !== snapshot.accessTokenId ||
    assignment.tokenHash !== snapshot.tokenHash
  ) {
    return invalid("assignment_identity_mismatch", {
      assignmentId: assignment.id,
      accessTokenId: assignment.accessTokenId,
      tokenHash: assignment.tokenHash,
    });
  }
  if (isTerminalReviewStatus(assignment.status) || assignment.submittedAt) {
    return invalid("assignment_not_current", { status: assignment.status });
  }
  if (
    snapshot.expiresAt.getTime() <= now.getTime() ||
    (assignment.expiresAt && assignment.expiresAt.getTime() <= now.getTime())
  ) {
    return invalid("assignment_expired", {
      snapshotExpiresAt: dateIso(snapshot.expiresAt),
      assignmentExpiresAt: dateIso(assignment.expiresAt),
    });
  }
  const accessToken = assignment.accessToken;
  if (!accessToken) return invalid("missing_access_token", { accessTokenId: snapshot.accessTokenId });
  if (
    accessToken.id !== snapshot.accessTokenId ||
    accessToken.tokenHash !== snapshot.accessTokenHash ||
    accessToken.purpose !== "staff_review" ||
    accessToken.partnerId !== snapshot.partnerId ||
    accessToken.catalogItemId !== snapshot.catalogItemId ||
    accessToken.issuedToId !== snapshot.employeeId ||
    normalizeEmployeeEmail(accessToken.issuedToEmail ?? "") !== snapshot.recipientEmailNormalized
  ) {
    return invalid("access_token_identity_mismatch", {
      accessTokenId: accessToken.id,
      purpose: accessToken.purpose,
      issuedToId: accessToken.issuedToId ?? null,
      issuedToEmail: accessToken.issuedToEmail ?? null,
    });
  }
  if (accessToken.status !== "active" || accessToken.revokedAt) {
    return invalid("access_token_revoked", { status: accessToken.status });
  }
  if (accessToken.expiresAt && accessToken.expiresAt.getTime() <= now.getTime()) {
    return invalid("access_token_expired", { expiresAt: dateIso(accessToken.expiresAt) });
  }
  if (
    assignment.employee.id !== snapshot.employeeId ||
    normalizeEmployeeEmail(assignment.employee.email) !== snapshot.recipientEmailNormalized
  ) {
    return invalid("recipient_mismatch", {
      employeeId: assignment.employee.id,
      email: normalizeEmployeeEmail(assignment.employee.email),
    });
  }
  if (!assignment.employee.active) return invalid("employee_inactive");
  if (assignment.employee.optedOut) return invalid("opted_out");
  if (
    assignment.employee.partnerId !== snapshot.partnerId ||
    assignment.catalogItem.id !== snapshot.catalogItemId ||
    assignment.catalogItem.partnerId !== snapshot.partnerId ||
    accessToken.brandId !== (assignment.catalogItem.brandId ?? null)
  ) {
    return invalid("catalog_mismatch", {
      employeePartnerId: assignment.employee.partnerId,
      catalogPartnerId: assignment.catalogItem.partnerId,
      accessTokenBrandId: accessToken.brandId ?? null,
      catalogBrandId: assignment.catalogItem.brandId ?? null,
    });
  }
  if (snapshot.rosterDigest !== live.rosterDigest) return invalid("roster_mismatch");
  if (snapshot.sender !== live.sender) return invalid("sender_mismatch");
  if (snapshot.subjectDigest !== live.subjectDigest) return invalid("subject_mismatch");
  if (snapshot.htmlDigest !== live.htmlDigest) return invalid("html_mismatch");
  if (snapshot.textDigest !== live.textDigest) return invalid("text_mismatch");
  if (snapshot.linkDigest !== live.linkDigest) return invalid("link_mismatch");
  return { ok: true };
}

export function isTerminalReviewStatus(status: string): boolean {
  return status === "submitted" || status === "not_familiar" || status === "expired";
}

export function effectiveAssignmentStatus(
  status: string,
  expiresAt: Date | null,
  now = new Date()
): EmployeeReviewStatus {
  if (status === "submitted" || status === "not_familiar") return status;
  if (status === "expired") return "expired";
  if (expiresAt && expiresAt.getTime() < now.getTime()) return "overdue";
  if (status === "opened") return "opened";
  return "assigned";
}

export function pointsForReview(input: {
  status: "submitted" | "not_familiar";
  opened: boolean;
  timely: boolean;
  complete: boolean;
}): number {
  let points = input.opened ? 1 : 0;
  points += input.status === "not_familiar" ? 2 : 4;
  if (input.status === "submitted" && input.complete) points += 2;
  if (input.timely) points += 1;
  return points;
}

export interface ParticipationSummary {
  assigned: number;
  opened: number;
  submitted: number;
  notFamiliar: number;
  overdue: number;
  expired: number;
  noResponse: number;
  responseRate: number;
}

export function summarizeAssignments(
  assignments: { status: string; expiresAt: Date | null }[],
  now = new Date()
): ParticipationSummary {
  const summary: ParticipationSummary = {
    assigned: assignments.length,
    opened: 0,
    submitted: 0,
    notFamiliar: 0,
    overdue: 0,
    expired: 0,
    noResponse: 0,
    responseRate: 0,
  };

  for (const assignment of assignments) {
    const status = effectiveAssignmentStatus(assignment.status, assignment.expiresAt, now);
    if (status === "opened") summary.opened += 1;
    if (status === "submitted") summary.submitted += 1;
    if (status === "not_familiar") summary.notFamiliar += 1;
    if (status === "overdue") summary.overdue += 1;
    if (status === "expired") summary.expired += 1;
    if (status === "assigned" || status === "opened" || status === "overdue") summary.noResponse += 1;
  }

  const completed = summary.submitted + summary.notFamiliar;
  summary.responseRate = assignments.length === 0 ? 0 : Math.round((completed / assignments.length) * 100);
  return summary;
}

function sliderToAxis(value: number): number {
  return Math.max(-1, Math.min(1, (value - 50) / 50));
}

export interface EmployeeGuidanceAggregate {
  sampleSize: number;
  axisCounts: Record<VibeKey, number>;
  scores: VibeScores | null;
  confidence: "none" | "low" | "building" | "solid";
  spread: number | null;
  recommendationReady: boolean;
}

export function aggregateEmployeeGuidance(
  reviews: EmployeeReviewForAggregation[],
  options: { minSamples?: number; maxSpread?: number } = {}
): EmployeeGuidanceAggregate {
  const minSamples = options.minSamples ?? 3;
  const maxSpread = options.maxSpread ?? 0.45;
  const known = reviews.filter((review) => review.knowsProduct);
  const sums = emptyVibeScores();
  const squares = emptyVibeScores();
  const axisCounts = {} as Record<VibeKey, number>;
  for (const key of VIBE_KEYS) axisCounts[key] = 0;

  for (const review of known) {
    for (const key of VIBE_KEYS) {
      const raw = review[FIELD_BY_KEY[key]];
      if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
      const value = sliderToAxis(raw);
      sums[key] += value;
      squares[key] += value * value;
      axisCounts[key] += 1;
    }
  }

  const hasAxes = VIBE_KEYS.some((key) => axisCounts[key] > 0);
  if (!hasAxes) {
    return {
      sampleSize: known.length,
      axisCounts,
      scores: null,
      confidence: "none",
      spread: null,
      recommendationReady: false,
    };
  }

  const scores = emptyVibeScores();
  const deviations: number[] = [];
  for (const key of VIBE_KEYS) {
    const n = axisCounts[key];
    if (n === 0) continue;
    const mean = sums[key] / n;
    scores[key] = Math.round(mean * 100) / 100;
    if (n > 1) {
      const variance = Math.max(0, squares[key] / n - mean * mean);
      deviations.push(Math.sqrt(variance));
    }
  }

  const spread =
    deviations.length > 0
      ? Math.round((deviations.reduce((total, value) => total + value, 0) / deviations.length) * 100) / 100
      : null;
  const sampleSize = known.length;
  const agreementOk = spread === null || spread <= maxSpread;
  const confidence =
    sampleSize < minSamples ? "low" : sampleSize >= 8 && agreementOk ? "solid" : agreementOk ? "building" : "low";

  return {
    sampleSize,
    axisCounts,
    scores,
    confidence,
    spread,
    recommendationReady: sampleSize >= minSamples && agreementOk,
  };
}
