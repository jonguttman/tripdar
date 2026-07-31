/**
 * KEWL-2467 — tests for the strict prisma mock itself.
 *
 * This helper is load-bearing: every prisma-mocking suite now depends on it to turn a
 * missing stub into a visible failure. If it silently stopped throwing, all of them would
 * quietly lose that protection and nothing else would notice — which is the same class of
 * invisible-coverage-loss bug this ticket exists to close. So it gets pinned directly.
 *
 * Note each test drains the recorder for the misses it deliberately provokes; otherwise
 * the global `afterEach` in `src/test/setup.ts` would (correctly) fail these tests.
 */

import { describe, expect, it, vi } from "vitest";

import { createPrismaMock, drainUnstubbedPrismaAccesses } from "./prismaMock";

describe("createPrismaMock", () => {
  it("passes stubbed model methods through untouched", () => {
    const findFirst = vi.fn().mockReturnValue("row");
    const mock = createPrismaMock({ assignment: { findFirst } });

    expect(mock.assignment.findFirst()).toBe("row");
    expect(findFirst).toHaveBeenCalledOnce();
    // The caller's assertions target the original literal, so identity must survive.
    expect(mock.assignment.findFirst).toBe(findFirst);
    expect(drainUnstubbedPrismaAccesses()).toEqual([]);
  });

  it("throws by name when a model method is not stubbed", () => {
    const mock = createPrismaMock({ assignment: { findFirst: vi.fn() } });

    expect(() => (mock as { assignment: { findUnique: unknown } }).assignment.findUnique).toThrowError(
      /prisma\.assignment\.findUnique is not stubbed in this test/
    );
    expect(drainUnstubbedPrismaAccesses()).toEqual(["prisma.assignment.findUnique"]);
  });

  it("throws by name when the model itself is not stubbed", () => {
    const mock = createPrismaMock({ assignment: { findFirst: vi.fn() } });

    expect(() => (mock as { employee: unknown }).employee).toThrowError(
      /prisma\.employee is not stubbed in this test/
    );
    expect(drainUnstubbedPrismaAccesses()).toEqual(["prisma.employee"]);
  });

  it("labels the root so transaction clients read as `tx.model.method`", () => {
    const mock = createPrismaMock({ review: { create: vi.fn() } }, "tx");

    expect(() => (mock as { review: { update: unknown } }).review.update).toThrowError(
      /tx\.review\.update is not stubbed in this test/
    );
    expect(drainUnstubbedPrismaAccesses()).toEqual(["tx.review.update"]);
  });

  it("does not throw on speculative probes like `then`", async () => {
    const mock = createPrismaMock({ assignment: { findFirst: vi.fn() } });

    // Awaiting anything that touches the mock reads `.then`; a throw there would replace
    // the real failure with an unrelated one.
    expect(() => (mock as { then: unknown }).then).not.toThrow();
    await expect(Promise.resolve(mock)).resolves.toBeDefined();
    expect(drainUnstubbedPrismaAccesses()).toEqual([]);
  });

  it("records every distinct miss so the global hook can report them together", () => {
    const mock = createPrismaMock({ assignment: {} });

    expect(() => (mock as { assignment: { findFirst: unknown; update: unknown } }).assignment.findFirst).toThrow();
    expect(() => (mock as { assignment: { findFirst: unknown; update: unknown } }).assignment.update).toThrow();

    expect(drainUnstubbedPrismaAccesses()).toEqual([
      "prisma.assignment.findFirst",
      "prisma.assignment.update",
    ]);
    // Draining clears — a later test must not inherit an earlier test's misses.
    expect(drainUnstubbedPrismaAccesses()).toEqual([]);
  });
});
