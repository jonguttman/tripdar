import { describe, expect, it } from "vitest";
import {
  aggregateEmployeeGuidance,
  effectiveAssignmentStatus,
  hashReviewToken,
  pointsForReview,
  summarizeAssignments,
} from "./employeeReviews";

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
