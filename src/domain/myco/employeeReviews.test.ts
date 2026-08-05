import { describe, expect, it } from "vitest";
import {
  aggregateEmployeeGuidance,
  canonicalizeForDigest,
  digestCanonical,
  digestStaffReviewInviteRoster,
  effectiveAssignmentStatus,
  hashReviewToken,
  providerCredentialFingerprint,
  pointsForReview,
  summarizeAssignments,
  validateStaffReviewInviteSend,
  type StaffReviewInviteLiveStateForValidation,
  type StaffReviewInviteNoSendReason,
  type StaffReviewInviteSnapshotForValidation,
} from "./employeeReviews";

const SNAPSHOT_EXPIRES_AT = new Date("2026-08-20T12:00:00Z");

function validSnapshot(
  overrides: Partial<StaffReviewInviteSnapshotForValidation> = {}
): StaffReviewInviteSnapshotForValidation {
  return {
    batchId: "batch-a",
    batchStatus: "approved",
    recipientId: "recipient-a",
    recipientStatus: "pending",
    providerMessageId: null,
    assignmentId: "assignment-a",
    employeeId: "employee-a",
    accessTokenId: "access-token-a",
    catalogItemId: "catalog-a",
    partnerId: "partner-a",
    tokenHash: "assignment-token-hash-a",
    accessTokenHash: "access-token-hash-a",
    recipientEmailNormalized: "sage@example.com",
    expiresAt: SNAPSHOT_EXPIRES_AT,
    rosterDigest: digestStaffReviewInviteRoster([
      {
        employeeId: "employee-a",
        email: "sage@example.com",
        assignmentId: "assignment-a",
        accessTokenId: "access-token-a",
      },
    ]),
    sender: "Tripdar <noreply@tripd.ar>",
    subjectDigest: digestCanonical("Subject A"),
    htmlDigest: digestCanonical("<p>Body A</p>"),
    textDigest: digestCanonical("Body A"),
    linkDigest: digestCanonical("https://tripdar.test/review/myco/raw-token-a"),
    providerCredentialFingerprint: providerCredentialFingerprint("resend-key-a"),
    ...overrides,
  };
}

function validLive(
  overrides: Partial<StaffReviewInviteLiveStateForValidation> = {}
): StaffReviewInviteLiveStateForValidation {
  return {
    providerCredentialFingerprint: providerCredentialFingerprint("resend-key-a"),
    rosterDigest: validSnapshot().rosterDigest,
    sender: "Tripdar <noreply@tripd.ar>",
    subjectDigest: digestCanonical("Subject A"),
    htmlDigest: digestCanonical("<p>Body A</p>"),
    textDigest: digestCanonical("Body A"),
    linkDigest: digestCanonical("https://tripdar.test/review/myco/raw-token-a"),
    now: new Date("2026-08-05T12:00:00Z"),
    assignment: {
      id: "assignment-a",
      catalogItemId: "catalog-a",
      employeeId: "employee-a",
      accessTokenId: "access-token-a",
      tokenHash: "assignment-token-hash-a",
      status: "assigned",
      expiresAt: SNAPSHOT_EXPIRES_AT,
      submittedAt: null,
      accessToken: {
        id: "access-token-a",
        tokenHash: "access-token-hash-a",
        purpose: "staff_review",
        status: "active",
        partnerId: "partner-a",
        brandId: "brand-a",
        catalogItemId: "catalog-a",
        issuedToId: "employee-a",
        issuedToEmail: "sage@example.com",
        expiresAt: SNAPSHOT_EXPIRES_AT,
        revokedAt: null,
      },
      employee: {
        id: "employee-a",
        partnerId: "partner-a",
        email: "sage@example.com",
        active: true,
        optedOut: false,
      },
      catalogItem: {
        id: "catalog-a",
        partnerId: "partner-a",
        brandId: "brand-a",
      },
    },
    ...overrides,
  };
}

