import { describe, expect, it } from "vitest";

import { createSignal, deleteSignal, updateSignal } from "./service";
import { SignalImmutabilityError, SignalValidationError } from "./errors";
import type { PrismaClientLike, SignalRecord } from "./types";

function makeValidSignalInput(overrides: Partial<SignalRecord> = {}): SignalRecord {
  return {
    id: "sig_1",
    strainId: "strain_a",
    doseCategory: "MICRODOSE",
    scale: "MICRO",
    dimensionId: "Clarity",
    referenceFrame: "BASELINE",
    comparisonDose: null,
    comparisonStrainId: null,
    direction: "MORE",
    sessionId: "sess_1",
    reportId: "rep_1",
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makePrismaMock() {
  const calls: { data: SignalRecord }[] = [];
  const prisma: PrismaClientLike = {
    signal: {
      create: async ({ data }) => {
        calls.push({ data });
        return data;
      },
    },
  };
  return { prisma, calls };
}

describe("Tripdar Signal Service (Meaning Layer v1.0 guards)", () => {
  it("rejects missing required fields (collects multiple issues)", async () => {
    const { prisma, calls } = makePrismaMock();
    const badInput = { id: "sig_1" }; // missing many required fields

    await expect(createSignal(prisma, badInput)).rejects.toBeInstanceOf(SignalValidationError);
    expect(calls.length).toBe(0);
    try {
      await createSignal(prisma, badInput);
    } catch (e) {
      const err = e as SignalValidationError;
      expect(err.issues.length).toBeGreaterThan(1);
      expect(err.issues.some((i) => i.kind === "missing_field")).toBe(true);
    }
  });

  it("rejects invalid enum values", async () => {
    const { prisma, calls } = makePrismaMock();
    const badInput = makeValidSignalInput({ doseCategory: "MID" as any });

    await expect(createSignal(prisma, badInput)).rejects.toBeInstanceOf(SignalValidationError);
    expect(calls.length).toBe(0);
  });

  it("rejects forbidden extra fields via allow-list", async () => {
    const { prisma, calls } = makePrismaMock();
    const badInput = { ...makeValidSignalInput(), userId: "u_1" };

    await expect(createSignal(prisma, badInput)).rejects.toBeInstanceOf(SignalValidationError);
    expect(calls.length).toBe(0);
    try {
      await createSignal(prisma, badInput);
    } catch (e) {
      const err = e as SignalValidationError;
      expect(err.issues.some((i) => i.kind === "forbidden_field" && i.field === "userId")).toBe(true);
    }
  });

  it("enforces BASELINE conditional rules (comparison fields must be null)", async () => {
    const { prisma, calls } = makePrismaMock();
    const badInput = makeValidSignalInput({ comparisonDose: "LOW" });

    await expect(createSignal(prisma, badInput)).rejects.toBeInstanceOf(SignalValidationError);
    expect(calls.length).toBe(0);
  });

  it("enforces WITHIN_STRAIN conditional rules (comparisonDose required and differs)", async () => {
    const { prisma } = makePrismaMock();

    const missingComparison = makeValidSignalInput({
      referenceFrame: "WITHIN_STRAIN",
      comparisonDose: null,
      comparisonStrainId: null,
    });
    await expect(createSignal(prisma, missingComparison)).rejects.toBeInstanceOf(SignalValidationError);

    const sameDose = makeValidSignalInput({
      referenceFrame: "WITHIN_STRAIN",
      comparisonDose: "MICRODOSE",
      comparisonStrainId: null,
    });
    await expect(createSignal(prisma, sameDose)).rejects.toBeInstanceOf(SignalValidationError);
  });

  it("enforces CROSS_STRAIN conditional rules (comparisonStrainId required and differs)", async () => {
    const { prisma } = makePrismaMock();

    const missingComparison = makeValidSignalInput({
      referenceFrame: "CROSS_STRAIN",
      comparisonDose: null,
      comparisonStrainId: null,
    });
    await expect(createSignal(prisma, missingComparison)).rejects.toBeInstanceOf(SignalValidationError);

    const sameStrain = makeValidSignalInput({
      referenceFrame: "CROSS_STRAIN",
      comparisonDose: null,
      comparisonStrainId: "strain_a",
    });
    await expect(createSignal(prisma, sameStrain)).rejects.toBeInstanceOf(SignalValidationError);
  });

  it("persists via Prisma and freezes the returned Signal (immutability)", async () => {
    const { prisma, calls } = makePrismaMock();
    const input = makeValidSignalInput();

    const created = await createSignal(prisma, input);
    expect(calls.length).toBe(1);
    expect(Object.isFrozen(created)).toBe(true);

    expect(() => {
      // @ts-expect-error intentional immutability test
      created.direction = "LESS";
    }).toThrow();
  });

  it("updateSignal/deleteSignal throw immediately", () => {
    expect(() => updateSignal()).toThrow(SignalImmutabilityError);
    expect(() => deleteSignal()).toThrow(SignalImmutabilityError);
  });
});