describe("employee review loop", () => {
  it("keeps not_familiar distinct from no response", () => {
    const now = new Date("2026-07-16T12:00:00Z");
    const summary = summarizeAssignments(
      [
        { status: "assigned", expiresAt: null },
        { status: "opened", expiresAt: null },
        { status: "not_familiar", expiresAt: null },
        { status: "submitted", expiresAt: null },
        { status: "assigned", expiresAt: new Date("2026-07-15T12:00:00Z") },
      ],
      now
    );

    expect(summary.assigned).toBe(5);
    expect(summary.submitted).toBe(1);
    expect(summary.notFamiliar).toBe(1);
    expect(summary.noResponse).toBe(3);
    expect(summary.overdue).toBe(1);
    expect(summary.responseRate).toBe(40);
  });

  it("does not convert submitted or unfamiliar assignments to overdue", () => {
    const now = new Date("2026-07-16T12:00:00Z");
    const past = new Date("2026-07-15T12:00:00Z");

    expect(effectiveAssignmentStatus("submitted", past, now)).toBe("submitted");
    expect(effectiveAssignmentStatus("not_familiar", past, now)).toBe("not_familiar");
    expect(effectiveAssignmentStatus("opened", past, now)).toBe("overdue");
  });

  it("uses stable token hashes without storing the raw token", () => {
    expect(hashReviewToken("token-a")).toBe(hashReviewToken("token-a"));
    expect(hashReviewToken("token-a")).not.toBe("token-a");
    expect(hashReviewToken("token-a")).not.toBe(hashReviewToken("token-b"));
  });

  it("canonicalizes digests independent of object key order", () => {
    expect(canonicalizeForDigest({ b: 2, a: { d: 4, c: 3 } })).toBe(
      canonicalizeForDigest({ a: { c: 3, d: 4 }, b: 2 })
    );
    expect(digestCanonical({ b: 2, a: 1 })).toBe(digestCanonical({ a: 1, b: 2 }));
  });

  it("uses stable roster and provider digests for invite-batch snapshots", () => {
    const rosterA = digestStaffReviewInviteRoster([
      { employeeId: "employee-b", email: "B@example.com" },
      { employeeId: "employee-a", email: "a@example.com" },
    ]);
    const rosterB = digestStaffReviewInviteRoster([
      { employeeId: "employee-a", email: "A@example.com" },
      { employeeId: "employee-b", email: "b@example.com" },
    ]);

    expect(rosterA).toBe(rosterB);
    expect(providerCredentialFingerprint("key-a")).toBe(providerCredentialFingerprint("key-a"));
    expect(providerCredentialFingerprint("key-a")).not.toBe(providerCredentialFingerprint("key-b"));
  });

  it("allows a current frozen invite recipient before the provider call", () => {
    expect(validateStaffReviewInviteSend(validSnapshot(), validLive())).toEqual({ ok: true });
  });

  it("fails closed for every approval snapshot drift condition before provider access", () => {
    const cases: {
      name: string;
      reason: StaffReviewInviteNoSendReason;
      editSnapshot?: (snapshot: StaffReviewInviteSnapshotForValidation) => void;
      editLive?: (live: StaffReviewInviteLiveStateForValidation) => void;
    }[] = [
      {
        name: "batch A superseded by later generation B",
        reason: "batch_not_current",
        editSnapshot: (snapshot) => {
          snapshot.batchStatus = "superseded";
        },
      },
      {
        name: "duplicate send state",
        reason: "duplicate_send",
        editSnapshot: (snapshot) => {
          snapshot.providerMessageId = "resend-message-a";
        },
      },
      {
        name: "missing provider credential",
        reason: "provider_credential_missing",
        editLive: (live) => {
          live.providerCredentialFingerprint = "missing";
        },
      },
      {
        name: "provider credential mismatch",
        reason: "provider_credential_mismatch",
        editLive: (live) => {
          live.providerCredentialFingerprint = providerCredentialFingerprint("resend-key-b");
        },
      },
      {
        name: "missing assignment",
        reason: "missing_assignment",
        editLive: (live) => {
          live.assignment = null;
        },
      },
      {
        name: "assignment token replaced",
        reason: "assignment_identity_mismatch",
        editLive: (live) => {
          if (live.assignment) live.assignment.tokenHash = "assignment-token-hash-b";
        },
      },
      {
        name: "assignment submitted",
        reason: "assignment_not_current",
        editLive: (live) => {
          if (live.assignment) live.assignment.status = "submitted";
        },
      },
      {
        name: "assignment expired",
        reason: "assignment_expired",
        editSnapshot: (snapshot) => {
          snapshot.expiresAt = new Date("2026-08-01T12:00:00Z");
        },
      },
      {
        name: "missing access token",
        reason: "missing_access_token",
        editLive: (live) => {
          if (live.assignment) live.assignment.accessToken = null;
        },
      },
      {
        name: "access token identity mismatch",
        reason: "access_token_identity_mismatch",
        editLive: (live) => {
          if (live.assignment?.accessToken) live.assignment.accessToken.issuedToEmail = "other@example.com";
        },
      },
      {
        name: "revoked access token",
        reason: "access_token_revoked",
        editLive: (live) => {
          if (live.assignment?.accessToken) live.assignment.accessToken.status = "revoked";
        },
      },
      {
        name: "expired access token",
        reason: "access_token_expired",
        editLive: (live) => {
          if (live.assignment?.accessToken) live.assignment.accessToken.expiresAt = new Date("2026-08-01T12:00:00Z");
        },
      },
      {
        name: "recipient email mismatch",
        reason: "recipient_mismatch",
        editLive: (live) => {
          if (live.assignment) live.assignment.employee.email = "other@example.com";
        },
      },
      {
        name: "inactive employee",
        reason: "employee_inactive",
        editLive: (live) => {
          if (live.assignment) live.assignment.employee.active = false;
        },
      },
      {
        name: "opted-out employee",
        reason: "opted_out",
        editLive: (live) => {
          if (live.assignment) live.assignment.employee.optedOut = true;
        },
      },
      {
        name: "catalog and employee partner mismatch",
        reason: "catalog_mismatch",
        editLive: (live) => {
          if (live.assignment) live.assignment.employee.partnerId = "partner-b";
        },
      },
      {
        name: "roster digest mismatch",
        reason: "roster_mismatch",
        editLive: (live) => {
          live.rosterDigest = digestStaffReviewInviteRoster([{ employeeId: "employee-b", email: "b@example.com" }]);
        },
      },
      {
        name: "sender mismatch",
        reason: "sender_mismatch",
        editLive: (live) => {
          live.sender = "Tripdar <other@tripd.ar>";
        },
      },
      {
        name: "subject mismatch",
        reason: "subject_mismatch",
        editLive: (live) => {
          live.subjectDigest = digestCanonical("Subject B");
        },
      },
      {
        name: "body mismatch",
        reason: "html_mismatch",
        editLive: (live) => {
          live.htmlDigest = digestCanonical("<p>Body B</p>");
        },
      },
      {
        name: "text mismatch",
        reason: "text_mismatch",
        editLive: (live) => {
          live.textDigest = digestCanonical("Body B");
        },
      },
      {
        name: "link mismatch",
        reason: "link_mismatch",
        editLive: (live) => {
          live.linkDigest = digestCanonical("https://tripdar.test/review/myco/raw-token-b");
        },
      },
    ];

    for (const testCase of cases) {
      const snapshot = validSnapshot();
      const live = validLive();
      testCase.editSnapshot?.(snapshot);
      testCase.editLive?.(live);

      expect(validateStaffReviewInviteSend(snapshot, live), testCase.name).toMatchObject({
        ok: false,
        reason: testCase.reason,
      });
    }
  });

  it("keeps scanner-safe send validation pure and does not mark links opened", () => {
    const live = validLive();
    const before = live.assignment?.accessToken?.status;

    expect(validateStaffReviewInviteSend(validSnapshot(), live)).toEqual({ ok: true });
    expect(live.assignment?.accessToken?.status).toBe(before);
  });

  it("rewards honest participation without tying points to effect direction", () => {
    expect(pointsForReview({ status: "not_familiar", opened: true, timely: true, complete: false })).toBe(4);
    expect(pointsForReview({ status: "submitted", opened: true, timely: true, complete: true })).toBe(8);
    expect(pointsForReview({ status: "submitted", opened: true, timely: true, complete: true })).toBe(
      pointsForReview({ status: "submitted", opened: true, timely: true, complete: true })
    );
  });

  it("requires enough known-product evidence before recommendation use", () => {
    const aggregate = aggregateEmployeeGuidance([
      {
        knowsProduct: true,
        clarityCognition: 80,
        moodSocial: 70,
        visualPattern: 55,
        somatic: 35,
        energyDirection: 75,
        depthDirection: 65,
        confidence: 4,
      },
      {
        knowsProduct: false,
        clarityCognition: null,
        moodSocial: null,
        visualPattern: null,
        somatic: null,
        energyDirection: null,
        depthDirection: null,
        confidence: null,
      },
    ]);

    expect(aggregate.sampleSize).toBe(1);
    expect(aggregate.recommendationReady).toBe(false);
    expect(aggregate.confidence).toBe("low");
  });

  it("lowers confidence when employee effect responses conflict", () => {
    const aggregate = aggregateEmployeeGuidance(
      [
        {
          knowsProduct: true,
          clarityCognition: 100,
          moodSocial: 100,
          visualPattern: 100,
          somatic: 100,
          energyDirection: 100,
          depthDirection: 100,
          confidence: 4,
        },
        {
          knowsProduct: true,
          clarityCognition: 0,
          moodSocial: 0,
          visualPattern: 0,
          somatic: 0,
          energyDirection: 0,
          depthDirection: 0,
          confidence: 4,
        },
        {
          knowsProduct: true,
          clarityCognition: 50,
          moodSocial: 50,
          visualPattern: 50,
          somatic: 50,
          energyDirection: 50,
          depthDirection: 50,
          confidence: 4,
        },
      ],
      { minSamples: 3, maxSpread: 0.45 }
    );

    expect(aggregate.sampleSize).toBe(3);
    expect(aggregate.spread).toBeGreaterThan(0.45);
    expect(aggregate.recommendationReady).toBe(false);
    expect(aggregate.confidence).toBe("low");
  });
});
